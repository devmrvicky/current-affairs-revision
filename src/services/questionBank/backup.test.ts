// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, universalAttemptsDB, bookmarksDB } from '../db';
import { commitTests, getBankQuestionByKey, getBankQuestions, getBankTests, type PreparedTest } from './bankDb';
import { BACKUP_FORMAT, buildBackup, exportTests, previewBackup, restoreBackup } from './backup';
import { parseTestFile } from './testFile';
import type { BankQuestionData } from './types';

const q = (id: string, over: Partial<BankQuestionData> = {}): BankQuestionData => ({ id, questionType: 'mcq', question: `Q ${id}?`, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', explanation: 'e', difficulty: 'easy', ...over });
const test = (id: string, questions: BankQuestionData[]): PreparedTest => ({ id, title: `T ${id}`, subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], questions, sourceFile: `${id}.json` });
const attempt = { id: 'att1', universalQuestionId: 'qb:local:t1:b', examId: 'e', subjectId: 'mathematics', topicId: 'average', isCorrect: true, wasAnswered: true, timeTaken: 4, attemptedAt: 1, sessionId: 's', sourceFileName: 'x' };
const bookmark = { id: 'bm1', questionId: 'qb:local:t1:b', question: 'Q b?', options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceFileName: 'x', sourceDate: '', bookmarkedAt: 1 };

async function wipe() {
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata', 'universalAttempts', 'bookmarks', 'markedForReview', 'wrongQuestions', 'savedTests'] as const) await db.clear(s);
}
async function seed() {
  await commitTests([test('t1', [q('a'), q('b')]), test('t2', [q('x')])], { mode: 'add' });
  await commitTests([test('t1', [q('a'), q('z')])], { mode: 'replace' }); // b becomes a retired snapshot
  await universalAttemptsDB.recordMany([attempt]);
  await bookmarksDB.upsert(bookmark as never);
}
beforeEach(wipe);

describe('export', () => {
  it('exports selected local tests as valid JSON that parses back to the same questions', async () => {
    await seed();
    const files = await exportTests(['t1']);
    expect(files.map((f) => f.fileName)).toEqual(['t1.json']);
    const parsed = parseTestFile(files[0].text, 't1.json');
    expect(parsed.ok).toBe(true);
    expect(parsed.questions.map((x) => x.id)).toEqual(['a', 'z']);
    expect(parsed.meta).toMatchObject({ id: 't1', subjectId: 'mathematics', chapterId: 'average' });
    expect((await exportTests('all')).map((f) => f.fileName)).toEqual(['t1.json', 't2.json']);
    expect(await exportTests(['missing'])).toEqual([]);
  });
});

describe('backup', () => {
  it('without progress: tests + question-bank metadata only — attempts and bookmarks are NOT in the file', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: false, now: new Date('2026-11-02T00:00:00Z') });
    const file = JSON.parse(b.text);
    expect(file).toMatchObject({ format: BACKUP_FORMAT, version: 1, createdAt: '2026-11-02T00:00:00.000Z' });
    expect(file.tests).toHaveLength(2);
    expect(file.retiredQuestions.map((r: { key: string }) => r.key)).toEqual(['local:t1::b']);
    expect(file.importHistory.length).toBeGreaterThan(0);
    expect('progress' in file).toBe(false);
    expect(b.text).not.toContain('att1');
    expect(b.text).not.toContain('bm1');
    expect(b.fileName).toBe('question-bank-backup-2026-11-02.json');
    expect(b.counts).toEqual({ tests: 2, questions: 3, progressRecords: 0 });
  });
  it('with progress explicitly selected: attempts, bookmarks and the other progress stores are included', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: true });
    const file = JSON.parse(b.text);
    expect(file.progress.universalAttempts.map((r: { id: string }) => r.id)).toEqual(['att1']);
    expect(file.progress.bookmarks.map((r: { id: string }) => r.id)).toEqual(['bm1']);
    expect(Object.keys(file.progress).sort()).toEqual(['bookmarks', 'markedForReview', 'savedTests', 'universalAttempts', 'wrongQuestions']);
    expect(b.counts.progressRecords).toBe(2);
  });
  it('does not include remote (published) tests — they come back from the server', async () => {
    await commitTests([test('r1', [q('a')])], { mode: 'add', origin: 'remote' });
    await commitTests([test('t1', [q('a')])], { mode: 'add' });
    expect(JSON.parse((await buildBackup({ includeProgress: false })).text).tests).toHaveLength(1);
  });
});

