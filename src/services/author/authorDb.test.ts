import { beforeEach, describe, expect, it } from 'vitest';
import { getDB } from '../db';
import {
  AuthorError, copyFolder, createFile, createFolder, duplicateFile, duplicateFolder, emptyTrash, getFileContent, getStats, importFiles,
  listChildren, listFolders, listImports, listRecent, listTrash, moveFile, moveFolder, purgeFromTrash, renameFile, renameFolder,
  restoreFile, restoreFolder, searchAuthor, setFileFavorite, trashFile, trashFolder, updateFileContent, listFavorites, getBreadcrumb, listAllFiles,
} from './authorDb';

const q = (id: string, extra: Record<string, unknown> = {}) => ({
  id, question: `Question ${id} about photosynthesis?`, options: [{ id: 'A', text: 'x' }, { id: 'B', text: 'y' }], correctAnswer: 'A', difficulty: 'easy', explanation: 'because', ...extra,
});
const good = (...ids: string[]) => JSON.stringify(ids.map((i) => q(i)));

async function wipe() {
  const db = await getDB();
  for (const s of ['authorFolders', 'authorFiles', 'authorContent', 'authorImports', 'authorMeta'] as const) await db.clear(s);
}
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as AuthorError; } };

beforeEach(wipe);

describe('folders', () => {
  it('nests without limit and reports a breadcrumb', async () => {
    let parent: string | null = null;
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) { const f = await createFolder(parent, `L${i}`); ids.push(f.id); parent = f.id; }
    expect((await getBreadcrumb(parent)).map((f) => f.name)).toEqual(ids.map((_, i) => `L${i}`));
  });
  it('refuses duplicate names (case-insensitive) and invalid names', async () => {
    await createFolder(null, 'Maths');
    expect((await err(createFolder(null, 'maths')))?.code).toBe('name-conflict');
    expect((await err(createFolder(null, 'a/b')))?.code).toBe('invalid-name');
    expect((await err(createFolder('nope', 'x')))?.code).toBe('not-found');
  });
  it('renames, with conflict protection', async () => {
    const a = await createFolder(null, 'A'); await createFolder(null, 'B');
    expect((await err(renameFolder(a.id, 'b')))?.code).toBe('name-conflict');
    expect((await renameFolder(a.id, 'a'))).toMatchObject({ name: 'a' }); // case-only change of itself is fine
  });
  it('moves, prevents cycles, auto-renames a clash', async () => {
    const a = await createFolder(null, 'A'); const b = await createFolder(a.id, 'B'); const c = await createFolder(b.id, 'C');
    expect((await err(moveFolder(a.id, c.id)))?.code).toBe('cycle');
    expect((await err(moveFolder(a.id, a.id)))?.code).toBe('cycle');
    await createFolder(null, 'C'); // top-level clash for C
    const moved = await moveFolder(c.id, null);
    expect(moved.name).toBe('C (2)');
    expect((await listFolders()).find((f) => f.id === c.id)?.parentId).toBeNull();
  });
  it('copies and duplicates a whole subtree with new ids; originals untouched', async () => {
    const a = await createFolder(null, 'A'); const b = await createFolder(a.id, 'B');
    const f1 = await createFile(a.id, 'one', good('1')); await createFile(b.id, 'two', good('2', '3'));
    const dup = await duplicateFolder(a.id);
    expect(dup.name).toBe('A copy');
    const folders = await listFolders();
    expect(folders).toHaveLength(4);
    const copiedKids = await listChildren(dup.id);
    expect(copiedKids.files.map((f) => f.name)).toEqual(['one.json']);
    expect(copiedKids.files[0].id).not.toBe(f1.id);
    expect(await getFileContent(copiedKids.files[0].id)).toBe(good('1'));
    expect((await listChildren(a.id)).files[0].id).toBe(f1.id);
    const into = await createFolder(null, 'Target');
    expect((await copyFolder(a.id, into.id)).name).toBe('A');
  });
  it('copy is all-or-nothing: a failure part-way leaves no partial copy', async () => {
    const a = await createFolder(null, 'A');
    for (let i = 0; i < 4; i++) await createFile(a.id, `f${i}`, good(String(i)));
    const before = (await listAllFiles()).length;
    const proto = IDBObjectStore.prototype; const realPut = proto.put; let calls = 0;
    proto.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) { if (++calls === 4) throw new Error('boom'); return realPut.apply(this, args); };
    try { expect((await err(copyFolder(a.id, null)))?.message).toBe('boom'); } finally { proto.put = realPut; }
    expect((await listAllFiles()).length).toBe(before);
    expect((await listFolders()).length).toBe(1);
  });
});

