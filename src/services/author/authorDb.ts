// ─── Author Studio storage ───────────────────────────────────────────────────
// Folders, files, trash, import history and settings, all in the app's existing
// IndexedDB database (new stores added by the v12 migration in services/db.ts).
//
// PRIVATE BY CONSTRUCTION: these stores are read and written only from this folder
// and the Author Studio screens. The public question pipeline never touches them
// (enforced by services/author/isolation.test.ts), and nothing here is synced.
//
// TRANSACTIONS: every multi-record change runs in ONE readwrite transaction over the
// stores it needs and awaits only IndexedDB requests inside it. (A transaction
// auto-commits the moment nothing is pending — awaiting a hash or a validation inside
// one would leave later writes on a dead transaction.) So CPU-heavy work is done first,
// and a failure inside aborts the whole change: nothing is left half-applied.
//
// FILE CONTENT lives in its own store (authorContent). Lists, the dashboard and Trash
// read only the small metadata records and never load question text.

import { v4 as uuidv4 } from 'uuid';
import type { IDBPTransaction } from 'idb';
import { getDB, type AppDB } from '../db';
import type { AuthorFile, AuthorFolder, AuthorImportRecord, AuthorSettingsRecord, ConflictPolicy } from '../../types/authorStudio';
import { cleanName, ensureJsonName, nameKey, uniqueName, utf8Size, wouldCreateCycle } from './authorNames';
import { summarizeValidation, validateQuestionFileText } from './authorValidation';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type AuthorErrorCode =
  | 'not-found' | 'name-conflict' | 'invalid-name' | 'cycle' | 'quota' | 'too-large'
  | 'in-trash' | 'not-in-trash' | 'not-json';

export class AuthorError extends Error {
  code: AuthorErrorCode;
  constructor(code: AuthorErrorCode, message: string) {
    super(message);
    this.name = 'AuthorError';
    this.code = code;
  }
}

type Stores = ['authorFolders', 'authorFiles', 'authorContent', 'authorImports', 'authorMeta'];
export type Tx = IDBPTransaction<AppDB, Stores, 'readwrite'>;

function isQuotaError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'QuotaExceededError';
}

/**
 * Runs `work` inside one readwrite transaction over all Author stores.
 *  • success  → waits for the commit, returns the result
 *  • any throw → ABORTS the transaction, so writes made before the failure are rolled back
 *    (without the abort, IndexedDB would commit whatever had been written so far)
 *  • "storage full" → reported as a plain-language AuthorError
 */
export async function withTx<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(['authorFolders', 'authorFiles', 'authorContent', 'authorImports', 'authorMeta'], 'readwrite');
  try {
    const result = await work(tx);
    await tx.done;
    return result;
  } catch (err) {
    try { tx.abort(); } catch { /* the transaction had already finished */ }
    tx.done.catch(() => undefined);
    if (isQuotaError(err) || isQuotaError(tx.error)) {
      throw new AuthorError('quota', 'Browser storage is full. Export a backup, then free space (empty the Trash or delete files) and try again.');
    }
    throw err;
  }
}

export const parentKeyOf = (parentId: string | null) => parentId ?? '';
const BAD_FOLDER_NAME = 'Folder names cannot be empty, contain / or \\, or be longer than 120 characters.';
const BAD_FILE_NAME = 'File names cannot be empty, contain / or \\, or be longer than 120 characters.';

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getFolder(id: string): Promise<AuthorFolder | undefined> {
  return (await getDB()).get('authorFolders', id);
}

export async function getFile(id: string): Promise<AuthorFile | undefined> {
  return (await getDB()).get('authorFiles', id);
}

export async function getFileContent(id: string): Promise<string | undefined> {
  return (await (await getDB()).get('authorContent', id))?.content;
}

/** Every live (not trashed) folder — for the tree and the "move to…" pickers. Folders are tiny, so this is cheap. */
export async function listFolders(): Promise<AuthorFolder[]> {
  return (await (await getDB()).getAll('authorFolders')).filter((f) => !f.deletedAt);
}

export async function listChildren(parentId: string | null): Promise<{ folders: AuthorFolder[]; files: AuthorFile[] }> {
  const db = await getDB();
  const key = parentKeyOf(parentId);
  const [folders, files] = await Promise.all([db.getAllFromIndex('authorFolders', 'by-parentId', key), db.getAllFromIndex('authorFiles', 'by-folderId', key)]);
  return { folders: folders.filter((f) => !f.deletedAt), files: files.filter((f) => !f.deletedAt) };
}

