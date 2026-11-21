import { describe, expect, it } from 'vitest';
import { diffManifest, manifestEntryFor, parseManifest, removeManifestEntry, serializeManifest, testFilePath, upsertManifestEntry } from './manifest';
import { sha256Hex } from './sha256';
import type { Manifest, ManifestEntry } from './types';

const entry = (id: string, over: Partial<ManifestEntry> = {}): ManifestEntry => ({ id, title: `Test ${id}`, subject: 'mathematics', chapter: 'average', file: testFilePath(id), questionCount: 5, version: 1, updatedAt: '2026-11-01T00:00:00.000Z', hash: sha256Hex(id), ...over });
const manifest = (...tests: ManifestEntry[]): Manifest => ({ version: 1, updatedAt: '2026-11-01T00:00:00.000Z', tests });

describe('parseManifest', () => {
  it('accepts a well-formed manifest and returns it unchanged', () => {
    const m = manifest(entry('a'), entry('b'));
    expect(parseManifest(JSON.parse(serializeManifest(m)))).toEqual({ manifest: m, problems: [] });
  });
  it('accepts an empty manifest (nothing published yet)', () => {
    expect(parseManifest({ version: 1, updatedAt: '2026-01-01T00:00:00.000Z', tests: [] }).manifest?.tests).toEqual([]);
  });
  it.each([
    ['not an object', [], /not a JSON object/],
    ['no tests array', { version: 1 }, /no "tests" array/],
    ['duplicate ids', manifest(entry('a'), entry('a')), /Duplicate test id "a"/],
    ['missing hash', manifest({ ...entry('a'), hash: '' }), /missing "hash"/],
    ['malformed hash', manifest(entry('a', { hash: 'abc' })), /malformed "hash"/],
    ['bad version', manifest(entry('a', { version: 0 })), /valid "version"/],
    ['bad questionCount', manifest(entry('a', { questionCount: -1 })), /questionCount/],
    ['path traversal', manifest(entry('a', { file: '../secrets.json' })), /unsafe "file" path/],
    ['absolute path', manifest(entry('a', { file: '/etc/passwd' })), /unsafe "file" path/],
    ['other-site url', manifest(entry('a', { file: 'https://evil.example/x.json' })), /unsafe "file" path/],
  ])('rejects: %s', (_n, input, re) => {
    const r = parseManifest(input);
    expect(r.manifest).toBeNull();
    expect(r.problems.some((p) => re.test(p.message))).toBe(true);
  });
});

describe('manifest edits never drop unrelated entries', () => {
  const base = manifest(entry('a'), entry('b'), entry('c'));
  it('publish: replaces only the entry with that id (in place), or appends a new one', () => {
    const upd = upsertManifestEntry(base, entry('b', { version: 2, questionCount: 9 }), '2026-12-01T00:00:00.000Z');
    expect(upd.tests.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(upd.tests[1]).toMatchObject({ version: 2, questionCount: 9 });
    expect(upd.tests[0]).toBe(base.tests[0]);
    expect(upd.tests[2]).toBe(base.tests[2]);
    expect(upd.updatedAt).toBe('2026-12-01T00:00:00.000Z');
    expect(upsertManifestEntry(base, entry('d'), 'x').tests.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('delete: removes only that id', () => {
    expect(removeManifestEntry(base, 'b', 'x').tests.map((t) => t.id)).toEqual(['a', 'c']);
    expect(removeManifestEntry(base, 'nope', 'x').tests).toHaveLength(3);
  });
  it('does not mutate its input and keeps the manifest format version', () => {
    const copy = JSON.stringify(base);
    upsertManifestEntry(base, entry('z'), 'x'); removeManifestEntry(base, 'a', 'x');
    expect(JSON.stringify(base)).toBe(copy);
    expect(upsertManifestEntry(base, entry('z'), 'x').version).toBe(1);
  });
  it('an entry\'s hash is the SHA-256 of the exact file text, and its path is tests/<id>.json', () => {
    const e = manifestEntryFor({ id: 'abc', title: 'T', subjectId: 'mathematics', chapterId: 'average', version: 4 }, 'file text\n', 7, '2026-11-02T00:00:00.000Z');
    expect(e).toEqual({ id: 'abc', title: 'T', subject: 'mathematics', chapter: 'average', file: 'tests/abc.json', questionCount: 7, version: 4, updatedAt: '2026-11-02T00:00:00.000Z', hash: sha256Hex('file text\n') });
  });
});

describe('diffManifest — compares version and hash', () => {
  it('splits into added / changed / removed / unchanged', () => {
    const remote = manifest(entry('new'), entry('same'), entry('hash-changed', { hash: sha256Hex('v2') }), entry('version-changed', { version: 3 }));
    const installed = [
      { id: 'same', version: 1, hash: sha256Hex('same') },
      { id: 'hash-changed', version: 1, hash: sha256Hex('hash-changed') },
      { id: 'version-changed', version: 1, hash: sha256Hex('version-changed') },
      { id: 'gone', version: 1, hash: 'x' },
    ];
    const d = diffManifest(remote, installed);
    expect(d.added.map((e) => e.id)).toEqual(['new']);
    expect(d.changed.map((e) => e.id)).toEqual(['hash-changed', 'version-changed']);
    expect(d.unchanged.map((e) => e.id)).toEqual(['same']);
    expect(d.removed.map((e) => e.id)).toEqual(['gone']);
  });
  it('is empty when nothing differs', () => {
    const d = diffManifest(manifest(entry('a')), [{ id: 'a', version: 1, hash: sha256Hex('a') }]);
    expect([d.added, d.changed, d.removed].every((l) => l.length === 0)).toBe(true);
  });
});
