import { beforeEach, describe, expect, it } from 'vitest';
import { getDB } from '../db';
import type { AuthorLockRecord } from '../../types/authorStudio';
import { createFile, createFolder, getFileContent, listAllFiles, listFolders, listTrash, restoreFolder, saveAuthorSettings, getAuthorSettings, setFileFavorite, setFolderFavorite, trashFile } from './authorDb';
import { applyRestore, buildBackup, parseBackup, planRestore } from './authorBackup';
import { setupPassword } from './authorLockService';
import { createZip, readZip } from './authorZip';

const good = (...ids: string[]) => JSON.stringify(ids.map((id) => ({ id, question: `Q ${id}?`, options: [{ id: 'A', text: 'x' }, { id: 'B', text: 'y' }], correctAnswer: 'A', difficulty: 'easy', explanation: 'e' })));
const enc = new TextEncoder();
const dec = new TextDecoder();

async function wipe() {
  const db = await getDB();
  for (const s of ['authorFolders', 'authorFiles', 'authorContent', 'authorImports', 'authorMeta'] as const) await db.clear(s);
}
async function seed() {
  const maths = await createFolder(null, 'गणित'); const avg = await createFolder(maths.id, 'Average'); await createFolder(null, 'Empty');
  const a = await createFile(maths.id, 'intro', good('1')); const b = await createFile(avg.id, 'avg 01', good('2', '3'));
  await setFileFavorite(b.id, true); await setFolderFavorite(maths.id, true);
  return { maths, avg, a, b };
}
const names = async () => (await listAllFiles()).map((f) => f.name).sort();

beforeEach(wipe);

describe('what a backup contains', () => {
  it('has the manifest, hierarchy, and files byte-for-byte — and NEVER the lock', async () => {
    await setupPassword('a-very-secret-passphrase', 1_000);
    await saveAuthorSettings({ autoLockMinutes: 9 });
    await seed();
    const { bytes, manifest, fileName } = await buildBackup('full', undefined, new Date('2026-11-06T10:00:00Z'));
    expect(fileName).toBe('author-studio-full-2026-11-06.zip');
    expect(manifest).toMatchObject({ app: 'examverse-author-studio', formatVersion: 1, scope: 'full', counts: { folders: 3, files: 2 } });

    const entries = await readZip(bytes);
    const paths = entries.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['manifest.json', 'folders.json', 'files.json', 'imports.json', 'settings.json', 'bank/गणित/intro.json', 'bank/गणित/Average/avg 01.json']));
    expect(dec.decode(entries.find((e) => e.path === 'bank/गणित/Average/avg 01.json')!.data)).toBe(good('2', '3'));

    // The credential must not be anywhere in any entry — not as a key, not as a value.
    const lock = (await (await getDB()).get('authorMeta', 'lock')) as AuthorLockRecord | undefined;
    expect(lock).toBeTruthy();
    const everything = entries.map((e) => dec.decode(e.data)).join('\n');
    expect(everything).not.toContain(lock!.hash);
    expect(everything).not.toContain(lock!.salt);
    expect(everything).not.toMatch(/"(hash|salt|iterations|failedAttempts|lockedUntil)"/);
    expect(everything).not.toContain('a-very-secret-passphrase');
    expect(paths.some((p) => /lock|password|auth\.json/i.test(p))).toBe(false);
  });
  it('excludes the Trash, and the plain "bank" scope has no settings or history', async () => {
    const { a } = await seed(); await trashFile(a.id);
    const { bytes } = await buildBackup('bank');
    const paths = (await readZip(bytes)).map((e) => e.path);
    expect(paths.some((p) => p.endsWith('intro.json'))).toBe(false);
    expect(paths).not.toContain('settings.json');
    expect(paths).not.toContain('imports.json');
  });
  it('a selection keeps the ancestor folders so the hierarchy is intact', async () => {
    const { avg } = await seed();
    const { bytes, manifest } = await buildBackup('selection', { folderIds: [avg.id], fileIds: [] });
    expect(manifest.counts).toEqual({ folders: 2, files: 1 });
    expect((await readZip(bytes)).map((e) => e.path)).toContain('bank/गणित/Average/avg 01.json');
  });
});

