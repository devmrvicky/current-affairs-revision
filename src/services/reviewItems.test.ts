import { describe, expect, it } from 'vitest';
import {
  buildReviewItems, buildRevisionQuiz, filterReviewItems, isSavedButNotRevisited, monthKeyOf, monthSummaries, reviewMetrics, selectForRevision,
  type BuildInput, type QuestionInfo, type ReviewItem,
} from './reviewItems';
import type { AttemptRow } from './reviewAnalytics';
import type { MarkedReviewQuestion, WrongQuestion } from '../types';

const DAY = 86_400_000;
const NOW = 200 * DAY;
let n = 0;
const attempt = (q: string, correct: boolean, daysAgo: number, over: Partial<AttemptRow> = {}): AttemptRow => {
  n++;
  return { id: `a${n}`, universalQuestionId: q, subjectId: 'mathematics', topicId: 'average', isCorrect: correct, wasAnswered: true, timeTaken: 10, attemptedAt: NOW - daysAgo * DAY, sessionId: `s${n}`, sourceFileName: `universal-session-s${n}`, ...over };
};
const info = (id: string, over: Partial<QuestionInfo> = {}): QuestionInfo => ({ id, question: `Q ${id}`, options: ['a', 'b'], correctAnswer: 'a', explanation: `why ${id}`, subjectId: 'mathematics', topicId: 'average', difficulty: 'easy', ...over });
const saved = (id: string, over: Partial<MarkedReviewQuestion> = {}): MarkedReviewQuestion => ({
  id: `universal:${id}`, questionId: 0, universalQuestionId: id, question: `Q ${id}`, options: ['a', 'b'], correctAnswer: 'a', explanation: `why ${id}`, sourceFileName: 'Mock 1', sourceDate: 'x', markedAt: NOW - 3 * DAY, ...over,
});
const legacyWrong = (text: string, over: Partial<WrongQuestion> = {}): WrongQuestion => ({
  id: `d_${text}`, questionId: 1, question: text, options: ['a', 'b'], correctAnswer: 'a', explanation: 'e', dateKey: '2025-07-01', displayDate: '1 Jul', fileName: '2025/July/Test 01.json', wrongCount: 2, consecutiveCorrect: 0, status: 'learning', lastAttemptAt: NOW - 5 * DAY, addedAt: NOW - 9 * DAY, ...over,
});
const base = (over: Partial<BuildInput> = {}): BuildInput => ({ attempts: [], saved: [], legacyWrong: [], questions: new Map(), monthlyPaths: new Set(['2025/July/Test 01.json', '2025/June/Test 02.json']), now: NOW, ...over });
const byKey = (items: ReviewItem[], key: string) => items.find((i) => i.key === key)!;

describe('one item per question, however many categories it is in', () => {
  it('a question that is wrong AND saved with two purposes is a single item in four categories', () => {
    const items = buildReviewItems(base({
      attempts: [attempt('q1', false, 9), attempt('q1', false, 4)],
      saved: [saved('q1', { purpose: 'doubtful', purposes: ['doubtful', 'revision'] })],
      questions: new Map([['q1', info('q1')]]),
    }));
    expect(items).toHaveLength(1);
    const it = items[0];
    expect(it.categories).toEqual(['wrong', 'doubtful', 'revision']);
    expect(it.purposes).toEqual(['doubtful', 'revision']);
    expect(it.wrong).toBe(2);
    expect(it.subjectId).toBe('mathematics');
  });

  it('wrong questions need a question to show; mastered ones (3 correct in a row) drop out', () => {
    const items = buildReviewItems(base({
      attempts: [attempt('gone', false, 5), attempt('mastered', false, 9), attempt('mastered', true, 3), attempt('mastered', true, 2), attempt('mastered', true, 1), attempt('live', false, 2)],
      questions: new Map([['mastered', info('mastered')], ['live', info('live')]]), // 'gone' has no copy anywhere
    }));
    expect(items.map((i) => i.key)).toEqual(['u:live']);
  });

  it('older marks with no purpose are "Marked for Review"; saved purposes never double up with them', () => {
    const items = buildReviewItems(base({ saved: [saved('old', { purpose: undefined, universalQuestionId: undefined, id: 'file_1', question: 'Old marked' }), saved('new', { purpose: 'practice', purposes: ['practice'] })] }));
    expect(byKey(items, 't:old marked').categories).toEqual(['review']);
    expect(byKey(items, 'u:new').categories).toEqual(['practice']);
  });

  it('daily/monthly questions match by text: saved + wrong is one item', () => {
    const items = buildReviewItems(base({
      saved: [saved('x', { universalQuestionId: undefined, id: 'f_1', question: 'Who wrote it?', sourceFileName: '2025/July/Test 01.json', purpose: 'revision', purposes: ['revision'] })],
      legacyWrong: [legacyWrong('  who WROTE it? '), legacyWrong('Mastered one', { status: 'mastered' })],
    }));
    expect(items).toHaveLength(1);
    expect(items[0].categories).toEqual(['wrong', 'revision']);
    expect(items[0].monthKey).toBe('2025/July');
  });

  it('every subject and source is covered: maths, english, reasoning, GS, current affairs and mocks sit in one list', () => {
    const subjects = ['mathematics', 'english', 'reasoning', 'general-awareness', 'current-affairs'];
    const items = buildReviewItems(base({
      attempts: subjects.map((s, i) => attempt(`q${i}`, false, i + 1, { subjectId: s, sourceFileName: i === 4 ? 'mock-session-m1' : `universal-session-x${i}` })),
      questions: new Map(subjects.map((s, i) => [`q${i}`, info(`q${i}`, { subjectId: s })])),
    }));
    expect(items.map((i) => i.subjectId).sort()).toEqual([...subjects].sort());
    expect(reviewMetrics(items).bySubject).toHaveLength(5);
  });
});