describe('restore — validation and preview', () => {
  it.each([
    ['not JSON', '{nope', /not valid JSON/],
    ['a different kind of file', JSON.stringify({ hello: 1 }), /not an ExamVerse question-bank backup/],
    ['a newer format version', JSON.stringify({ format: BACKUP_FORMAT, version: 99, tests: [] }), /version 99/],
    ['no tests list', JSON.stringify({ format: BACKUP_FORMAT, version: 1 }), /no "tests" list/],
    ['an invalid test inside', JSON.stringify({ format: BACKUP_FORMAT, version: 1, tests: [{ id: 'x', title: 'x', subject: 'mathematics', chapter: 'c', questions: [{ id: 'q', question: 'Q', options: ['a', 'b'], correctAnswer: 'Z' }] }] }), /Test 1 \(“x”\)/],
    ['duplicate test ids', JSON.stringify({ format: BACKUP_FORMAT, version: 1, tests: [JSON.parse('{"id":"d","title":"d","subject":"mathematics","chapter":"c","questions":[{"id":"1","question":"Q","options":["a","b"],"correctAnswer":"A"}]}'), JSON.parse('{"id":"d","title":"d","subject":"mathematics","chapter":"c","questions":[{"id":"1","question":"Q","options":["a","b"],"correctAnswer":"A"}]}')] }), /more than once/],
    ['progress for an unknown store', JSON.stringify({ format: BACKUP_FORMAT, version: 1, tests: [], progress: { secrets: [] } }), /does not restore/],
  ])('rejects %s, with a message, and previews as not OK', async (_n, text, re) => {
    const p = await previewBackup(text);
    expect(p.ok).toBe(false);
    expect(p.errors.some((e) => re.test(e.message))).toBe(true);
    await expect(restoreBackup(text, { restoreProgress: true })).rejects.toThrow();
    expect(await getBankTests()).toEqual([]);
  });
  it('previews tests, counts and which existing tests it would replace', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: true });
    const db = await getDB();
    await commitTests([test('t2', [q('different')])], { mode: 'replace' }); // diverge so there is something to replace
    await db.delete('tests', 'local:t1'); // t1 gone locally → would be re-created, t2 replaced
    const p = await previewBackup(b.text);
    expect(p).toMatchObject({ ok: true, questionCount: 3, retiredCount: 1, hasProgress: true, progressCounts: { universalAttempts: 1, bookmarks: 1 } });
    expect(p.tests).toEqual([{ id: 't1', title: 'T t1', questionCount: 2, willReplace: false }, { id: 't2', title: 'T t2', questionCount: 1, willReplace: true }]);
  });
});

describe('restore — one transaction', () => {
  it('restores tests, questions, retired snapshots and history into an empty database; progress only when asked', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: true });
    await wipe();
    const r = await restoreBackup(b.text, { restoreProgress: false });
    expect(r).toEqual({ tests: 2, questions: 3, progressRecords: 0 });
    expect((await getBankQuestions('local:t1')).map((x) => x.questionId)).toEqual(['a', 'z']);
    expect((await getBankQuestionByKey('local:t1::b'))?.retired).toBe(true);
    const db = await getDB();
    expect(await db.getAll('universalAttempts')).toEqual([]); // the backup carried progress, but the person did not choose to restore it
    expect(await db.getAll('bookmarks')).toEqual([]);
  });
  it('restores progress when it is explicitly chosen', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: true });
    await wipe();
    const r = await restoreBackup(b.text, { restoreProgress: true });
    expect(r.progressRecords).toBe(2);
    const db = await getDB();
    expect((await db.getAll('universalAttempts')).map((x) => x.id)).toEqual(['att1']);
    expect((await db.getAll('bookmarks')).map((x) => x.id)).toEqual(['bm1']);
  });
  it('replaces a test with the same id and leaves other tests alone', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: false });
    await commitTests([test('t1', [q('only-now')])], { mode: 'replace' });
    await commitTests([test('t3', [q('keep')])], { mode: 'add' });
    await restoreBackup(b.text, { restoreProgress: false });
    expect((await getBankQuestions('local:t1')).map((x) => x.questionId)).toEqual(['a', 'z']);
    expect((await getBankQuestions('local:t3')).map((x) => x.questionId)).toEqual(['keep']);
  });
  it('a failure part-way restores NOTHING: tests, snapshots and progress all untouched', async () => {
    await seed();
    const b = await buildBackup({ includeProgress: true });
    await wipe();
    await commitTests([test('pre', [q('p')])], { mode: 'add' });
    const db = await getDB();
    const before = JSON.stringify({ t: await db.getAll('tests'), q: await db.getAll('questions'), a: await db.getAll('universalAttempts'), b: await db.getAll('bookmarks') });
    await expect(restoreBackup(b.text, { restoreProgress: true, afterWrite: (n) => { if (n === 8) throw new Error('disk full'); } })).rejects.toThrow(/Nothing was changed/);
    expect(JSON.stringify({ t: await db.getAll('tests'), q: await db.getAll('questions'), a: await db.getAll('universalAttempts'), b: await db.getAll('bookmarks') })).toBe(before);
  });
  it('a retired snapshot never overwrites a question that is active in a restored test', async () => {
    await seed();
    const b = JSON.parse((await buildBackup({ includeProgress: false })).text);
    b.retiredQuestions.push({ ...b.retiredQuestions[0], key: 'local:t1::a', questionId: 'a' }); // a bogus retired copy of an ACTIVE question
    await wipe();
    await restoreBackup(JSON.stringify(b), { restoreProgress: false });
    expect((await getBankQuestionByKey('local:t1::a'))?.retired).toBeUndefined();
  });
});
