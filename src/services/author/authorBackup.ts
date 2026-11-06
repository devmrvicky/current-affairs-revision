// ─── Author Studio backup & restore (ZIP) ────────────────────────────────────
// A backup is an ordinary ZIP:
//   manifest.json   app id, format version, scope, counts, created-at
//   folders.json    folder paths + favourites + timestamps (so empty folders survive)
//   files.json      file paths + favourites + timestamps
//   bank/<path>     every question file, byte-for-byte, in its real folder hierarchy
//   imports.json    import history              (scope "full" only)
//   settings.json   studio settings             (scope "full" only)
//
// NEVER included: the Author Lock (salt, hash, iterations, attempt counters) or any other
// credential, and the Trash. Backups are built from an explicit allow-list of fields, not by
// dumping stores, so a credential cannot leak in by accident.
//
// Restore is: read → validate → preview (conflicts) → choose merge/replace → confirm → apply in
// ONE transaction (all or nothing) → report. Nothing is overwritten silently: merge resolves a
// conflict by the policy the author picked, and "replace everything" moves the existing bank to
// Trash first, so it can still be recovered.

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db';
import type { AuthorFile, AuthorFolder, AuthorImportRecord, AuthorSettingsRecord, ConflictPolicy } from '../../types/authorStudio';
import { cleanName, nameKey, uniqueName, utf8Size } from './authorNames';
import { summarizeValidation, validateQuestionFileText } from './authorValidation';
import { createZip, readZip, ZipError, type ZipEntry } from './authorZip';
import { getAuthorSettings, importRecord, isLive, liveFileNames, listAllFiles, listFolders, listImports, parentKeyOf, trashFileIn, trashFolderIn, withTx, MAX_FILE_BYTES } from './authorDb';

export type BackupScope = 'selection' | 'bank' | 'full';

export const BACKUP_APP_ID = 'examverse-author-studio';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupManifest {
  app: typeof BACKUP_APP_ID;
  formatVersion: number;
  createdAt: string;
  scope: BackupScope;
  counts: { folders: number; files: number };
  note: string;
}

interface BackupFolderMeta { path: string; favorite?: boolean; createdAt: number; updatedAt: number }
interface BackupFileMeta { path: string; favorite?: boolean; createdAt: number; updatedAt: number }
type BackupSettings = Pick<AuthorSettingsRecord, 'autoLockMinutes' | 'view'>;

const enc = new TextEncoder();
const json = (v: unknown) => enc.encode(JSON.stringify(v, null, 2));

// ─── Build ───────────────────────────────────────────────────────────────────

export interface BackupSelection {
  folderIds: string[];
  fileIds: string[];
}

export interface BuiltBackup {
  bytes: Uint8Array;
  manifest: BackupManifest;
  fileName: string;
}