describe('restore round trip', () => {
  it('restores into an empty studio exactly: folders, empty folders, files, favourites', async () => {
    await seed();
    const { bytes } = await buildBackup('full');
    await wipe();
    const parsed = await parseBackup(bytes);
    expect(parsed).toMatchObject({ fatal: false, errors: [] });
    const plan = await planRestore(parsed, 'merge');
    expect(plan.counts).toEqual({ new: 2, identical: 0, conflict: 0 });
    const result = await applyRestore(parsed, { mode: 'merge', policy: 'skip' });
    expect(result).toMatchObject({ filesAdded: 2, foldersCreated: 3 });
    expect((await listFolders()).map((f) => f.name).sort()).toEqual(['Average', 'Empty', 'गणित']);
    expect(await names()).toEqual(['avg 01.json', 'intro.json']);
    const avg01 = (await listAllFiles()).find((f) => f.name === 'avg 01.json')!;
    expect(avg01.favorite).toBe(true);
    expect(await getFileContent(avg01.id)).toBe(good('2', '3'));
    expect((await listFolders()).find((f) => f.name === 'गणित')!.favorite).toBe(true);
  });
});

describe('restore never overwrites silently', () => {
  async function backupThenChange() {
    const { a } = await seed();
    const { bytes } = await buildBackup('bank');
    const { updateFileContent } = await import('./authorDb');
    await updateFileContent(a.id, good('changed'));
    return { a, parsed: await parseBackup(bytes) };
  }
  it('the preview separates new / identical / conflicting', async () => {
    const { parsed } = await backupThenChange();
    const plan = await planRestore(parsed, 'merge');
    expect(plan.counts).toEqual({ new: 0, identical: 1, conflict: 1 });
    expect(plan.items.find((i) => i.status === 'conflict')!.path).toBe('गणित/intro.json');
  });
  it('skip keeps the current file; identical files are never rewritten', async () => {
    const { a, parsed } = await backupThenChange();
    const r = await applyRestore(parsed, { mode: 'merge', policy: 'skip' });
    expect(r).toMatchObject({ filesSkipped: 1, filesIdentical: 1, filesAdded: 0, filesReplaced: 0 });
    expect(await getFileContent(a.id)).toBe(good('changed'));
  });
  it('rename keeps both versions', async () => {
    const { a, parsed } = await backupThenChange();
    const r = await applyRestore(parsed, { mode: 'merge', policy: 'rename' });
    expect(r.filesRenamed).toBe(1);
    expect(await names()).toEqual(['avg 01.json', 'intro (2).json', 'intro.json']);
    expect(await getFileContent(a.id)).toBe(good('changed'));
  });
  it('replace overwrites only that file, only when chosen — and per-file overrides win', async () => {
    const { a, parsed } = await backupThenChange();
    const r = await applyRestore(parsed, { mode: 'merge', policy: 'skip', overrides: { 'गणित/intro.json': 'replace' } });
    expect(r.filesReplaced).toBe(1);
    expect(await getFileContent(a.id)).toBe(good('1'));
  });
  it('replace-all moves the current bank to Trash first, so nothing is lost', async () => {
    const { a, parsed } = await backupThenChange();
    await createFile(null, 'only-here', good('z'));
    const plan = await planRestore(parsed, 'replace-all');
    expect(plan.willTrash).toBe(3); // 2 top-level folders + 1 top-level file
    const r = await applyRestore(parsed, { mode: 'replace-all', policy: 'skip' });
    expect(r.trashedExisting).toBeGreaterThan(0);
    expect(await names()).toEqual(['avg 01.json', 'intro.json']); // live bank = backup
    expect(await getFileContent(a.id)).toBe(good('changed')); // the old version is still on disk, in Trash
    const trash = await listTrash();
    expect(trash.map((t) => t.name).sort()).toEqual(['Empty', 'only-here.json', 'गणित']);
    await restoreFolder(trash.find((t) => t.name === 'गणित')!.id);
  });
});