describe('files', () => {
  it('creates, validates on save, and edits with revalidation', async () => {
    const f = await createFile(null, 'avg', good('1', '2'));
    expect(f.name).toBe('avg.json');
    expect(f.validation).toMatchObject({ valid: true, questions: 2 });
    const bad = await updateFileContent(f.id, '[{"id":1}]');
    expect(bad.validation?.valid).toBe(false);
    expect(await getFileContent(f.id)).toBe('[{"id":1}]');
    expect((await updateFileContent(f.id, good('9'))).validation?.valid).toBe(true);
  });
  it('stores invalid JSON as a draft rather than refusing it', async () => {
    const f = await createFile(null, 'draft', '{ not json');
    expect(f.validation?.valid).toBe(false);
  });
  it('name conflicts: create/rename error, move/duplicate auto-rename', async () => {
    const f1 = await createFile(null, 'a', good('1')); await createFile(null, 'b', good('2'));
    expect((await err(createFile(null, 'A.json', good('3'))))?.code).toBe('name-conflict');
    expect((await err(renameFile(f1.id, 'B')))?.code).toBe('name-conflict');
    expect((await duplicateFile(f1.id)).name).toBe('a copy.json');
    const folder = await createFolder(null, 'F'); await createFile(folder.id, 'a', good('4'));
    expect((await moveFile(f1.id, folder.id)).name).toBe('a (2).json');
  });
  it('rejects oversized content with a clear error', async () => {
    const huge = '[' + '"x",'.repeat(7_000_000) + '"x"]';
    expect((await err(createFile(null, 'big', huge)))?.code).toBe('too-large');
  });
});

describe('import conflict policies', () => {
  beforeEach(async () => { await createFile(null, 'dup', good('old')); });
  const incoming = [{ name: 'dup.json', content: good('new') }, { name: 'fresh.json', content: good('f') }, { name: 'notes.txt', content: 'hi' }];

  it('skip keeps the existing file and reports it', async () => {
    const r = await importFiles(null, incoming, 'skip');
    expect(r).toMatchObject({ added: 1, skipped: 1, failed: 1, renamed: 0, replaced: 0 });
    const names = (await listChildren(null)).files.map((f) => f.name).sort();
    expect(names).toEqual(['dup.json', 'fresh.json']);
    const dup = (await listChildren(null)).files.find((f) => f.name === 'dup.json')!;
    expect(await getFileContent(dup.id)).toBe(good('old'));
  });
  it('rename keeps both', async () => {
    const r = await importFiles(null, incoming, 'rename');
    expect(r).toMatchObject({ added: 1, renamed: 1, failed: 1 });
    expect((await listChildren(null)).files.map((f) => f.name).sort()).toEqual(['dup (2).json', 'dup.json', 'fresh.json']);
  });
  it('replace overwrites content but keeps id and favourite', async () => {
    const dup = (await listChildren(null)).files.find((f) => f.name === 'dup.json')!;
    await setFileFavorite(dup.id, true);
    const r = await importFiles(null, incoming, 'replace');
    expect(r).toMatchObject({ replaced: 1, added: 1 });
    const after = (await listChildren(null)).files.find((f) => f.name === 'dup.json')!;
    expect(after.id).toBe(dup.id);
    expect(after.favorite).toBe(true);
    expect(await getFileContent(dup.id)).toBe(good('new'));
  });
  it('twice-in-one-batch same name is handled, and every import is logged', async () => {
    const r = await importFiles(null, [{ name: 'x.json', content: good('1') }, { name: 'X.json', content: good('2') }], 'rename');
    expect(r).toMatchObject({ added: 1, renamed: 1 });
    expect((await listImports()).length).toBeGreaterThan(1);
  });
  it('import into a missing folder changes nothing', async () => {
    const before = (await listAllFiles()).length;
    expect((await err(importFiles('ghost', incoming, 'rename')))?.code).toBe('not-found');
    expect((await listAllFiles()).length).toBe(before);
  });
});

