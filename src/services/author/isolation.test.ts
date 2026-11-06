// Private/public isolation (spec §13.11). Two kinds of proof:
//   1. static — the public pipeline's source never mentions Author Studio, and Author Studio never imports a public data source
//   2. runtime — using Author Studio changes no public store and makes no network request
import { describe, expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { createFile, createFolder, importFiles, trashFile } from './authorDb';
import { applyRestore, buildBackup, parseBackup } from './authorBackup';

const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const entries = Object.entries(sources).filter(([p]) => !/\.test\.tsx?$/.test(p) && !p.startsWith('/src/data/'));

const AUTHOR_HOMES = ['/src/services/author/', '/src/pages/author/', '/src/components/author/', '/src/types/authorStudio.ts', '/src/store/authorLockStore.ts'];
// The only other files allowed to know Author Studio exists: the DB schema, and the router entry for /author-studio.
const ALLOWED_OUTSIDE = ['/src/services/db.ts', '/src/routes/AppRouter.tsx'];
const AUTHOR_MARKERS = /services\/author\/|authorStudio|authorLockStore|\bauthor(Folders|Files|Content|Imports|Meta)\b|pages\/author\/|components\/author\//;

describe('static isolation', () => {
  it('sanity: the scan actually sees the source tree', () => {
    expect(entries.length).toBeGreaterThan(150);
    expect(entries.some(([p]) => p === '/src/services/questionRepository.ts')).toBe(true);
    expect(entries.some(([p]) => p.startsWith('/src/services/author/'))).toBe(true);
  });

  it('nothing outside Author Studio (and the schema + router) references it — the public question pipeline cannot read private data', () => {
    const offenders = entries
      .filter(([p]) => !AUTHOR_HOMES.some((h) => p.startsWith(h)) && !ALLOWED_OUTSIDE.includes(p))
      .filter(([, src]) => AUTHOR_MARKERS.test(src))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('the router only lazy-loads the studio page; the schema only declares stores', () => {
    const router = sources['/src/routes/AppRouter.tsx'];
    const authorLines = router.split('\n').filter((l) => AUTHOR_MARKERS.test(l) || /author-studio/.test(l));
    expect(authorLines.every((l) => /lazy|import\(|author-studio|AuthorStudio/.test(l))).toBe(true);
  });

  it('Author Studio never imports a public question source, a sync layer, or a network client', () => {
    const forbidden = /(questionRepository|universalChapterRepository|testLibraryBuilder|markdownRepository|mockRegistry|attemptLedger|questionMarkService|supabase|syncService|enqueueSync|github)/i;
    const offenders = entries
      .filter(([p]) => AUTHOR_HOMES.some((h) => p.startsWith(h)))
      .filter(([, src]) => src.split('\n').some((l) => /^\s*(import|export)\b.*from\s/.test(l) && forbidden.test(l)))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('Author Studio code never calls fetch/XHR/WebSocket (no upload path exists)', () => {
    const offenders = entries
      .filter(([p]) => AUTHOR_HOMES.some((h) => p.startsWith(h)))
      .filter(([, src]) => /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|sendBeacon/.test(src))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});

describe('runtime isolation', () => {
  it('using Author Studio changes no public store and makes no network request', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (...a: unknown[]) => { calls.push(String(a[0])); return Promise.reject(new Error('network is off')); });

    const db = await getDB();
    const publicStores = Array.from(db.objectStoreNames).filter((n) => !/^author/.test(n));
    const snapshot = async () => Object.fromEntries(await Promise.all(publicStores.map(async (s) => [s, JSON.stringify(await db.getAll(s as never))] as const)));
    // give the public stores something to lose
    await db.put('bookmarks' as never, { id: 'b', question: 'q', options: ['a', 'b'], correctAnswer: 'a', sourceFileName: 'x.json', bookmarkedAt: 'now' } as never);
    const before = await snapshot();

    const folder = await createFolder(null, 'Private');
    const f = await createFile(folder.id, 'secret', '[{"id":"s1","question":"Private question?","options":["a","b"],"correctAnswer":"a"}]');
    await importFiles(folder.id, [{ name: 'more.json', content: '[]' }], 'rename');
    await trashFile(f.id);
    const backup = await buildBackup('full');
    await applyRestore(await parseBackup(backup.bytes), { mode: 'merge', policy: 'rename' });

    expect(await snapshot()).toEqual(before);
    expect(calls).toEqual([]);
    vi.unstubAllGlobals();
  });
});