describe('metrics come from the items', () => {
  const items = buildReviewItems(base({
    attempts: [attempt('a', false, 6), attempt('a', false, 3), attempt('b', false, 2), attempt('b', true, 1), attempt('c', true, 1)],
    saved: [saved('a', { purposes: ['doubtful'], purpose: 'doubtful' }), saved('c', { purposes: ['revision'], purpose: 'revision' })],
    questions: new Map([['a', info('a')], ['b', info('b', { subjectId: 'english' })], ['c', info('c')]]),
  }));
  it('counts categories, unresolved, repeated mistakes, subjects and accuracy', () => {
    const m = reviewMetrics(items);
    expect(m.total).toBe(3);
    expect(m.byCategory).toEqual({ wrong: 2, review: 0, doubtful: 1, practice: 0, revision: 1 });
    expect(m.repeatedMistakes).toBe(1);
    expect(m.unresolved).toBe(3);
    expect(m.bySubject).toEqual([{ subjectId: 'mathematics', count: 2 }, { subjectId: 'english', count: 1 }]);
    expect(m.accuracy).toEqual({ answered: 5, wrong: 3, percent: 40 });
  });
  it('accuracy is null — not 0 — when nothing was answered', () => {
    expect(reviewMetrics([]).accuracy.percent).toBeNull();
    expect(reviewMetrics([]).total).toBe(0);
  });
});

describe('filters work together and never disagree', () => {
  const items = buildReviewItems(base({
    attempts: [attempt('a', false, 30), attempt('a', false, 2), attempt('b', true, 1), attempt('b', false, 20), attempt('c', false, 60, { topicId: 'percent' })],
    saved: [saved('a', { purposes: ['doubtful'], purpose: 'doubtful', markedAt: NOW - 2 * DAY }), saved('b', { purposes: ['practice'], purpose: 'practice', markedAt: NOW - 40 * DAY }), saved('d', { purposes: ['revision'], purpose: 'revision', markedAt: NOW - 1 * DAY })],
    questions: new Map([['a', info('a', { difficulty: 'hard' })], ['b', info('b', { subjectId: 'english', difficulty: 'easy' })], ['c', info('c', { difficulty: 'medium', topicId: 'percent' })], ['d', info('d', { difficulty: 'easy' })]]),
  }));
  const f = (over: object) => filterReviewItems(items, { category: 'all', ...over }, NOW).map((i) => i.universalId).sort();

  it('by category, subject, topic, difficulty', () => {
    expect(f({ category: 'wrong' })).toEqual(['a', 'b', 'c']);
    expect(f({ category: 'doubtful' })).toEqual(['a']);
    expect(f({ subjectId: 'english' })).toEqual(['b']);
    expect(f({ topicId: 'percent' })).toEqual(['c']);
    expect(f({ difficulty: 'easy' })).toEqual(['b', 'd']);
  });
  it('by last result, repeated mistakes, recently saved, date range', () => {
    expect(f({ status: 'wrong' })).toEqual(['a', 'c']);       // b's latest attempt was correct
    expect(f({ status: 'correct' })).toEqual(['b']);
    expect(f({ status: 'unattempted' })).toEqual(['d']);
    expect(f({ repeatedOnly: true })).toEqual(['a']);
    expect(f({ recentlySaved: true })).toEqual(['a', 'd']);
    expect(f({ dateRange: '7d' })).toEqual(['a', 'b', 'd']);
    expect(f({ dateRange: '90d' })).toEqual(['a', 'b', 'c', 'd']);
  });
  it('filters combine (AND) and search covers text and source', () => {
    expect(f({ category: 'wrong', subjectId: 'mathematics', status: 'wrong' })).toEqual(['a', 'c']);
    expect(f({ category: 'wrong', subjectId: 'mathematics', status: 'wrong', difficulty: 'hard' })).toEqual(['a']);
    expect(f({ query: 'why d' })).toEqual(['d']);
    expect(f({ query: 'nothing like this' })).toEqual([]);
  });
});