export async function listAllFiles(): Promise<AuthorFile[]> {
  return (await (await getDB()).getAll('authorFiles')).filter((f) => !f.deletedAt);
}

/** Folder chain from the top level down to `folderId`, inclusive. Empty for the top level itself. */
export async function getBreadcrumb(folderId: string | null): Promise<AuthorFolder[]> {
  const db = await getDB();
  const chain: AuthorFolder[] = [];
  const seen = new Set<string>();
  let cursor = folderId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = await db.get('authorFolders', cursor);
    if (!folder) break;
    chain.unshift(folder);
    cursor = folder.parentId;
  }
  return chain;
}

// ─── Internals shared by the write operations ────────────────────────────────

async function requireLiveFolder(tx: Tx, id: string | null): Promise<void> {
  if (id === null) return;
  const f = await tx.objectStore('authorFolders').get(id);
  if (!f) throw new AuthorError('not-found', 'That folder no longer exists.');
  if (f.deletedAt) throw new AuthorError('in-trash', 'That folder is in the Trash. Restore it first.');
}

export async function liveFolderNames(tx: Tx, parentId: string | null, exceptId?: string): Promise<string[]> {
  const rows = await tx.objectStore('authorFolders').index('by-parentId').getAll(parentKeyOf(parentId));
  return rows.filter((f) => !f.deletedAt && f.id !== exceptId).map((f) => f.name);
}

export async function liveFileNames(tx: Tx, folderId: string | null, exceptId?: string): Promise<string[]> {
  const rows = await tx.objectStore('authorFiles').index('by-folderId').getAll(parentKeyOf(folderId));
  return rows.filter((f) => !f.deletedAt && f.id !== exceptId).map((f) => f.name);
}

interface Subtree {
  folders: AuthorFolder[]; // includes the root, first
  files: AuthorFile[];
}

/** The folder and everything beneath it that `include` accepts. Walks child indexes breadth-first. */
export async function collectSubtree(tx: Tx, rootId: string, include: (item: AuthorFolder | AuthorFile) => boolean): Promise<Subtree> {
  const root = await tx.objectStore('authorFolders').get(rootId);
  if (!root) throw new AuthorError('not-found', 'That folder no longer exists.');
  const folders: AuthorFolder[] = [root];
  const files: AuthorFile[] = [];
  const seen = new Set<string>([rootId]);
  for (let i = 0; i < folders.length; i++) {
    const key = folders[i].id;
    for (const f of await tx.objectStore('authorFiles').index('by-folderId').getAll(key)) if (include(f)) files.push(f);
    for (const sub of await tx.objectStore('authorFolders').index('by-parentId').getAll(key)) {
      if (!seen.has(sub.id) && include(sub)) { seen.add(sub.id); folders.push(sub); }
    }
  }
  return { folders, files };
}

export const isLive = (x: { deletedAt?: number }) => !x.deletedAt;

// ─── Folders ─────────────────────────────────────────────────────────────────

export async function createFolder(parentId: string | null, rawName: string): Promise<AuthorFolder> {
  const name = cleanName(rawName);
  if (!name) throw new AuthorError('invalid-name', BAD_FOLDER_NAME);
  return withTx(async (tx) => {
    await requireLiveFolder(tx, parentId);
    if ((await liveFolderNames(tx, parentId)).some((n) => nameKey(n) === nameKey(name))) throw new AuthorError('name-conflict', `A folder named "${name}" already exists here.`);
    const now = Date.now();
    const folder: AuthorFolder = { id: uuidv4(), parentId, parentKey: parentKeyOf(parentId), name, createdAt: now, updatedAt: now };
    await tx.objectStore('authorFolders').put(folder);
    await tx.done;
    return folder;
  });
}

export async function renameFolder(id: string, rawName: string): Promise<AuthorFolder> {
  const name = cleanName(rawName);
  if (!name) throw new AuthorError('invalid-name', BAD_FOLDER_NAME);
  return withTx(async (tx) => {
    const folder = await tx.objectStore('authorFolders').get(id);
    if (!folder) throw new AuthorError('not-found', 'That folder no longer exists.');
    if (folder.deletedAt) throw new AuthorError('in-trash', 'Restore the folder before renaming it.');
    if ((await liveFolderNames(tx, folder.parentId, id)).some((n) => nameKey(n) === nameKey(name))) throw new AuthorError('name-conflict', `A folder named "${name}" already exists here.`);
    const next = { ...folder, name, updatedAt: Date.now() };
    await tx.objectStore('authorFolders').put(next);
    await tx.done;
    return next;
  });
}

