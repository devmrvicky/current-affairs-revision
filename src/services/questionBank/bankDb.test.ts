// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, universalAttemptsDB, bookmarksDB } from '../db';
import { BankError, commitTests, deleteBankTest, getBankQuestions, getBankTest, getBankTests, getImportHistory, getAllActiveBankQuestions, getBankQuestionByKey, type PreparedTest } from './bankDb';
import type { BankQuestionData } from './types';

const q = (id: string, over: Partial<BankQuestionData> = {}): BankQuestionData => ({
  id, questionType: 'mcq', question: `Question ${id}?`, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', explanation: `e-${id}`, difficulty: 'easy', ...over,
});
const test = (id: string, questions: BankQuestionData[], over: Partial<PreparedTest> = {}): PreparedTest => ({
  id, title: `Test ${id}`, subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], questions, sourceFile: `${id}.json`, ...over,
});

beforeEach(async () => {
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata', 'universalAttempts', 'bookmarks', 'wrongQuestions', 'savedTests'] as const) await db.clear(s);
});

const snapshot = async () => {
  const db = await getDB();
  return JSON.stringify({ t: await db.getAll('tests'), q: await db.getAll('questions') });
};

describe('Add', () => {
  it('stores the test and its questions in order, version 1, with an origin-qualified key and an import-history row', async () => {
    const [s] = await commitTests([test('t1', [q('a'), q('b'), q('c')])], { mode: 'add', now: 1000 });
    expect(s).toEqual({ testId: 't1', added: 3, updated: 0, skipped: 0 });
    const t = await getBankTest('local:t1');
    expect(t).toMatchObject({ key: 'local:t1', id: 't1', origin: 'local', version: 1, questionCount: 3, createdAt: 1000, updatedAt: 1000 });
    expect(t!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await getBankQuestions('local:t1')).map((r) => r.questionId)).toEqual(['a', 'b', 'c']);
    expect(await getImportHistory()).toEqual([expect.objectContaining({ testId: 't1', mode: 'add', added: 3, status: 'success', fileName: 't1.json' })]);
  });
  it('rejects a duplicate test id and changes nothing — even for the other tests in the same batch (all or nothing)', async () => {
    await commitTests([test('t1', [q('a')])], { mode: 'add' });
    const before = await snapshot();
    await expect(commitTests([test('new', [q('x')]), test('t1', [q('z')])], { mode: 'add' })).rejects.toMatchObject({ code: 'duplicate-test' });
    expect(await snapshot()).toBe(before);
    expect(await getBankTest('local:new')).toBeUndefined();
  });
  it('a local and a remote test with the same id never clash', async () => {
    await commitTests([test('same', [q('a')])], { mode: 'add', origin: 'local' });
    await commitTests([test('same', [q('b')])], { mode: 'add', origin: 'remote' });
    expect((await getBankTests()).map((t) => t.key).sort()).toEqual(['local:same', 'remote:same']);
    expect((await getAllActiveBankQuestions()).map((r) => r.key).sort()).toEqual(['local:same::a', 'remote:same::b']);
  });
});

describe('Atomic: a failure part-way leaves the database exactly as it was', () => {
  it('an error forced after the 3rd write aborts the whole import — no test, no questions, no half-written rows', async () => {
    await commitTests([test('keep', [q('k')])], { mode: 'add' });
    const before = await snapshot();
    const histBefore = (await getImportHistory()).filter((h) => h.status === 'success').length;
    await expect(commitTests([test('t1', [q('a'), q('b'), q('c'), q('d')])], { mode: 'add', afterWrite: (n) => { if (n === 3) throw new Error('disk full'); } })).rejects.toMatchObject({ code: 'commit-failed', message: expect.stringMatching(/Nothing was changed.*disk full/) });
    expect(await snapshot()).toBe(before);
    expect(await getBankTest('local:t1')).toBeUndefined();
    // …and the failure is recorded so it can be inspected, with no success row for it
    const hist = await getImportHistory();
    expect(hist.filter((h) => h.status === 'success')).toHaveLength(histBefore);
    expect(hist.find((h) => h.status === 'failed')).toMatchObject({ testId: 't1', mode: 'add', error: expect.stringContaining('disk full') });
  });
  it('a failure in the 2nd test of a batch rolls back the 1st as well', async () => {
    const before = await snapshot();
    await expect(commitTests([test('one', [q('a')]), test('two', [q('b')])], { mode: 'add', afterWrite: (n) => { if (n === 3) throw new Error('boom'); } })).rejects.toBeInstanceOf(BankError);
    expect(await snapshot()).toBe(before);
    expect(await getBankTests()).toEqual([]);
  });
});

