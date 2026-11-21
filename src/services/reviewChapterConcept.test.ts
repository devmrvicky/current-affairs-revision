// @vitest-environment jsdom
// Review Center: Chapter and Concept (subtopic) filters, and the metadata that feeds them.
import { beforeEach, describe, expect, it } from 'vitest';
import { buildReviewItems, EMPTY_FILTERS, filterReviewItems, type QuestionInfo } from './reviewItems';
import { chapterIdOfSource } from './chapterMeta';
import { getDB, markedForReviewDB, universalAttemptsDB } from './db';
import { syncQuestionMark } from './questionMarkService';
import { recordPracticeSessionAttempts } from './attemptLedgerService';
import type { AttemptRow } from './reviewAnalytics';
import type { MarkedReviewQuestion } from '../types';
import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';

const NOW = 2_000_000_000_000;
let n = 0;
const attempt = (q: string, over: Partial<AttemptRow> = {}): AttemptRow => ({ id: `a${n++}`, universalQuestionId: q, subjectId: 'mathematics', topicId: 'average', isCorrect: false, wasAnswered: true, timeTaken: 5, attemptedAt: NOW - 1000, sessionId: `s${n}`, sourceFileName: 'x', ...over });
const info = (id: string, over: Partial<QuestionInfo> = {}): QuestionInfo => ({ id, question: `Q ${id}`, options: ['a', 'b'], correctAnswer: 'a', explanation: '', subjectId: 'mathematics', topicId: 'average', ...over });
const saved = (id: string, over: Partial<MarkedReviewQuestion> = {}): MarkedReviewQuestion => ({ id: `universal:${id}`, questionId: 0, universalQuestionId: id, question: `Q ${id}`, options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceFileName: 'Practice', sourceDate: 'd', markedAt: NOW - 5000, purpose: 'doubtful', purposes: ['doubtful'], ...over });
const build = (input: Partial<Parameters<typeof buildReviewItems>[0]>) => buildReviewItems({ attempts: [], saved: [], legacyWrong: [], questions: new Map(), monthlyPaths: new Set(), now: NOW, ...input });
const f = (over: object) => ({ ...EMPTY_FILTERS, ...over });

describe('chapterIdOfSource', () => {
  it('reads the chapter from a canonical chapter source, and nothing from anything else', () => {
    expect(chapterIdOfSource('chapter:mathematics/average/Test 1')).toBe('average');
    expect(chapterIdOfSource('chapter:mathematics/average/group/Test 1')).toBe('average');
    expect(chapterIdOfSource('chapter:mathematics/average')).toBeUndefined(); // no file part: not a test source
    expect(chapterIdOfSource('daily:2026-11-01')).toBeUndefined();
    expect(chapterIdOfSource('')).toBeUndefined();
    expect(chapterIdOfSource(undefined)).toBeUndefined();
  });
});

describe('items carry chapter and concept', () => {
  it('from the question pool for older records, which have neither saved', () => {
    const items = build({ attempts: [attempt('m1')], questions: new Map([['m1', info('m1', { chapterId: 'average', subtopicId: 'weighted-average' })]]) });
    expect(items[0]).toMatchObject({ chapterId: 'average', subtopicId: 'weighted-average' });
  });
  it('from what was saved with the question when the pool no longer has it', () => {
    const items = build({ saved: [saved('gone', { subjectId: 'mathematics', topicId: 'average', chapterId: 'average', subtopicId: 'age-problems' })] });
    expect(items[0]).toMatchObject({ subjectId: 'mathematics', topicId: 'average', chapterId: 'average', subtopicId: 'age-problems' });
  });
  it('from the attempt history as a last resort', () => {
    const items = build({ attempts: [attempt('h1', { chapterId: 'ratio', subtopicId: 'mixtures' })], questions: new Map([['h1', info('h1')]]) });
    expect(items[0]).toMatchObject({ chapterId: 'ratio', subtopicId: 'mixtures' });
  });
  it('the pool wins over the saved copy; an old record with no source of metadata has none (and nothing breaks)', () => {
    const [a] = build({ saved: [saved('p', { chapterId: 'stale' })], questions: new Map([['p', info('p', { chapterId: 'fresh' })]]) });
    expect(a.chapterId).toBe('fresh');
    const [old] = build({ saved: [saved('old')] });
    expect(old.chapterId).toBeUndefined();
    expect(old.subtopicId).toBeUndefined();
  });
});