describe('monthly Current Affairs', () => {
  const items = buildReviewItems(base({
    saved: [
      saved('x', { universalQuestionId: undefined, id: 'f1', question: 'July saved A', sourceFileName: '2025/July/Test 01.json', purpose: 'revision', purposes: ['revision'], markedAt: NOW - 10 * DAY }),
      saved('y', { universalQuestionId: undefined, id: 'f2', question: 'June saved', sourceFileName: '2025/June/Test 02.json', purpose: 'doubtful', purposes: ['doubtful'] }),
    ],
    legacyWrong: [legacyWrong('July wrong B'), legacyWrong('July saved A', { lastAttemptAt: NOW - 1 * DAY })],
  }));
  it('recognises monthly sources and ignores everything else', () => {
    const paths = new Set(['2025/July/Test 01.json']);
    expect(monthKeyOf('2025/July/Test 01.json', paths)).toBe('2025/July');
    expect(monthKeyOf('daily-2025-07-01.json', paths)).toBeUndefined();
  });
  it('summarises per month, newest first: saved, wrong, and not-revisited-since-saving', () => {
    expect(monthSummaries(items)).toEqual([
      { monthKey: '2025/July', label: 'July 2025', total: 2, wrong: 2, notRevisited: 0 }, // "July saved A" was attempted again after saving; "July wrong B" was never saved
      { monthKey: '2025/June', label: 'June 2025', total: 1, wrong: 0, notRevisited: 1 },
    ]);
  });
  it('"not revisited" means saved and not attempted since — a question that is merely wrong is not counted', () => {
    expect(filterReviewItems(items, { category: 'all', month: '2025/July' }, NOW).filter(isSavedButNotRevisited)).toEqual([]);
    expect(filterReviewItems(items, { category: 'all', month: '2025/June' }, NOW).filter(isSavedButNotRevisited)).toHaveLength(1);
  });
  it('"monthly only" keeps questions from every month and drops everything else (mixed monthly revision)', () => {
    const mixed = buildReviewItems(base({
      attempts: [attempt('u1', false, 3)], questions: new Map([['u1', info('u1')]]),
      saved: [saved('x', { universalQuestionId: undefined, id: 'a', question: 'July one', sourceFileName: '2025/July/Test 01.json', purpose: 'revision', purposes: ['revision'] }), saved('y', { universalQuestionId: undefined, id: 'b', question: 'June one', sourceFileName: '2025/June/Test 02.json', purpose: 'revision', purposes: ['revision'] })],
    }));
    expect(filterReviewItems(mixed, { category: 'all', monthlyOnly: true }, NOW).map((i) => i.question).sort()).toEqual(['July one', 'June one']);
    expect(filterReviewItems(mixed, { category: 'all' }, NOW)).toHaveLength(3);
  });
  it('a month filter yields that month’s wrong and not-revisited questions', () => {
    const july = filterReviewItems(items, { category: 'wrong', month: '2025/July' }, NOW);
    expect(july.map((i) => i.question).sort()).toEqual(['July saved A', 'July wrong B']);
    expect(filterReviewItems(items, { category: 'all', month: '2025/June' }, NOW)).toHaveLength(1);
  });
});

describe('generating a revision test', () => {
  const mk = (i: number, over: Partial<ReviewItem> = {}): ReviewItem => ({
    key: `u:q${i}`, universalId: `q${i}`, question: `Q${i}`, options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceLabel: '', categories: ['wrong'], purposes: [],
    attempts: 1, answered: 1, wrong: 1, lastWasWrong: true, trailingCorrect: 0, difficulty: i % 2 ? 'hard' : 'easy', priority: i * 10, ...over,
  });
  const items = Array.from({ length: 10 }, (_, i) => mk(i));

  it('not randomized: highest revision priority first, limited to the count', () => {
    expect(selectForRevision(items, { count: 3, randomize: false }).map((i) => i.universalId)).toEqual(['q9', 'q8', 'q7']);
  });
  it('randomized: a real shuffle (injectable for the test), same questions, no repeats, honours count', () => {
    let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const a = selectForRevision(items, { count: 'all', randomize: true }, rng).map((i) => i.universalId);
    expect(a.slice().sort()).toEqual(items.map((i) => i.universalId).sort());
    expect(a).not.toEqual(items.map((i) => i.universalId));
    expect(selectForRevision(items, { count: 4, randomize: true }, rng)).toHaveLength(4);
  });
  it('difficulty narrows the pool; a count larger than the pool just returns what exists', () => {
    expect(selectForRevision(items, { count: 'all', difficulty: 'hard', randomize: false }).every((i) => i.difficulty === 'hard')).toBe(true);
    expect(selectForRevision(items, { count: 99, difficulty: 'easy', randomize: false })).toHaveLength(5);
    expect(selectForRevision(items, { count: 5, difficulty: 'mixed', randomize: false })).toHaveLength(5);
  });
  it('is read-only: the items it was given are untouched', () => {
    const before = JSON.stringify(items);
    selectForRevision(items, { count: 5, randomize: true });
    expect(JSON.stringify(items)).toBe(before);
  });
  it('builds a quiz the test engine can run, linking each question back to its universal id', () => {
    const quiz = buildRevisionQuiz(selectForRevision(items, { count: 2, randomize: false }), 'Revision');
    expect(quiz.date).toBe('Revision');
    expect(quiz.questions.map((q) => [q.id, q.universalId])).toEqual([[1, 'q9'], [2, 'q8']]);
    expect(quiz.questions[0].options).toEqual(['a', 'b']);
  });
});
