// @vitest-environment jsdom
// v12 → v13: the Question Bank's stores are added; every existing record survives byte-for-byte.
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';

describe('database upgrade 12 → 13', () => {
  it('adds tests / questions / importHistory / metadata with their indexes and leaves existing data untouched', async () => {
    // A representative version-12 database: a few of the real stores with legacy-shaped records.
    const legacy = {
      savedTests: { id: 'st1', date: '2026-05-01', displayDate: '1 May', score: 7, totalQuestions: 10, accuracy: 70, savedAt: 111 },
      bookmarks: { id: 'bm1', questionId: 'q-old', question: 'Old?', options: ['a', 'b'], correctAnswer: 'a', bookmarkedAt: 5, sourceFileName: 'x.json' },
      universalAttempts: { id: 'ua1', universalQuestionId: 'u-1', examId: 'ssc-chsl', subjectId: 'mathematics', topicId: 'average', isCorrect: true, wasAnswered: true, timeTaken: 9, attemptedAt: 77, sessionId: 's', sourceFileName: 'x' },
      archivedSessions: { id: 'ar1', archivedAt: 9, kind: 'practice' },
    };
    const old = await openDB('CurrentAffairsDB', 12, {
      upgrade(db) {
        for (const name of Object.keys(legacy)) db.createObjectStore(name, { keyPath: 'id' });
      },
    });
    for (const [name, rec] of Object.entries(legacy)) await old.put(name, rec);
    old.close();

    const { getDB } = await import('../db');
    const db = await getDB(); // opens at the app's version (13) and runs the upgrade
    expect(db.version).toBe(13);
    for (const [name, rec] of Object.entries(legacy)) expect(await db.get(name as never, rec.id as never)).toEqual(rec); // untouched

    const stores = Array.from(db.objectStoreNames);
    expect(stores).toEqual(expect.arrayContaining(['tests', 'questions', 'importHistory', 'metadata']));
    const idx = (s: 'tests' | 'questions') => Array.from(db.transaction(s).store.indexNames).sort();
    expect(idx('tests')).toEqual(['by-chapter', 'by-source', 'by-subject', 'by-testId', 'by-updatedAt']);
    expect(idx('questions')).toEqual(['by-chapter', 'by-questionId', 'by-source', 'by-subject', 'by-testId', 'by-testKey', 'by-updatedAt']);
    expect(await db.getAll('tests')).toEqual([]);

    // The new stores work on a migrated database, and writing to them doesn't disturb the legacy ones.
    await db.put('metadata', { key: 'k', value: 1 });
    expect(await db.get('metadata', 'k')).toEqual({ key: 'k', value: 1 });
    expect(await db.get('bookmarks' as never, 'bm1' as never)).toEqual(legacy.bookmarks);
  });
});