export async function buildBackup(scope: BackupScope, selection?: BackupSelection, now: Date = new Date()): Promise<BuiltBackup> {
  const [allFolders, allFiles] = await Promise.all([listFolders(), listAllFiles()]);
  const folderById = new Map(allFolders.map((f) => [f.id, f] as const));

  const pathOfFolder = (id: string | null): string[] => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur = id;
    while (cur !== null && !seen.has(cur)) {
      seen.add(cur);
      const f = folderById.get(cur);
      if (!f) break;
      parts.unshift(f.name);
      cur = f.parentId;
    }
    return parts;
  };

  let folders: AuthorFolder[] = allFolders;
  let files: AuthorFile[] = allFiles;
  if (scope === 'selection') {
    const wantFolders = new Set<string>();
    const stack = [...(selection?.folderIds ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (wantFolders.has(id) || !folderById.has(id)) continue;
      wantFolders.add(id);
      for (const f of allFolders) if (f.parentId === id) stack.push(f.id);
    }
    const wantFiles = new Set(selection?.fileIds ?? []);
    files = allFiles.filter((f) => wantFiles.has(f.id) || (f.folderId !== null && wantFolders.has(f.folderId)));
    // Folders: the selected ones, plus the ancestors of everything included so the hierarchy is intact.
    const keep = new Set(wantFolders);
    for (const f of files) {
      let cur = f.folderId;
      while (cur !== null && !keep.has(cur)) { keep.add(cur); cur = folderById.get(cur)?.parentId ?? null; }
    }
    for (const id of [...wantFolders]) {
      let cur = folderById.get(id)?.parentId ?? null;
      while (cur !== null && !keep.has(cur)) { keep.add(cur); cur = folderById.get(cur)?.parentId ?? null; }
    }
    folders = allFolders.filter((f) => keep.has(f.id));
  }

  const db = await getDB();
  const entries: ZipEntry[] = [];
  const folderMeta: BackupFolderMeta[] = folders.map((f) => ({ path: pathOfFolder(f.id).join('/'), favorite: f.favorite || undefined, createdAt: f.createdAt, updatedAt: f.updatedAt }));
  const fileMeta: BackupFileMeta[] = [];
  for (const file of files) {
    const content = (await db.get('authorContent', file.id))?.content ?? '';
    const path = [...pathOfFolder(file.folderId), file.name].join('/');
    entries.push({ path: `bank/${path}`, data: enc.encode(content) });
    fileMeta.push({ path, favorite: file.favorite || undefined, createdAt: file.createdAt, updatedAt: file.updatedAt });
  }

  const manifest: BackupManifest = {
    app: BACKUP_APP_ID, formatVersion: BACKUP_FORMAT_VERSION, createdAt: now.toISOString(), scope,
    counts: { folders: folders.length, files: files.length },
    note: 'Question files, folders, favourites and (for a full backup) import history and settings. The Author Lock password/hash and the Trash are never included.',
  };
  const head: ZipEntry[] = [
    { path: 'manifest.json', data: json(manifest) },
    { path: 'folders.json', data: json(folderMeta) },
    { path: 'files.json', data: json(fileMeta) },
  ];
  if (scope === 'full') {
    const settings = await getAuthorSettings();
    const imports = (await listImports(10_000)).map((i) => ({ ...i }));
    head.push({ path: 'imports.json', data: json(imports) });
    head.push({ path: 'settings.json', data: json({ autoLockMinutes: settings.autoLockMinutes, view: settings.view } satisfies BackupSettings) });
  }

  const stamp = now.toISOString().slice(0, 10);
  return { bytes: createZip([...head, ...entries], now), manifest, fileName: `author-studio-${scope}-${stamp}.zip` };
}

// ─── Read & validate ─────────────────────────────────────────────────────────

export interface ParsedBackupFile extends BackupFileMeta {
  content: string;
}

export interface ParsedBackup {
  /** True when the archive cannot be restored at all (not a backup, damaged, or from a newer version). */
  fatal: boolean;
  manifest: BackupManifest | null;
  folders: BackupFolderMeta[];
  files: ParsedBackupFile[];
  imports: AuthorImportRecord[];
  settings?: BackupSettings;
  /** Problems that stop an individual entry being restored (the entry is skipped). */
  errors: string[];
  /** Things worth knowing that do not stop anything. */
  warnings: string[];
}

function failed(message: string): ParsedBackup {
  return { fatal: true, manifest: null, folders: [], files: [], imports: [], errors: [message], warnings: [] };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Checks a restore path segment by segment; returns the segments or null. */
function cleanPath(path: string): string[] | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const cleaned: string[] = [];
  for (const p of parts) {
    const c = cleanName(p);
    if (!c) return null;
    cleaned.push(c);
  }
  return cleaned;
}

