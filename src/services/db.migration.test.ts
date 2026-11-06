// Migration safety (spec §14): the v12 upgrade is additive and idempotent, and old data stays readable.
import { describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';

const DB = 'CurrentAffairsDB';
const NEW_STORES = ['archivedSessions', 'authorFolders', 'authorFiles', 'authorContent', 'authorImports', 'authorMeta'];

// Records shaped like real v11 data: a parked session, a bookmark (numeric question id), a wrong-question entry.
const legacy = {
  session: { id: 'sess-legacy', kind: 'universal', savedAt: 5, lastActiveAt: 7, payload: {
    id: 'sess-legacy', config: { examId: 'ssc-chsl', subjectIds: ['mathematics'], questionCount: 1, mode: 'practice', label: 'Average — Test 1' },
    questionIds: ['q1'], states: [{ questionId: 'q1', selectedAnswer: 'B', isMarkedForReview: true, timeTaken: 12 }],
    currentIndex: 0, startedAt: 1, lastActiveAt: 7, isCompleted: false, totalPausedTime: 0, visitedIndices: [0],
  } },
  bookmark: { id: 'bm-1', question: 'Old question?', options: ['a', 'b'], correctAnswer: 'a', sourceFileName: 'january.json', bookmarkedAt: '2025-01-02T00:00:00Z' },
  wrong: { id: 'wq-1', questionId: 42, status: 'pending', dateKey: '2025-01-02' },
};

async function dropDb() {
  await new Promise((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve(null); });
}

async function buildV11() {
  await dropDb();
  const old = await openDB(DB, 11, {
    upgrade(db) {
      db.createObjectStore('savedSessions', { keyPath: 'id' }).createIndex('by-lastActiveAt', 'lastActiveAt');
      db.createObjectStore('bookmarks', { keyPath: 'id' });
      db.createObjectStore('wrongQuestions', { keyPath: 'id' });
    },
  });
  await old.put('savedSessions', legacy.session);
  await old.put('bookmarks', legacy.bookmark);
  await old.put('wrongQuestions', legacy.wrong);
  old.close();
}

describe('v11 → v12', () => {
  it('adds the new stores and leaves every legacy record byte-for-byte intact', async () => {
    await buildV11();
    vi.resetModules();
    const { getDB } = await import('./db');
    const db = await getDB();
    expect(db.version).toBe(12);
    for (const s of NEW_STORES) expect(db.objectStoreNames.contains(s as never), s).toBe(true);
    expect(await db.get('savedSessions', 'sess-legacy')).toEqual(legacy.session);
    expect(await db.get('bookmarks' as never, 'bm-1')).toEqual(legacy.bookmark);
    expect(await db.get('wrongQuestions' as never, 'wq-1')).toEqual(legacy.wrong);
    // the pre-existing index still works
    expect((await db.getAllFromIndex('savedSessions', 'by-lastActiveAt')).map((r) => r.id)).toEqual(['sess-legacy']);
    db.close();
  });

  it('legacy sessions are still listed for Resume after the upgrade', async () => {
    await buildV11();
    vi.resetModules();
    const { listResumableSessions } = await import('./sessionManager');
    const list = await listResumableSessions();
    expect(list.map((s) => s.id)).toEqual(['sess-legacy']);
    expect(list[0]).toMatchObject({ answered: 1, markedCount: 1, group: expect.any(String) });
    (await (await import('./db')).getDB()).close();
  });

  it('one malformed saved session cannot hide the others', async () => {
    await buildV11();
    const raw = await openDB(DB, 11);
    await raw.put('savedSessions', { id: 'broken', kind: 'universal', savedAt: 1, lastActiveAt: 9, payload: { id: 'broken' } });
    raw.close();
    vi.resetModules();
    const { listResumableSessions } = await import('./sessionManager');
    expect((await listResumableSessions()).map((s) => s.id)).toEqual(['sess-legacy']);
    (await (await import('./db')).getDB()).close();
  });

  it('is idempotent: reopening, or re-running the upgrade body, changes nothing', async () => {
    await buildV11();
    vi.resetModules();
    const first = await (await import('./db')).getDB();
    await first.put('authorMeta', { key: 'settings', autoLockMinutes: 7, view: 'grid' });
    first.close();
    vi.resetModules();
    const second = await (await import('./db')).getDB();
    expect(second.version).toBe(12);
    expect(await second.get('authorMeta', 'settings')).toEqual({ key: 'settings', autoLockMinutes: 7, view: 'grid' });
    expect(await second.get('savedSessions', 'sess-legacy')).toEqual(legacy.session);
    second.close();
  });
});

describe('fresh install', () => {
  it('creates every store in one go', async () => {
    await dropDb();
    vi.resetModules();
    const db = await (await import('./db')).getDB();
    for (const s of [...NEW_STORES, 'savedSessions', 'bookmarks', 'wrongQuestions', 'savedTests']) expect(db.objectStoreNames.contains(s as never), s).toBe(true);
    db.close();
  });
});