describe('Replace', () => {
  it('replaces only the selected test\'s questions; other tests are untouched; version goes up; removed questions are kept as retired snapshots', async () => {
    await commitTests([test('t1', [q('a'), q('b'), q('c')]), test('t2', [q('x')])], { mode: 'add', now: 1 });
    const t2Before = JSON.stringify(await getBankQuestions('local:t2'));
    const [s] = await commitTests([test('t1', [q('a'), q('b', { question: 'Edited b?' }), q('d')])], { mode: 'replace', now: 2 });
    expect(s).toEqual({ testId: 't1', added: 1, updated: 1, skipped: 1 }); // d new, b changed, a unchanged
    expect((await getBankQuestions('local:t1')).map((r) => r.questionId)).toEqual(['a', 'b', 'd']);
    expect((await getBankTest('local:t1'))).toMatchObject({ version: 2, questionCount: 3, createdAt: 1, updatedAt: 2 });
    expect(JSON.stringify(await getBankQuestions('local:t2'))).toBe(t2Before);
    const retired = await getBankQuestionByKey('local:t1::c');
    expect(retired).toMatchObject({ retired: true, data: { id: 'c', question: 'Question c?' } }); // frozen snapshot, never deleted
    expect((await getAllActiveBankQuestions()).map((r) => r.key)).not.toContain('local:t1::c');
  });
  it('requires the test to exist', async () => {
    await expect(commitTests([test('nope', [q('a')])], { mode: 'replace' })).rejects.toMatchObject({ code: 'missing-test' });
  });
  it('NEVER touches attempts, bookmarks or other progress — and old attempts stay bound to their original question ids', async () => {
    await commitTests([test('t1', [q('a'), q('b')])], { mode: 'add' });
    await universalAttemptsDB.recordMany([{ id: 'att1', universalQuestionId: 'qb:local:t1:b', examId: 'e', subjectId: 'mathematics', topicId: 'average', isCorrect: true, wasAnswered: true, timeTaken: 5, attemptedAt: 1, sessionId: 's1', sourceFileName: 'x' }]);
    await bookmarksDB.upsert({ id: 'bm1', questionId: 'qb:local:t1:b', question: 'Question b?', options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceFileName: 'x', sourceDate: '', bookmarkedAt: 1 } as never);
    const db = await getDB();
    const attemptsBefore = JSON.stringify(await db.getAll('universalAttempts'));
    const bookmarksBefore = JSON.stringify(await db.getAll('bookmarks'));
    // The author re-keys the questions: b disappears, z appears. The old attempt must NOT be re-pointed at z.
    await commitTests([test('t1', [q('a'), q('z')])], { mode: 'replace' });
    expect(JSON.stringify(await db.getAll('universalAttempts'))).toBe(attemptsBefore);
    expect(JSON.stringify(await db.getAll('bookmarks'))).toBe(bookmarksBefore);
    expect((await getBankQuestionByKey('local:t1::b'))).toMatchObject({ retired: true, data: { question: 'Question b?' } }); // still resolvable for review
    expect((await getBankQuestions('local:t1')).map((r) => r.questionId)).toEqual(['a', 'z']);
  });
  it('re-adding a retired question id brings it back as a normal question', async () => {
    await commitTests([test('t1', [q('a'), q('b')])], { mode: 'add' });
    await commitTests([test('t1', [q('a')])], { mode: 'replace' });
    await commitTests([test('t1', [q('a'), q('b')])], { mode: 'replace' });
    expect((await getBankQuestionByKey('local:t1::b'))?.retired).toBeUndefined();
    expect((await getBankQuestions('local:t1')).map((r) => r.questionId)).toEqual(['a', 'b']);
  });
});

describe('Merge', () => {
  beforeEach(async () => { await commitTests([test('t1', [q('a'), q('b')])], { mode: 'add' }); });
  it('adds new questions and, by default, skips ids that already exist', async () => {
    const [s] = await commitTests([test('t1', [q('b', { question: 'CHANGED' }), q('c')])], { mode: 'merge' });
    expect(s).toEqual({ testId: 't1', added: 1, updated: 0, skipped: 1 });
    const rows = await getBankQuestions('local:t1');
    expect(rows.map((r) => r.questionId)).toEqual(['a', 'b', 'c']);
    expect(rows[1].data.question).toBe('Question b?'); // existing one kept
    expect(await getBankTest('local:t1')).toMatchObject({ questionCount: 3, version: 2 });
  });
  it('can update the ids that already exist instead', async () => {
    const [s] = await commitTests([test('t1', [q('b', { question: 'CHANGED' }), q('c')])], { mode: 'merge', mergeConflict: 'update' });
    expect(s).toEqual({ testId: 't1', added: 1, updated: 1, skipped: 0 });
    expect((await getBankQuestions('local:t1')).find((r) => r.questionId === 'b')!.data.question).toBe('CHANGED');
  });
  it('an unchanged merge changes nothing (no version bump)', async () => {
    const [s] = await commitTests([test('t1', [q('a')])], { mode: 'merge', mergeConflict: 'update' });
    expect(s).toEqual({ testId: 't1', added: 0, updated: 0, skipped: 1 });
    expect((await getBankTest('local:t1'))!.version).toBe(1);
  });
});

describe('Delete', () => {
  it('removes the test and keeps its questions as retired snapshots; other tests are untouched', async () => {
    await commitTests([test('t1', [q('a')]), test('t2', [q('x')])], { mode: 'add' });
    expect(await deleteBankTest('local:t1')).toBe(true);
    expect(await getBankTest('local:t1')).toBeUndefined();
    expect((await getBankQuestionByKey('local:t1::a'))?.retired).toBe(true);
    expect((await getBankQuestions('local:t2')).map((r) => r.questionId)).toEqual(['x']);
    expect(await deleteBankTest('local:t1')).toBe(false);
  });
});

describe('Remote-style commits carry the published version and hash as given', () => {
  it('uses the manifest\'s version and hash', async () => {
    await commitTests([test('r1', [q('a')], { version: 7, hash: 'f'.repeat(64), file: 'tests/r1.json' })], { mode: 'add', origin: 'remote' });
    expect(await getBankTest('remote:r1')).toMatchObject({ version: 7, hash: 'f'.repeat(64), file: 'tests/r1.json', origin: 'remote' });
  });
});