describe('atomicity', () => {
  it('a failure part-way through a restore leaves the studio exactly as it was', async () => {
    await seed();
    const { bytes } = await buildBackup('bank');
    const parsed = await parseBackup(bytes);
    await wipe();
    await createFile(null, 'existing', good('keep'));
    const proto = IDBObjectStore.prototype; const realPut = proto.put; let calls = 0;
    proto.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) { if (++calls === 5) throw new Error('disk exploded'); return realPut.apply(this, args); };
    let message = '';
    try { await applyRestore(parsed, { mode: 'merge', policy: 'skip' }); } catch (e) { message = (e as Error).message; } finally { proto.put = realPut; }
    expect(message).toBe('disk exploded');
    expect(await names()).toEqual(['existing.json']);
    expect(await listFolders()).toHaveLength(0);
  });
  it('replace-all that fails does not even trash the existing bank', async () => {
    await seed();
    const { bytes } = await buildBackup('bank');
    const parsed = await parseBackup(bytes);
    const proto = IDBObjectStore.prototype; const realPut = proto.put; let calls = 0;
    proto.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) { if (++calls === 12) throw new Error('boom'); return realPut.apply(this, args); };
    try { await applyRestore(parsed, { mode: 'replace-all', policy: 'skip' }).catch(() => undefined); } finally { proto.put = realPut; }
    expect(await listTrash()).toEqual([]);
    expect(await names()).toEqual(['avg 01.json', 'intro.json']);
  });
});

describe('settings and credentials on restore', () => {
  it('replace-all applies studio settings but never touches the Author Lock', async () => {
    await saveAuthorSettings({ autoLockMinutes: 30, view: 'grid' });
    const { bytes } = await buildBackup('full');
    await saveAuthorSettings({ autoLockMinutes: 2, view: 'list' });
    await setupPassword('keep-this-password', 1_000);
    const before = await (await getDB()).get('authorMeta', 'lock');
    await applyRestore(await parseBackup(bytes), { mode: 'replace-all', policy: 'skip' });
    expect(await getAuthorSettings()).toMatchObject({ autoLockMinutes: 30, view: 'grid' });
    expect(await (await getDB()).get('authorMeta', 'lock')).toEqual(before);
  });
  it('ignores a credential file smuggled into an archive', async () => {
    const { bytes } = await buildBackup('bank');
    const entries = await readZip(bytes);
    entries.push({ path: 'lock.json', data: enc.encode('{"hash":"x"}') });
    const parsed = await parseBackup(createZip(entries));
    expect(parsed.warnings.join(' ')).toMatch(/lock\.json.*ignored/);
    await applyRestore(parsed, { mode: 'merge', policy: 'skip' });
    expect(await (await getDB()).get('authorMeta', 'lock')).toBeUndefined();
  });
});

describe('structural validation', () => {
  it('rejects non-backups, wrong app ids, newer formats and damaged archives with a reason', async () => {
    expect((await parseBackup(enc.encode('nope nope nope nope nope nope'))).fatal).toBe(true);
    expect((await parseBackup(createZip([{ path: 'x.txt', data: enc.encode('hi') }]))).errors[0]).toMatch(/manifest\.json is missing/);
    const wrongApp = createZip([{ path: 'manifest.json', data: enc.encode(JSON.stringify({ app: 'other', formatVersion: 1 })) }]);
    expect((await parseBackup(wrongApp)).errors[0]).toMatch(/wrong application id/);
    const newer = createZip([{ path: 'manifest.json', data: enc.encode(JSON.stringify({ app: 'examverse-author-studio', formatVersion: 99 })) }]);
    expect((await parseBackup(newer)).errors[0]).toMatch(/newer/);
  });
  it('skips bad entries with an error, restores the rest, and warns about validation problems', async () => {
    const manifest = { app: 'examverse-author-studio', formatVersion: 1, createdAt: '2026-01-01T00:00:00Z', scope: 'bank', counts: { folders: 0, files: 3 }, note: '' };
    const zip = createZip([
      { path: 'manifest.json', data: enc.encode(JSON.stringify(manifest)) },
      { path: 'bank/ok.json', data: enc.encode(good('1')) },
      { path: 'bank/draft.json', data: enc.encode('{ not json') },
      { path: 'bank/notes.txt', data: enc.encode('ignored') },
      { path: 'bank/binary.json', data: new Uint8Array([0xff, 0xfe, 0xfd]) },
    ]);
    const parsed = await parseBackup(zip);
    expect(parsed.fatal).toBe(false);
    expect(parsed.files.map((f) => f.path).sort()).toEqual(['draft.json', 'ok.json']);
    expect(parsed.errors.join(' ')).toMatch(/binary\.json.*UTF-8/);
    expect(parsed.warnings.join(' ')).toMatch(/draft\.json.*validation problems/);
    expect(parsed.warnings.join(' ')).toMatch(/notes\.txt.*ignored/);
  });
});
