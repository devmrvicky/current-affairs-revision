// Importing folders (browser folder picker or drag-and-drop) into Author Studio.
// The incoming files carry a relative directory path; the same hierarchy is recreated under the
// target folder, reusing folders that already exist (matched by name, case-insensitively).
// Each folder's files are imported in one atomic transaction (see importFiles); folder creation
// is its own step, so an interrupted import can leave empty folders but never a half-written file.

import { createFolder, importFiles, listChildren, type ImportResult } from './authorDb';
import { nameKey } from './authorNames';
import type { ConflictPolicy } from '../../types/authorStudio';

export interface IncomingFile {
  /** Directory segments relative to the drop target, e.g. ['Maths', 'Average']. Empty = straight into the target. */
  dir: string[];
  name: string;
  content: string;
}

export interface ImportConflict {
  /** Display path, e.g. "Maths/Average/avg.json". */
  path: string;
}

/** Which incoming files would collide with a file that already exists? Read-only — creates nothing. */
export async function findImportConflicts(targetFolderId: string | null, files: IncomingFile[]): Promise<ImportConflict[]> {
  const conflicts: ImportConflict[] = [];
  const cache = new Map<string, { folderId: string | null; exists: boolean }>();
  const resolve = async (dir: string[]): Promise<{ folderId: string | null; exists: boolean }> => {
    const key = dir.map(nameKey).join('/');
    const hit = cache.get(key);
    if (hit) return hit;
    let out: { folderId: string | null; exists: boolean };
    if (dir.length === 0) out = { folderId: targetFolderId, exists: true };
    else {
      const parent = await resolve(dir.slice(0, -1));
      if (!parent.exists) out = { folderId: null, exists: false };
      else {
        const child = (await listChildren(parent.folderId)).folders.find((f) => nameKey(f.name) === nameKey(dir[dir.length - 1]));
        out = child ? { folderId: child.id, exists: true } : { folderId: null, exists: false };
      }
    }
    cache.set(key, out);
    return out;
  };
  for (const f of files) {
    const where = await resolve(f.dir);
    if (!where.exists) continue;
    const taken = (await listChildren(where.folderId)).files.some((x) => nameKey(x.name) === nameKey(f.name));
    if (taken) conflicts.push({ path: [...f.dir, f.name].join('/') });
  }
  return conflicts;
}

export async function importTree(targetFolderId: string | null, files: IncomingFile[], policy: ConflictPolicy, source: 'upload' | 'folder-upload'): Promise<ImportResult> {
  const folderIds = new Map<string, string | null>([['', targetFolderId]]);
  const ensure = async (dir: string[]): Promise<string | null> => {
    const key = dir.map(nameKey).join('/');
    if (folderIds.has(key)) return folderIds.get(key)!;
    const parent = await ensure(dir.slice(0, -1));
    const name = dir[dir.length - 1];
    const existing = (await listChildren(parent)).folders.find((f) => nameKey(f.name) === nameKey(name));
    const id = existing ? existing.id : (await createFolder(parent, name)).id;
    folderIds.set(key, id);
    return id;
  };

  const groups = new Map<string, IncomingFile[]>();
  for (const f of files) {
    const k = f.dir.join('\u0000');
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const total: ImportResult = { outcomes: [], added: 0, skipped: 0, renamed: 0, replaced: 0, failed: 0 };
  for (const group of groups.values()) {
    const folderId = await ensure(group[0].dir);
    const r = await importFiles(folderId, group.map((g) => ({ name: g.name, content: g.content })), policy, source);
    total.outcomes.push(...r.outcomes.map((o) => ({ ...o, name: [...group[0].dir, o.name].join('/') })));
    total.added += r.added; total.skipped += r.skipped; total.renamed += r.renamed; total.replaced += r.replaced; total.failed += r.failed;
  }
  return total;
}