describe('trash and restore', () => {
  it('soft-deletes a file, keeps its content, restores it', async () => {
    const f = await createFile(null, 'a', good('1'));
    await trashFile(f.id);
    expect((await listChildren(null)).files).toHaveLength(0);
    expect((await listTrash()).map((e) => e.name)).toEqual(['a.json']);
    expect(await getFileContent(f.id)).toBe(good('1')); // still there
    await restoreFile(f.id);
    expect((await listChildren(null)).files.map((x) => x.id)).toEqual([f.id]);
    expect(await listTrash()).toEqual([]);
  });
  it('trashes a whole folder hierarchy as ONE entry and restores all of it', async () => {
    const a = await createFolder(null, 'A'); const b = await createFolder(a.id, 'B');
    await createFile(a.id, 'x', good('1')); await createFile(b.id, 'y', good('2'));
    expect(await trashFolder(a.id)).toBe(4);
    const trash = await listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ kind: 'folder', name: 'A', itemCount: 4 });
    expect(await listFolders()).toHaveLength(0);
    const r = await restoreFolder(a.id);
    expect(r.restored).toBe(4);
    expect((await listFolders()).map((f) => f.name).sort()).toEqual(['A', 'B']);
    expect((await listChildren(b.id)).files.map((f) => f.name)).toEqual(['y.json']);
    expect((await getStats()).files).toBe(2);
  });
  it('a file trashed earlier stays in Trash when its folder is restored', async () => {
    const a = await createFolder(null, 'A');
    const earlier = await createFile(a.id, 'earlier', good('1')); await createFile(a.id, 'later', good('2'));
    await trashFile(earlier.id);
    await trashFolder(a.id);
    await restoreFolder(a.id);
    expect((await listChildren(a.id)).files.map((f) => f.name)).toEqual(['later.json']);
    expect((await listTrash()).map((e) => e.name)).toEqual(['earlier.json']);
    await restoreFile(earlier.id);
    expect((await listChildren(a.id)).files.map((f) => f.name).sort()).toEqual(['earlier.json', 'later.json']);
  });
  it('restores to the top level when the original folder is gone; renames instead of overwriting', async () => {
    const a = await createFolder(null, 'A'); const f = await createFile(a.id, 'x', good('1'));
    await trashFile(f.id); await trashFolder(a.id);
    await createFile(null, 'x', good('other'));
    const r = await restoreFile(f.id);
    expect(r.movedToTopLevel).toBe(true);
    expect((await listChildren(null)).files.map((x) => x.name).sort()).toEqual(['x (2).json', 'x.json']);
  });
  it('purge only destroys Trash entries; live items are safe; empty trash clears all', async () => {
    const live = await createFile(null, 'live', good('1')); const gone = await createFile(null, 'gone', good('2'));
    expect(await purgeFromTrash([{ kind: 'file', id: live.id }])).toBe(0);
    await trashFile(gone.id);
    expect(await purgeFromTrash([{ kind: 'file', id: gone.id }])).toBe(1);
    expect(await getFileContent(gone.id)).toBeUndefined();
    expect(await getFileContent(live.id)).toBe(good('1'));
    await trashFile(live.id);
    expect(await emptyTrash()).toBe(1);
  });
  it('refuses to edit or move trashed items', async () => {
    const f = await createFile(null, 'a', good('1')); await trashFile(f.id);
    expect((await err(updateFileContent(f.id, good('2'))))?.code).toBe('in-trash');
    expect((await err(renameFile(f.id, 'b')))?.code).toBe('in-trash');
  });
});

describe('search, recent, favourites', () => {
  it('finds by file name, folder name, title, subject, topic and question content, within scope', async () => {
    const maths = await createFolder(null, 'Mathematics Bank'); const eng = await createFolder(null, 'English');
    await createFile(maths.id, 'percent', JSON.stringify({ title: 'Percentage Drill', questions: [q('1', { subjectId: 'mathematics', topicId: 'budget' })] }));
    await createFile(eng.id, 'idioms', JSON.stringify([q('2', { question: 'Meaning of "break the ice"?' })]));
    const names = async (query: string, extra = {}) => (await searchAuthor({ query, ...extra })).files.map((r) => r.file.name).sort();
    expect(await names('percent')).toEqual(['percent.json']);
    expect(await names('drill')).toEqual(['percent.json']);
    expect(await names('mathematics')).toEqual(['percent.json']);
    expect(await names('budget')).toEqual(['percent.json']);
    expect(await names('break the ice')).toEqual(['idioms.json']);
    expect((await searchAuthor({ query: 'english' })).folders.map((f) => f.name)).toEqual(['English']);
    expect(await names('break', { scopeFolderId: eng.id })).toEqual(['idioms.json']);
    expect(await names('break', { scopeFolderId: maths.id })).toEqual([]); // outside the folder scope
    expect((await searchAuthor({ query: 'break the ice' })).files[0].matchedIn).toEqual(['content']);
  });
  it('never returns trashed files; filters by validity and favourites', async () => {
    const ok = await createFile(null, 'ok', good('1')); await createFile(null, 'broken', '[{"id":1}]'); const t = await createFile(null, 'trashed', good('2'));
    await trashFile(t.id); await setFileFavorite(ok.id, true);
    expect((await searchAuthor({ query: 'trashed' })).files).toHaveLength(0);
    expect((await searchAuthor({ query: '', validity: 'invalid' })).files.map((r) => r.file.name)).toEqual(['broken.json']);
    expect((await searchAuthor({ query: '', onlyFavorites: true })).files.map((r) => r.file.name)).toEqual(['ok.json']);
    expect((await listFavorites()).files).toHaveLength(1);
  });
  it('recent orders by latest activity', async () => {
    const a = await createFile(null, 'a', good('1')); await createFile(null, 'b', good('2'));
    await new Promise((r) => setTimeout(r, 5));
    await updateFileContent(a.id, good('1', '3'));
    expect((await listRecent(5))[0].id).toBe(a.id);
  });
  it('stats come from the stored records', async () => {
    await createFile(null, 'a', good('1', '2')); await createFile(null, 'b', '[{"id":1}]'); await createFolder(null, 'F');
    expect(await getStats()).toMatchObject({ files: 2, folders: 1, questions: 3, validFiles: 1, invalidFiles: 1 });
  });
});