describe('Chapter and Concept filters', () => {
  const items = build({
    attempts: ['a', 'b', 'c', 'd'].map((q) => attempt(q)),
    questions: new Map([
      ['a', info('a', { chapterId: 'average', subtopicId: 'weighted-average' })],
      ['b', info('b', { chapterId: 'average', subtopicId: 'age-problems' })],
      ['c', info('c', { subjectId: 'english', topicId: 'idioms', chapterId: 'idioms', subtopicId: 'phrasal' })],
      ['d', info('d')], // an older question with no chapter or concept
    ]),
  });
  const ids = (list: typeof items) => list.map((i) => i.universalId).sort();

  it('filters by chapter', () => {
    expect(ids(filterReviewItems(items, f({ chapterId: 'average' }), NOW))).toEqual(['a', 'b']);
    expect(ids(filterReviewItems(items, f({ chapterId: 'idioms' }), NOW))).toEqual(['c']);
    expect(filterReviewItems(items, f({ chapterId: 'nope' }), NOW)).toEqual([]);
  });
  it('filters by concept', () => {
    expect(ids(filterReviewItems(items, f({ subtopicId: 'age-problems' }), NOW))).toEqual(['b']);
  });
  it('works together with subject, topic and category — and an item with no chapter never matches a chapter filter', () => {
    expect(ids(filterReviewItems(items, f({ subjectId: 'mathematics', chapterId: 'average', subtopicId: 'weighted-average' }), NOW))).toEqual(['a']);
    expect(filterReviewItems(items, f({ subjectId: 'english', chapterId: 'average' }), NOW)).toEqual([]);
    expect(ids(filterReviewItems(items, f({ category: 'wrong', chapterId: 'average' }), NOW))).toEqual(['a', 'b']);
    expect(ids(filterReviewItems(items, f({}), NOW))).toEqual(['a', 'b', 'c', 'd']); // no filter: everything, including the one with no chapter
  });
});

describe('metadata is recorded from now on', () => {
  beforeEach(async () => { const db = await getDB(); await db.clear('markedForReview'); await db.clear('universalAttempts'); });
  const q = (id: string, over: Partial<UniversalQuestion> = {}): UniversalQuestion => ({ id, examIds: ['e'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: `Q ${id}`, difficulty: 'easy', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', source: 'chapter:mathematics/average/Test 1', subtopicId: 'weighted-average', ...over });

  it('marking a question saves its subject, topic, chapter and concept with it', async () => {
    await syncQuestionMark(q('m1'), 'doubtful', 'Practice');
    const rec = await markedForReviewDB.getById('universal:m1');
    expect(rec).toMatchObject({ subjectId: 'mathematics', topicId: 'average', chapterId: 'average', subtopicId: 'weighted-average' });
  });
  it('re-marking keeps that metadata, and a question with no chapter source saves none', async () => {
    await syncQuestionMark(q('m2', { source: 'daily:x', subtopicId: undefined }), 'revision', 'Practice');
    const rec = await markedForReviewDB.getById('universal:m2');
    expect(rec?.chapterId).toBeUndefined();
    expect(rec?.subtopicId).toBeUndefined();
    expect(rec?.subjectId).toBe('mathematics');
  });
  it('finishing a practice session records each attempt with its chapter and concept', async () => {
    const session = { id: 'sess', config: { examId: 'e', subjectIds: ['mathematics'], questionCount: 2, mode: 'practice' }, questionIds: ['p1', 'p2'], states: [{ questionId: 'p1', selectedAnswer: 'B', isMarkedForReview: false, timeTaken: 3 }, { questionId: 'p2', selectedAnswer: 'A', isMarkedForReview: false, timeTaken: 4 }], visitedIndices: [0, 1], startedAt: 0, totalPausedTime: 0 } as unknown as PracticeSession;
    await recordPracticeSessionAttempts(session, new Map([['p1', q('p1')], ['p2', q('p2', { source: 'chapter:mathematics/ratio/T', subtopicId: 'mixtures' })]]), 1000);
    const rows = (await universalAttemptsDB.getAll()).sort((a, b) => a.universalQuestionId!.localeCompare(b.universalQuestionId!));
    expect(rows.map((r) => [r.universalQuestionId, r.chapterId, r.subtopicId])).toEqual([['p1', 'average', 'weighted-average'], ['p2', 'ratio', 'mixtures']]);
  });
  it('old rows without the new fields are still valid and still read', async () => {
    await universalAttemptsDB.recordMany([{ id: 'legacy', universalQuestionId: 'x', examId: 'e', subjectId: 'mathematics', isCorrect: false, wasAnswered: true, timeTaken: 1, attemptedAt: 1, sessionId: 's', sourceFileName: 'f' }]);
    const [row] = await universalAttemptsDB.getAll();
    expect(row.chapterId).toBeUndefined();
    const [item] = build({ attempts: [row], questions: new Map([['x', info('x')]]) });
    expect(item.chapterId).toBeUndefined();
  });
});