export async function parseBackup(bytes: Uint8Array): Promise<ParsedBackup> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes);
  } catch (err) {
    return failed(err instanceof ZipError ? err.message : 'This file could not be read as a ZIP archive.');
  }
  const byPath = new Map(entries.map((e) => [e.path, e] as const));
  const text = (path: string) => {
    const e = byPath.get(path);
    return e ? new TextDecoder('utf-8').decode(e.data) : null;
  };

  const manifestText = text('manifest.json');
  if (manifestText === null) return failed('manifest.json is missing — this is not an Author Studio backup.');
  let manifest: BackupManifest;
  try {
    const m = JSON.parse(manifestText);
    if (!isRecord(m) || m.app !== BACKUP_APP_ID) return failed('This ZIP is not an Author Studio backup (wrong application id).');
    if (typeof m.formatVersion !== 'number' || m.formatVersion > BACKUP_FORMAT_VERSION) {
      return failed(`This backup uses format version ${String(m.formatVersion)}, which is newer than this app understands (${BACKUP_FORMAT_VERSION}). Update the app and try again.`);
    }
    manifest = m as unknown as BackupManifest;
  } catch {
    return failed('manifest.json is not valid JSON.');
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const readList = (name: string): unknown[] => {
    const t = text(name);
    if (t === null) return [];
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v;
      warnings.push(`${name} is not a list and was ignored.`);
    } catch {
      warnings.push(`${name} is not valid JSON and was ignored.`);
    }
    return [];
  };

  const folderMeta: BackupFolderMeta[] = [];
  for (const raw of readList('folders.json')) {
    const parts = isRecord(raw) && typeof raw.path === 'string' ? cleanPath(raw.path) : null;
    if (!parts) { warnings.push('A folder entry with an invalid path was ignored.'); continue; }
    folderMeta.push({ path: parts.join('/'), favorite: isRecord(raw) && raw.favorite === true ? true : undefined, createdAt: num((raw as Record<string, unknown>).createdAt, Date.now()), updatedAt: num((raw as Record<string, unknown>).updatedAt, Date.now()) });
  }
  const metaByPath = new Map<string, BackupFileMeta>();
  for (const raw of readList('files.json')) {
    const parts = isRecord(raw) && typeof raw.path === 'string' ? cleanPath(raw.path) : null;
    if (!parts) { warnings.push('A file entry with an invalid path was ignored.'); continue; }
    const r = raw as Record<string, unknown>;
    metaByPath.set(parts.join('/'), { path: parts.join('/'), favorite: r.favorite === true ? true : undefined, createdAt: num(r.createdAt, Date.now()), updatedAt: num(r.updatedAt, Date.now()) });
  }

  const files: ParsedBackupFile[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.path.startsWith('bank/')) continue;
    const rel = e.path.slice('bank/'.length);
    const parts = cleanPath(rel);
    if (!parts) { errors.push(`"${e.path}" has an invalid path and was skipped.`); continue; }
    if (!/\.json$/i.test(parts[parts.length - 1])) { warnings.push(`"${rel}" is not a .json file and was ignored.`); continue; }
    const norm = parts.join('/');
    const key = parts.map(nameKey).join('/');
    if (seen.has(key)) { errors.push(`"${rel}" appears twice (names differ only by letter case) — the second was skipped.`); continue; }
    if (e.data.length > MAX_FILE_BYTES) { errors.push(`"${rel}" is larger than ${MAX_FILE_BYTES / 1048576} MB and was skipped.`); continue; }
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(e.data); } catch { errors.push(`"${rel}" is not valid UTF-8 text and was skipped.`); continue; }
    seen.add(key);
    const meta = metaByPath.get(norm);
    files.push({ path: norm, content, favorite: meta?.favorite, createdAt: meta?.createdAt ?? Date.now(), updatedAt: meta?.updatedAt ?? Date.now() });
    if (!validateQuestionFileText(content).valid) warnings.push(`"${norm}" has validation problems (it will be restored as-is; open it in Author Studio to review).`);
  }
  for (const p of metaByPath.keys()) if (!files.some((f) => f.path === p)) warnings.push(`files.json lists "${p}" but its content is not in the archive.`);
  if (manifest.counts && typeof manifest.counts.files === 'number' && manifest.counts.files !== files.length + errors.filter((x) => x.startsWith('"bank/')).length) {
    warnings.push(`The manifest says ${manifest.counts.files} file(s) but ${files.length} could be read.`);
  }

  const imports: AuthorImportRecord[] = [];
  for (const raw of readList('imports.json')) {
    if (isRecord(raw) && typeof raw.id === 'string' && typeof raw.at === 'number' && typeof raw.label === 'string') imports.push(raw as unknown as AuthorImportRecord);
  }
  let settings: BackupSettings | undefined;
  const st = text('settings.json');
  if (st !== null) {
    try {
      const s = JSON.parse(st);
      if (isRecord(s) && typeof s.autoLockMinutes === 'number' && (s.view === 'list' || s.view === 'grid')) settings = { autoLockMinutes: Math.max(0, s.autoLockMinutes), view: s.view };
    } catch { warnings.push('settings.json could not be read and was ignored.'); }
  }
  // A credential has no business being in a backup. If one is there, refuse to touch it.
  for (const name of ['lock.json', 'auth.json', 'password.json']) if (byPath.has(name)) warnings.push(`${name} was found in the archive and was ignored — passwords are never restored from a backup.`);

  return { fatal: false, manifest, folders: folderMeta, files, imports, settings, errors, warnings };
}