export async function moveFolder(id: string, newParentId: string | null): Promise<AuthorFolder> {
  return withTx(async (tx) => {
    const store = tx.objectStore('authorFolders');
    const folder = await store.get(id);
    if (!folder) throw new AuthorError('not-found', 'That folder no longer exists.');
    if (folder.deletedAt) throw new AuthorError('in-trash', 'Restore the folder before moving it.');
    await requireLiveFolder(tx, newParentId);
    const all = new Map((await store.getAll()).map((f) => [f.id, f] as const));
    if (wouldCreateCycle(all, id, newParentId)) throw new AuthorError('cycle', 'A folder cannot be moved into itself or one of its own subfolders.');
    if (folder.parentId === newParentId) { await tx.done; return folder; }
    const name = uniqueName(await liveFolderNames(tx, newParentId), folder.name);
    const next = { ...folder, name, parentId: newParentId, parentKey: parentKeyOf(newParentId), updatedAt: Date.now() };
    await store.put(next);
    await tx.done;
    return next;
  });
}

/** Deep-copies the live contents of a folder into `targetParentId` with brand-new ids. The original is untouched. */
export async function copyFolder(id: string, targetParentId: string | null, style: 'number' | 'copy' = 'number'): Promise<AuthorFolder> {
  return withTx(async (tx) => {
    await requireLiveFolder(tx, targetParentId);
    const { folders, files } = await collectSubtree(tx, id, isLive); // snapshot first — copying into itself can't recurse
    if (folders[0].deletedAt) throw new AuthorError('in-trash', 'Restore the folder before copying it.');
    const now = Date.now();
    const idMap = new Map<string, string>(folders.map((f) => [f.id, uuidv4()] as const));
    const rootName = uniqueName(await liveFolderNames(tx, targetParentId), folders[0].name, { style });

    let rootCopy!: AuthorFolder;
    for (const f of folders) {
      const isRoot = f.id === id;
      const parentId = isRoot ? targetParentId : idMap.get(f.parentId!)!;
      const copy: AuthorFolder = { id: idMap.get(f.id)!, parentId, parentKey: parentKeyOf(parentId), name: isRoot ? rootName : f.name, createdAt: now, updatedAt: now };
      if (isRoot) rootCopy = copy;
      await tx.objectStore('authorFolders').put(copy);
    }
    for (const file of files) {
      const content = await tx.objectStore('authorContent').get(file.id);
      const newId = uuidv4();
      const folderId = idMap.get(file.folderId!)!;
      await tx.objectStore('authorFiles').put({ ...file, id: newId, folderId, folderKey: folderId, favorite: false, createdAt: now, updatedAt: now, lastOpenedAt: undefined });
      await tx.objectStore('authorContent').put({ id: newId, content: content?.content ?? '' });
    }
    await tx.done;
    return rootCopy;
  });
}

export async function duplicateFolder(id: string): Promise<AuthorFolder> {
  const folder = await getFolder(id);
  if (!folder) throw new AuthorError('not-found', 'That folder no longer exists.');
  return copyFolder(id, folder.parentId, 'copy');
}

export async function setFolderFavorite(id: string, favorite: boolean): Promise<void> {
  const db = await getDB();
  const f = await db.get('authorFolders', id);
  if (!f) throw new AuthorError('not-found', 'That folder no longer exists.');
  await db.put('authorFolders', { ...f, favorite });
}

export async function setFileFavorite(id: string, favorite: boolean): Promise<void> {
  const db = await getDB();
  const f = await db.get('authorFiles', id);
  if (!f) throw new AuthorError('not-found', 'That file no longer exists.');
  await db.put('authorFiles', { ...f, favorite });
}

// ─── Trash (soft delete) ─────────────────────────────────────────────────────

/** Moves a folder and everything live beneath it to Trash. Returns how many items went. Nothing is destroyed. */
export async function trashFolderIn(tx: Tx, id: string): Promise<number> {
  const { folders, files } = await collectSubtree(tx, id, isLive);
  if (folders[0].deletedAt) return 0;
  const now = Date.now();
  for (const f of folders) {
    await tx.objectStore('authorFolders').put({ ...f, deletedAt: now, trashRootId: id, ...(f.id === id ? { trashOriginalParentId: f.parentId } : {}) });
  }
  for (const file of files) {
    await tx.objectStore('authorFiles').put({ ...file, deletedAt: now, trashRootId: id });
  }
  return folders.length + files.length;
}

