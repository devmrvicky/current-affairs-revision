// @vitest-environment jsdom
// Local / remote bank tests flow into the existing question pool and Practice by Topic library; bundled content is unchanged.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB } from '../db';
import { commitTests, deleteBankTest, type PreparedTest } from './bankDb';
import { emitBankChanged } from './bankEvents';
import { bankQuestionId, bankSource, parseBankQuestionId, resolveRetiredBankQuestions } from './poolProvider';
import { getQuestions, getQuestionsByExam, resolveQuestionsByIds, getQuestionPoolVersion } from '../questionRepository';
import { getPracticeTests } from '../practiceTestRepository';
import type { BankQuestionData } from './types';

const q = (id: string, over: Partial<BankQuestionData> = {}): BankQuestionData => ({ id, questionType: 'mcq', question: `Bank question ${id}?`, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'B', explanation: 'why', difficulty: 'hard', ...over });
const test = (id: string, questions: BankQuestionData[], over: Partial<PreparedTest> = {}): PreparedTest => ({ id, title: `Bank ${id}`, subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], questions, sourceFile: `${id}.json`, ...over });

beforeEach(async () => {
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata'] as const) await db.clear(s);
  emitBankChanged();
});

describe('bundled content is unchanged when the bank is empty', () => {
  it('the pool has no bank question, and adding then deleting a bank test returns it to exactly the same pool', async () => {
    const before = (await getQuestions()).map((x) => x.id);
    expect(before.some((id) => id.startsWith('qb:'))).toBe(false);
    await commitTests([test('t1', [q('a'), q('b')])], { mode: 'add' });
    emitBankChanged();
    expect((await getQuestions()).length).toBe(before.length + 2);
    await deleteBankTest('local:t1');
    emitBankChanged();
    expect((await getQuestions()).map((x) => x.id)).toEqual(before); // same ids, same order
  });
  it('a write to the bank invalidates the pool cache (practice-test library rebuilds)', async () => {
    await getQuestions();
    const v = getQuestionPoolVersion();
    emitBankChanged();
    expect(getQuestionPoolVersion()).toBe(v + 1);
  });
});

describe('bank questions in the pool', () => {
  it('get collision-proof ids, the test\'s subject/exams, chapter as topic, and keep their authored fields', async () => {
    await commitTests([test('avg-1', [q('a'), q('b', { topicId: 'ratio', difficulty: undefined })])], { mode: 'add' });
    emitBankChanged();
    const mine = (await getQuestions()).filter((x) => x.id.startsWith('qb:'));
    expect(mine.map((x) => x.id)).toEqual(['qb:local:avg-1:a', 'qb:local:avg-1:b']);
    expect(mine[0]).toMatchObject({ subjectId: 'mathematics', topicId: 'average', examIds: ['ssc-chsl'], correctAnswer: 'B', difficulty: 'hard', explanation: 'why', source: 'chapter:mathematics/average/Bank avg-1 (Local)' });
    expect(mine[1]).toMatchObject({ topicId: 'ratio', difficulty: 'medium' }); // an unset difficulty reads as medium, like bundled native files
    expect((await getQuestionsByExam('ssc-chsl')).some((x) => x.id === 'qb:local:avg-1:a')).toBe(true);
    expect(parseBankQuestionId('qb:local:avg-1:a')).toEqual({ origin: 'local', testId: 'avg-1', questionId: 'a' });
    expect(parseBankQuestionId('qb:remote:t:id:with:colons')).toEqual({ origin: 'remote', testId: 't', questionId: 'id:with:colons' });
    expect(parseBankQuestionId('current-affairs-daily-x')).toBeNull();
  });
  it('a local and a remote test with the same ids stay separate questions', async () => {
    await commitTests([test('same', [q('a')])], { mode: 'add', origin: 'local' });
    await commitTests([test('same', [q('a', { question: 'remote version?' })])], { mode: 'add', origin: 'remote' });
    emitBankChanged();
    const mine = (await getQuestions()).filter((x) => x.id.startsWith('qb:'));
    expect(mine.map((x) => x.id).sort()).toEqual(['qb:local:same:a', 'qb:remote:same:a']);
    expect(new Set(mine.map((x) => x.source)).size).toBe(2); // two different tests, tagged (Local) / (Published)
  });
  it('appear in Practice by Topic as tests under their subject and chapter, with the title and count', async () => {
    await commitTests([test('avg-1', [q('a'), q('b'), q('c')])], { mode: 'add' });
    emitBankChanged();
    const tests = await getPracticeTests('ssc-chsl', 'mathematics');
    const mine = tests.find((t) => t.title.startsWith('Bank avg-1'));
    expect(mine).toBeTruthy();
    expect(mine).toMatchObject({ questionCount: 3, chapterId: 'average', source: 'chapter', rawSource: bankSource({ subjectId: 'mathematics', chapterId: 'average', title: 'Bank avg-1', origin: 'local' }) });
    expect(mine!.title).toMatch(/\(Local\)$/);
    expect(mine!.questionIds).toEqual(['qb:local:avg-1:a', 'qb:local:avg-1:b', 'qb:local:avg-1:c']);
  });
  it('two bank tests with the same title in the same chapter stay two tests', async () => {
    await commitTests([test('one', [q('a')], { title: 'Same title' }), test('two', [q('a')], { title: 'Same title' })], { mode: 'add' });
    emitBankChanged();
    const mine = (await getPracticeTests('ssc-chsl', 'mathematics')).filter((t) => t.title.startsWith('Same title'));
    expect(mine).toHaveLength(2);
  });
  it('a test with no exams of its own is offered to the exams whose syllabus has its subject', async () => {
    await commitTests([test('noexam', [q('a')], { examIds: [] })], { mode: 'add' });
    emitBankChanged();
    const got = (await getQuestions()).find((x) => x.id === 'qb:local:noexam:a')!;
    expect(got.examIds.length).toBeGreaterThan(0);
  });
});

describe('questions removed from the bank still resolve for review', () => {
  it('a replaced-away or deleted question opens by its old id as the frozen snapshot', async () => {
    await commitTests([test('t1', [q('a'), q('b')])], { mode: 'add' });
    await commitTests([test('t1', [q('a'), q('z')])], { mode: 'replace' });
    emitBankChanged();
    const ids = ['qb:local:t1:a', 'qb:local:t1:b', 'qb:local:t1:z'];
    const resolved = await resolveQuestionsByIds(ids);
    expect(resolved.map((x) => x.id)).toEqual(ids);
    expect(resolved[1].question).toBe('Bank question b?'); // the original, not z
    expect((await getQuestions()).some((x) => x.id === 'qb:local:t1:b')).toBe(false); // …but it is not in the pool or any test
    await deleteBankTest('local:t1');
    emitBankChanged();
    expect((await resolveRetiredBankQuestions(['qb:local:t1:a'])).map((x) => x.id)).toEqual(['qb:local:t1:a']);
    expect((await resolveQuestionsByIds(['qb:local:t1:a'])).length).toBe(1);
  });
  it('an id that was never in the bank resolves to nothing', async () => {
    expect(await resolveQuestionsByIds(['qb:local:nope:x', 'not-a-bank-id'])).toEqual([]);
    expect(bankQuestionId('local', 't', 'q')).toBe('qb:local:t:q');
  });
});