// ─── Plan (preview) ──────────────────────────────────────────────────────────

export type RestoreMode = 'merge' | 'replace-all';

export interface RestorePlanItem {
  path: string;
  status: 'new' | 'identical' | 'conflict';
}

export interface RestorePlan {
  items: RestorePlanItem[];
  counts: { new: number; identical: number; conflict: number };
  newFolders: number;
  /** replace-all only: live top-level items that will be moved to Trash first. */
  willTrash: number;
}

export async function planRestore(parsed: ParsedBackup, mode: RestoreMode): Promise<RestorePlan> {
  const db = await getDB();
  const [folders, files] = await Promise.all([listFolders(), listAllFiles()]);
  const folderById = new Map(folders.map((f) => [f.id, f] as const));
  const pathOf = (f: AuthorFolder | AuthorFile): string => {
    const parts = [f.name];
    let cur: string | null = 'folderId' in f ? f.folderId : f.parentId;
    const seen = new Set<string>();
    while (cur !== null && !seen.has(cur)) { seen.add(cur); const p = folderById.get(cur); if (!p) break; parts.unshift(p.name); cur = p.parentId; }
    return parts.map(nameKey).join('/');
  };
  const existingFiles = new Map(files.map((f) => [pathOf(f), f] as const));
  const existingFolders = new Set(folders.map((f) => pathOf(f)));

  const items: RestorePlanItem[] = [];
  for (const f of parsed.files) {
    const key = f.path.split('/').map(nameKey).join('/');
    const hit = mode === 'replace-all' ? undefined : existingFiles.get(key);
    if (!hit) { items.push({ path: f.path, status: 'new' }); continue; }
    const existing = (await db.get('authorContent', hit.id))?.content ?? '';
    items.push({ path: f.path, status: existing === f.content ? 'identical' : 'conflict' });
  }

  const wantedFolders = new Set<string>();
  for (const f of parsed.folders) wantedFolders.add(f.path.split('/').map(nameKey).join('/'));
  for (const f of parsed.files) { const parts = f.path.split('/').slice(0, -1); for (let i = 1; i <= parts.length; i++) wantedFolders.add(parts.slice(0, i).map(nameKey).join('/')); }
  const newFolders = mode === 'replace-all' ? wantedFolders.size : [...wantedFolders].filter((p) => !existingFolders.has(p)).length;

  const counts = { new: 0, identical: 0, conflict: 0 };
  for (const i of items) counts[i.status]++;
  const willTrash = mode === 'replace-all' ? folders.filter((f) => f.parentId === null).length + files.filter((f) => f.folderId === null).length : 0;
  return { items, counts, newFolders, willTrash };
}

// ─── Apply (one transaction) ─────────────────────────────────────────────────

export interface RestoreOptions {
  mode: RestoreMode;
  /** How a file whose path already exists with different content is settled (merge mode). */
  policy: ConflictPolicy;
  /** Per-file overrides keyed by path. */
  overrides?: Record<string, ConflictPolicy>;
}

export interface RestoreResult {
  foldersCreated: number;
  filesAdded: number;
  filesReplaced: number;
  filesRenamed: number;
  filesSkipped: number;
  filesIdentical: number;
  trashedExisting: number;
}