export async function trashFolder(id: string): Promise<number> {
  return withTx((tx) => trashFolderIn(tx, id));
}

/**
 * Restores a trashed folder with its whole subtree (everything trashed together with it).
 * It returns to its original parent when that still exists, otherwise to the top level; a name
 * clash is resolved by renaming, never by overwriting.
 */
export async function restoreFolder(id: string): Promise<{ restored: number; movedToTopLevel: boolean }> {
  return withTx(async (tx) => {
    const root = await tx.objectStore('authorFolders').get(id);
    if (!root) throw new AuthorError('not-found', 'That folder no longer exists.');
    if (!root.deletedAt || root.trashRootId !== id) throw new AuthorError('not-in-trash', 'That folder is not in the Trash.');

    const originalParent = root.trashOriginalParentId ?? null;
    let parentId = originalParent;
    if (parentId !== null) {
      const p = await tx.objectStore('authorFolders').get(parentId);
      if (!p || p.deletedAt) parentId = null;
    }
    const name = uniqueName(await liveFolderNames(tx, parentId), root.name);
    const { folders, files } = await collectSubtree(tx, id, (x) => x.trashRootId === id);
    for (const f of folders) {
      const base = { ...f, deletedAt: undefined, trashRootId: undefined, trashOriginalParentId: undefined };
      await tx.objectStore('authorFolders').put(f.id === id ? { ...base, name, parentId, parentKey: parentKeyOf(parentId), updatedAt: Date.now() } : base);
    }
    for (const file of files) await tx.objectStore('authorFiles').put({ ...file, deletedAt: undefined, trashRootId: undefined, trashOriginalFolderId: undefined });
    await tx.done;
    return { restored: folders.length + files.length, movedToTopLevel: originalParent !== null && parentId === null };
  });
}

export async function trashFileIn(tx: Tx, id: string): Promise<void> {
  const file = await tx.objectStore('authorFiles').get(id);
  if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
  if (!file.deletedAt) await tx.objectStore('authorFiles').put({ ...file, deletedAt: Date.now(), trashRootId: id, trashOriginalFolderId: file.folderId });
}

export async function trashFile(id: string): Promise<void> {
  return withTx((tx) => trashFileIn(tx, id));
}

export async function restoreFile(id: string): Promise<{ movedToTopLevel: boolean }> {
  return withTx(async (tx) => {
    const file = await tx.objectStore('authorFiles').get(id);
    if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
    if (!file.deletedAt || file.trashRootId !== id) throw new AuthorError('not-in-trash', 'That file is not in the Trash.');
    const originalFolder = file.trashOriginalFolderId ?? null;
    let folderId = originalFolder;
    if (folderId !== null) {
      const f = await tx.objectStore('authorFolders').get(folderId);
      if (!f || f.deletedAt) folderId = null;
    }
    const name = uniqueName(await liveFileNames(tx, folderId), file.name, { hasExt: true });
    await tx.objectStore('authorFiles').put({ ...file, name, folderId, folderKey: parentKeyOf(folderId), deletedAt: undefined, trashRootId: undefined, trashOriginalFolderId: undefined, updatedAt: Date.now() });
    await tx.done;
    return { movedToTopLevel: originalFolder !== null && folderId === null };
  });
}

export interface TrashEntry {
  kind: 'folder' | 'file';
  id: string;
  name: string;
  deletedAt: number;
  /** For folders: how many items were trashed with it (itself included). */
  itemCount: number;
  size?: number;
}

/** Top-level Trash entries only (the roots of each deletion), newest first. */
export async function listTrash(): Promise<TrashEntry[]> {
  const db = await getDB();
  const [folders, files] = await Promise.all([db.getAll('authorFolders'), db.getAll('authorFiles')]);
  const counts = new Map<string, number>();
  for (const x of [...folders, ...files]) if (x.deletedAt && x.trashRootId) counts.set(x.trashRootId, (counts.get(x.trashRootId) ?? 0) + 1);
  const entries: TrashEntry[] = [];
  for (const f of folders) if (f.deletedAt && f.trashRootId === f.id) entries.push({ kind: 'folder', id: f.id, name: f.name, deletedAt: f.deletedAt, itemCount: counts.get(f.id) ?? 1 });
  for (const f of files) if (f.deletedAt && f.trashRootId === f.id) entries.push({ kind: 'file', id: f.id, name: f.name, deletedAt: f.deletedAt, itemCount: 1, size: f.size });
  return entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

/**
 * Permanently deletes Trash entries (the only place data is ever destroyed). Refuses anything not in
 * Trash, so a live file can never be purged by mistake.
 */
export async function purgeFromTrash(entries: { kind: 'folder' | 'file'; id: string }[]): Promise<number> {
  return withTx(async (tx) => {
    let removed = 0;
    for (const e of entries) {
      if (e.kind === 'file') {
        const file = await tx.objectStore('authorFiles').get(e.id);
        if (!file || !file.deletedAt) continue;
        await tx.objectStore('authorFiles').delete(e.id);
        await tx.objectStore('authorContent').delete(e.id);
        removed++;
      } else {
        const root = await tx.objectStore('authorFolders').get(e.id);
        if (!root || !root.deletedAt) continue;
        const { folders, files } = await collectSubtree(tx, e.id, (x) => x.trashRootId === e.id);
        for (const f of files) { await tx.objectStore('authorFiles').delete(f.id); await tx.objectStore('authorContent').delete(f.id); removed++; }
        for (const f of folders) { await tx.objectStore('authorFolders').delete(f.id); removed++; }
      }
    }
    await tx.done;
    return removed;
  });
}

export async function emptyTrash(): Promise<number> {
  const entries = await listTrash();
  return purgeFromTrash(entries.map((e) => ({ kind: e.kind, id: e.id })));
}

// ─── Files ───────────────────────────────────────────────────────────────────

function checkContentSize(content: string): number {
  const size = utf8Size(content);
  if (size > MAX_FILE_BYTES) throw new AuthorError('too-large', `That file is ${(size / 1048576).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1048576} MB.`);
  return size;
}

function buildFileRecord(base: Pick<AuthorFile, 'id' | 'folderId' | 'name' | 'createdAt'> & Partial<AuthorFile>, content: string, size: number, now: number): AuthorFile {
  return { ...base, folderKey: parentKeyOf(base.folderId), size, updatedAt: now, validation: summarizeValidation(validateQuestionFileText(content), now) };
}

export async function createFile(folderId: string | null, rawName: string, content: string): Promise<AuthorFile> {
  const cleaned = cleanName(rawName);
  if (!cleaned) throw new AuthorError('invalid-name', BAD_FILE_NAME);
  const name = ensureJsonName(cleaned);
  const size = checkContentSize(content);
  const now = Date.now();
  const record = buildFileRecord({ id: uuidv4(), folderId, name, createdAt: now }, content, size, now); // validate BEFORE the transaction
  return withTx(async (tx) => {
    await requireLiveFolder(tx, folderId);
    if ((await liveFileNames(tx, folderId)).some((n) => nameKey(n) === nameKey(name))) throw new AuthorError('name-conflict', `A file named "${name}" already exists here.`);
    await tx.objectStore('authorFiles').put(record);
    await tx.objectStore('authorContent').put({ id: record.id, content });
    await tx.objectStore('authorImports').put(importRecord('create', name, { added: 1 }));
    await tx.done;
    return record;
  });
}

/** Saves edited content. Revalidates and refreshes the cached summary; the file's id, name and location are unchanged. */
export async function updateFileContent(id: string, content: string): Promise<AuthorFile> {
  const size = checkContentSize(content);
  const now = Date.now();
  const validation = summarizeValidation(validateQuestionFileText(content), now);
  return withTx(async (tx) => {
    const file = await tx.objectStore('authorFiles').get(id);
    if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
    if (file.deletedAt) throw new AuthorError('in-trash', 'Restore the file before editing it.');
    const next = { ...file, size, validation, updatedAt: now };
    await tx.objectStore('authorFiles').put(next);
    await tx.objectStore('authorContent').put({ id, content });
    await tx.done;
    return next;
  });
}

export async function renameFile(id: string, rawName: string): Promise<AuthorFile> {
  const cleaned = cleanName(rawName);
  if (!cleaned) throw new AuthorError('invalid-name', BAD_FILE_NAME);
  const name = ensureJsonName(cleaned);
  return withTx(async (tx) => {
    const file = await tx.objectStore('authorFiles').get(id);
    if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
    if (file.deletedAt) throw new AuthorError('in-trash', 'Restore the file before renaming it.');
    if ((await liveFileNames(tx, file.folderId, id)).some((n) => nameKey(n) === nameKey(name))) throw new AuthorError('name-conflict', `A file named "${name}" already exists here.`);
    const next = { ...file, name, updatedAt: Date.now() };
    await tx.objectStore('authorFiles').put(next);
    await tx.done;
    return next;
  });
}

export async function moveFile(id: string, folderId: string | null): Promise<AuthorFile> {
  return withTx(async (tx) => {
    const file = await tx.objectStore('authorFiles').get(id);
    if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
    if (file.deletedAt) throw new AuthorError('in-trash', 'Restore the file before moving it.');
    await requireLiveFolder(tx, folderId);
    if (file.folderId === folderId) { await tx.done; return file; }
    const name = uniqueName(await liveFileNames(tx, folderId), file.name, { hasExt: true });
    const next = { ...file, name, folderId, folderKey: parentKeyOf(folderId), updatedAt: Date.now() };
    await tx.objectStore('authorFiles').put(next);
    await tx.done;
    return next;
  });
}

export async function copyFile(id: string, folderId: string | null, style: 'number' | 'copy' = 'number'): Promise<AuthorFile> {
  return withTx(async (tx) => {
    const file = await tx.objectStore('authorFiles').get(id);
    if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
    if (file.deletedAt) throw new AuthorError('in-trash', 'Restore the file before copying it.');
    await requireLiveFolder(tx, folderId);
    const content = (await tx.objectStore('authorContent').get(id))?.content ?? '';
    const name = uniqueName(await liveFileNames(tx, folderId), file.name, { hasExt: true, style });
    const now = Date.now();
    const copy: AuthorFile = { ...file, id: uuidv4(), name, folderId, folderKey: parentKeyOf(folderId), favorite: false, createdAt: now, updatedAt: now, lastOpenedAt: undefined };
    await tx.objectStore('authorFiles').put(copy);
    await tx.objectStore('authorContent').put({ id: copy.id, content });
    await tx.objectStore('authorImports').put(importRecord('duplicate', name, { added: 1 }));
    await tx.done;
    return copy;
  });
}

export async function duplicateFile(id: string): Promise<AuthorFile> {
  const file = await getFile(id);
  if (!file) throw new AuthorError('not-found', 'That file no longer exists.');
  return copyFile(id, file.folderId, 'copy');
}

export async function touchFileOpened(id: string): Promise<void> {
  const db = await getDB();
  const f = await db.get('authorFiles', id);
  if (f && !f.deletedAt) await db.put('authorFiles', { ...f, lastOpenedAt: Date.now() });
}

// ─── Import (with explicit conflict handling) ────────────────────────────────

export interface ImportItem {
  name: string;
  content: string;
}

export interface ImportOutcome {
  name: string;
  outcome: 'added' | 'skipped' | 'renamed' | 'replaced' | 'failed';
  finalName?: string;
  reason?: string;
}

export interface ImportResult {
  outcomes: ImportOutcome[];
  added: number;
  skipped: number;
  renamed: number;
  replaced: number;
  failed: number;
}

export function importRecord(source: AuthorImportRecord['source'], label: string, n: Partial<Pick<AuthorImportRecord, 'added' | 'skipped' | 'renamed' | 'replaced' | 'failed' | 'notes'>>): AuthorImportRecord {
  return { id: uuidv4(), at: Date.now(), source, label, added: 0, skipped: 0, renamed: 0, replaced: 0, failed: 0, ...n };
}

/**
 * Imports files into a folder. A clash with an existing file name is settled by `policy`:
 *   skip    — keep the existing file, ignore the incoming one
 *   rename  — keep both ("name (2).json")
 *   replace — overwrite the existing file's content (same id, so favourites and location are kept)
 * The caller must have asked the author before passing 'replace'. Everything lands in one
 * transaction, so a failure part-way leaves the folder exactly as it was.
 */
export async function importFiles(folderId: string | null, items: ImportItem[], policy: ConflictPolicy, source: 'upload' | 'folder-upload' = 'upload'): Promise<ImportResult> {
  // Everything CPU-heavy happens before the transaction opens.
  const prepared = items.map((item) => {
    const cleaned = cleanName(item.name.split(/[\\/]/).pop() ?? item.name);
    if (!cleaned) return { item, error: 'Invalid file name' as string | undefined };
    if (!/\.json$/i.test(cleaned)) return { item, error: 'Not a .json file' };
    const size = utf8Size(item.content);
    if (size > MAX_FILE_BYTES) return { item, error: `Larger than ${MAX_FILE_BYTES / 1048576} MB` };
    const now = Date.now();
    return { item, name: cleaned, size, validation: summarizeValidation(validateQuestionFileText(item.content), now), now };
  });

  return withTx(async (tx) => {
    await requireLiveFolder(tx, folderId);
    const existing = (await tx.objectStore('authorFiles').index('by-folderId').getAll(parentKeyOf(folderId))).filter(isLive);
    const byKey = new Map(existing.map((f) => [nameKey(f.name), f] as const));
    const taken = new Set(existing.map((f) => f.name));
    const result: ImportResult = { outcomes: [], added: 0, skipped: 0, renamed: 0, replaced: 0, failed: 0 };

    for (const p of prepared) {
      if ('error' in p && p.error) { result.outcomes.push({ name: p.item.name, outcome: 'failed', reason: p.error }); result.failed++; continue; }
      const { item, name, size, validation, now } = p as Required<typeof p>;
      const clash = byKey.get(nameKey(name));
      if (clash && policy === 'skip') { result.outcomes.push({ name, outcome: 'skipped', reason: 'A file with this name already exists' }); result.skipped++; continue; }
      if (clash && policy === 'replace') {
        await tx.objectStore('authorFiles').put({ ...clash, size, validation, updatedAt: now });
        await tx.objectStore('authorContent').put({ id: clash.id, content: item.content });
        result.outcomes.push({ name, outcome: 'replaced' }); result.replaced++;
        continue;
      }
      const finalName = clash ? uniqueName(taken, name, { hasExt: true }) : name;
      const record = buildFileRecordFromPrepared(folderId, finalName, size, validation, now);
      await tx.objectStore('authorFiles').put(record);
      await tx.objectStore('authorContent').put({ id: record.id, content: item.content });
      taken.add(finalName);
      byKey.set(nameKey(finalName), record);
      if (finalName !== name) { result.outcomes.push({ name, outcome: 'renamed', finalName }); result.renamed++; }
      else { result.outcomes.push({ name, outcome: 'added' }); result.added++; }
    }

    await tx.objectStore('authorImports').put(importRecord(source, items.length === 1 ? items[0].name : `${items.length} files`, {
      added: result.added, skipped: result.skipped, renamed: result.renamed, replaced: result.replaced, failed: result.failed,
      notes: result.outcomes.filter((o) => o.outcome === 'failed' || o.outcome === 'skipped').map((o) => `${o.name}: ${o.reason ?? o.outcome}`).slice(0, 20),
    }));
    await tx.done;
    return result;
  });
}

function buildFileRecordFromPrepared(folderId: string | null, name: string, size: number, validation: AuthorFile['validation'], now: number): AuthorFile {
  return { id: uuidv4(), folderId, folderKey: parentKeyOf(folderId), name, size, createdAt: now, updatedAt: now, validation };
}

// ─── Dashboard, recent, favourites ───────────────────────────────────────────

export async function listRecent(limit = 20): Promise<AuthorFile[]> {
  const files = await listAllFiles();
  return files.sort((a, b) => Math.max(b.updatedAt, b.lastOpenedAt ?? 0) - Math.max(a.updatedAt, a.lastOpenedAt ?? 0)).slice(0, limit);
}

export async function listFavorites(): Promise<{ folders: AuthorFolder[]; files: AuthorFile[] }> {
  const [folders, files] = await Promise.all([listFolders(), listAllFiles()]);
  return { folders: folders.filter((f) => f.favorite), files: files.filter((f) => f.favorite) };
}

export interface AuthorStats {
  files: number;
  folders: number;
  questions: number;
  bytes: number;
  validFiles: number;
  invalidFiles: number;
  favorites: number;
  trashEntries: number;
  imports: number;
}

export async function getStats(): Promise<AuthorStats> {
  const [files, folders, trash, imports] = await Promise.all([listAllFiles(), listFolders(), listTrash(), listImports(10_000)]);
  return {
    files: files.length,
    folders: folders.length,
    questions: files.reduce((n, f) => n + (f.validation?.questions ?? 0), 0),
    bytes: files.reduce((n, f) => n + f.size, 0),
    validFiles: files.filter((f) => f.validation?.valid).length,
    invalidFiles: files.filter((f) => f.validation && !f.validation.valid).length,
    favorites: files.filter((f) => f.favorite).length + folders.filter((f) => f.favorite).length,
    trashEntries: trash.length,
    imports: imports.length,
  };
}

export async function listImports(limit = 100): Promise<AuthorImportRecord[]> {
  const all = await (await getDB()).getAll('authorImports');
  return all.sort((a, b) => b.at - a.at).slice(0, limit);
}

export async function getStorageInfo(): Promise<{ authorBytes: number; usage?: number; quota?: number }> {
  const files = await (await getDB()).getAll('authorFiles'); // includes trashed files: they still occupy space
  const authorBytes = files.reduce((n, f) => n + f.size, 0);
  try {
    const est = await navigator.storage?.estimate?.();
    return { authorBytes, usage: est?.usage, quota: est?.quota };
  } catch {
    return { authorBytes };
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type SearchField = 'name' | 'title' | 'subject' | 'chapter' | 'content';

export interface SearchOptions {
  query: string;
  /** Restrict to this folder and everything beneath it. */
  scopeFolderId?: string | null;
  validity?: 'valid' | 'invalid';
  subject?: string;
  onlyFavorites?: boolean;
}

export interface SearchResults {
  folders: AuthorFolder[];
  files: { file: AuthorFile; matchedIn: SearchField[] }[];
}

export async function searchAuthor(opts: SearchOptions): Promise<SearchResults> {
  const q = opts.query.trim().toLowerCase();
  const db = await getDB();
  const [allFolders, allFiles] = await Promise.all([listFolders(), listAllFiles()]);
  const folderMap = new Map(allFolders.map((f) => [f.id, f] as const));

  const inScope = (folderId: string | null) => {
    if (opts.scopeFolderId === undefined || opts.scopeFolderId === null) return true;
    let cursor = folderId;
    const seen = new Set<string>();
    while (cursor !== null && !seen.has(cursor)) {
      if (cursor === opts.scopeFolderId) return true;
      seen.add(cursor);
      cursor = folderMap.get(cursor)?.parentId ?? null;
    }
    return false;
  };

  const folders = q ? allFolders.filter((f) => f.name.toLowerCase().includes(q) && inScope(f.parentId) && (!opts.onlyFavorites || f.favorite)) : [];
  const files: SearchResults['files'] = [];
  for (const file of allFiles) {
    if (!inScope(file.folderId)) continue;
    if (opts.validity === 'valid' && !file.validation?.valid) continue;
    if (opts.validity === 'invalid' && (file.validation?.valid ?? true)) continue;
    if (opts.subject && !(file.validation?.subjects ?? []).includes(opts.subject)) continue;
    if (opts.onlyFavorites && !file.favorite) continue;
    if (!q) { files.push({ file, matchedIn: [] }); continue; }
    const matched: SearchField[] = [];
    if (file.name.toLowerCase().includes(q)) matched.push('name');
    if (file.validation?.title?.toLowerCase().includes(q)) matched.push('title');
    if (file.validation?.subjects?.some((s) => s.toLowerCase().includes(q))) matched.push('subject');
    if (file.validation?.topics?.some((t) => t.toLowerCase().includes(q))) matched.push('chapter');
    if (q.length >= 2) {
      const content = (await db.get('authorContent', file.id))?.content;
      if (content && content.toLowerCase().includes(q)) matched.push('content');
    }
    if (matched.length > 0) files.push({ file, matchedIn: matched });
  }
  return { folders, files };
}

// ─── Settings ────────────────────────────────────────────────────────────────

export const DEFAULT_AUTHOR_SETTINGS: AuthorSettingsRecord = { key: 'settings', autoLockMinutes: 5, view: 'list' };

export async function getAuthorSettings(): Promise<AuthorSettingsRecord> {
  const rec = await (await getDB()).get('authorMeta', 'settings');
  return rec && rec.key === 'settings' ? { ...DEFAULT_AUTHOR_SETTINGS, ...rec } : DEFAULT_AUTHOR_SETTINGS;
}

export async function saveAuthorSettings(patch: Partial<Omit<AuthorSettingsRecord, 'key'>>): Promise<AuthorSettingsRecord> {
  const next = { ...(await getAuthorSettings()), ...patch, key: 'settings' as const };
  await (await getDB()).put('authorMeta', next);
  return next;
}

export type { ConflictPolicy };