export async function applyRestore(parsed: ParsedBackup, options: RestoreOptions): Promise<RestoreResult> {
  if (parsed.fatal) throw new ZipError('This backup cannot be restored.');
  // CPU-heavy work before the transaction opens.
  const prepared = parsed.files.map((f) => ({ f, size: utf8Size(f.content), validation: summarizeValidation(validateQuestionFileText(f.content)) }));

  return withTx(async (tx) => {
    const result: RestoreResult = { foldersCreated: 0, filesAdded: 0, filesReplaced: 0, filesRenamed: 0, filesSkipped: 0, filesIdentical: 0, trashedExisting: 0 };

    if (options.mode === 'replace-all') {
      // Recoverable: everything is moved to Trash, not destroyed.
      for (const f of (await tx.objectStore('authorFolders').index('by-parentId').getAll('')).filter(isLive)) result.trashedExisting += await trashFolderIn(tx, f.id);
      for (const f of (await tx.objectStore('authorFiles').index('by-folderId').getAll('')).filter(isLive)) { await trashFileIn(tx, f.id); result.trashedExisting++; }
    }

    const cache = new Map<string, string | null>([['', null]]); // lower-cased path → folder id
    const ensureFolder = async (segments: string[], meta?: BackupFolderMeta): Promise<string | null> => {
      let parentId: string | null = null;
      for (let i = 0; i < segments.length; i++) {
        const key = segments.slice(0, i + 1).map(nameKey).join('/');
        if (cache.has(key)) { parentId = cache.get(key)!; continue; }
        const siblings = (await tx.objectStore('authorFolders').index('by-parentId').getAll(parentKeyOf(parentId))).filter(isLive);
        const hit = siblings.find((s) => nameKey(s.name) === nameKey(segments[i]));
        if (hit) { parentId = hit.id; }
        else {
          const now = Date.now();
          const isLeaf = i === segments.length - 1 && meta;
          const folder: AuthorFolder = { id: uuidv4(), parentId, parentKey: parentKeyOf(parentId), name: segments[i], createdAt: isLeaf ? meta.createdAt : now, updatedAt: isLeaf ? meta.updatedAt : now, favorite: isLeaf ? meta.favorite : undefined };
          await tx.objectStore('authorFolders').put(folder);
          result.foldersCreated++;
          parentId = folder.id;
        }
        cache.set(key, parentId);
      }
      return parentId;
    };

    // Parents before children: otherwise a child would create its parent implicitly and the parent's favourite/timestamps would be lost.
    for (const fm of [...parsed.folders].sort((a, b) => a.path.split('/').length - b.path.split('/').length)) await ensureFolder(fm.path.split('/'), fm);

    for (const { f, size, validation } of prepared) {
      const segments = f.path.split('/');
      const fileName = segments[segments.length - 1];
      const folderId = await ensureFolder(segments.slice(0, -1));
      const rows = (await tx.objectStore('authorFiles').index('by-folderId').getAll(parentKeyOf(folderId))).filter(isLive);
      const clash = rows.find((r) => nameKey(r.name) === nameKey(fileName));

      if (clash) {
        const existing = (await tx.objectStore('authorContent').get(clash.id))?.content ?? '';
        if (existing === f.content) { result.filesIdentical++; continue; }
        const policy = options.overrides?.[f.path] ?? options.policy;
        if (policy === 'skip') { result.filesSkipped++; continue; }
        if (policy === 'replace') {
          await tx.objectStore('authorFiles').put({ ...clash, size, validation, updatedAt: Date.now(), favorite: clash.favorite || f.favorite });
          await tx.objectStore('authorContent').put({ id: clash.id, content: f.content });
          result.filesReplaced++;
          continue;
        }
      }
      const name = clash ? uniqueName(await liveFileNames(tx, folderId), fileName, { hasExt: true }) : fileName;
      const record: AuthorFile = { id: uuidv4(), folderId, folderKey: parentKeyOf(folderId), name, size, createdAt: f.createdAt, updatedAt: f.updatedAt, favorite: f.favorite, validation };
      await tx.objectStore('authorFiles').put(record);
      await tx.objectStore('authorContent').put({ id: record.id, content: f.content });
      if (clash) result.filesRenamed++; else result.filesAdded++;
    }

    for (const imp of parsed.imports) if (!(await tx.objectStore('authorImports').get(imp.id))) await tx.objectStore('authorImports').put(imp);
    await tx.objectStore('authorImports').put(importRecord('backup-restore', parsed.manifest ? `Backup ${parsed.manifest.createdAt.slice(0, 10)}` : 'Backup', {
      added: result.filesAdded, skipped: result.filesSkipped + result.filesIdentical, renamed: result.filesRenamed, replaced: result.filesReplaced,
      notes: options.mode === 'replace-all' ? [`Existing bank moved to Trash (${result.trashedExisting} items)`] : undefined,
    }));

    if (options.mode === 'replace-all' && parsed.settings) {
      // Studio settings only (view, auto-lock time). The Author Lock record is a different key and is never touched.
      const current = await tx.objectStore('authorMeta').get('settings');
      const base: AuthorSettingsRecord = current && current.key === 'settings' ? current : { key: 'settings', autoLockMinutes: 5, view: 'list' };
      await tx.objectStore('authorMeta').put({ ...base, ...parsed.settings, key: 'settings' });
    }
    return result;
  });
}
