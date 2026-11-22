import { describe, expect, it } from 'vitest';
import { analyzePracticeSession } from './practiceAnalysisService';
import { buildResultTables, filterQuestionRows, marksFor, paginate, sortQuestionRows, strengthLabel, EMPTY_CONTEXT } from './resultTables';
import { mockResultContext, practiceResultContext, previousPracticeAttempts, analyzeLegacySession } from './resultContext';
import { ledger, legacy, question, questionsById, session } from '../test/resultFixtures';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { PracticeSession } from '../types/practiceSession';
import type { MockAttemptRecord } from '../types/mockSession';

const s = session();
const analysis = analyzePracticeSession(s, questionsById);
const ctx = practiceResultContext(s, questionsById, ledger);
const t = buildResultTables(analysis, ctx);
const row = (list: { id: string }[], id: string) => list.find((r) => r.id === id)!;

describe('scorecard', () => {
  it('shows score, scheme, accuracy, attempt rate, counts, marked, time vs allotted and average time — exactly', () => {
    const v = Object.fromEntries(t.scorecard.map((r) => [r.key, r]));
    expect(v.score.value).toBe('5 / 12'); // 3×2 − 2×0.5
    expect(v.score.note).toBe('41.7%');
    expect(v.marking.value).toBe('+2 correct · −0.5 incorrect');
    expect(v.accuracy.value).toBe('60%'); // 3 of 5 attempted
    expect(v.attemptRate.value).toBe('83.3%'); // 5 of 6
    expect(v.attempted.value).toBe('5 / 6');
    expect(v.correct.value).toBe('3');
    expect(v.incorrect.value).toBe('2');
    expect(v.unattempted.value).toBe('1');
    expect(v.marked.value).toBe('1');
    expect(v.time.value).toBe('06:40 of 10:00'); // wall-clock 400 s of 2 × 5 min
    expect(v.avgTime.value).toBe('53s'); // (20+100+40+10+95) / 5 timed questions
  });
  it('says so when nothing was attempted or there is no time limit / marking scheme', () => {
    const blank = { ...s, states: s.states.map((st) => ({ ...st, selectedAnswer: null, timeTaken: 0, isMarkedForReview: false, markPurpose: undefined })), config: { ...s.config, marking: undefined, timing: undefined, durationSeconds: undefined } } as PracticeSession;
    const a = analyzePracticeSession(blank, questionsById);
    const tb = buildResultTables(a, practiceResultContext(blank, questionsById, []));
    const v = Object.fromEntries(tb.scorecard.map((r) => [r.key, r]));
    expect(v.accuracy.value).toBe('Not available');
    expect(v.marking.value).toBe('No marking scheme');
    expect(v.avgTime.value).toBe('Not recorded');
    expect(v.time.value).toMatch(/\(no time limit\)$/);
    expect(tb.time.available).toBe(false);
  });
});

describe('section-wise table', () => {
  it('lists each section with its own counts, score, accuracy and time spent / allotted', () => {
    expect(t.sections).toHaveLength(2);
    expect(t.sections[0]).toMatchObject({ questions: 3, attempted: 3, correct: 2, wrong: 1, skipped: 0, score: 3.5, maxScore: 6, accuracy: 66.7, timeSpentSeconds: 160, allottedSeconds: 300 });
    expect(t.sections[1]).toMatchObject({ questions: 3, attempted: 2, correct: 1, wrong: 1, skipped: 1, score: 1.5, maxScore: 6, accuracy: 50, timeSpentSeconds: 105, allottedSeconds: 300 });
  });
  it('is empty for a test without sections', () => {
    const plain = session({ timing: undefined });
    expect(practiceResultContext(plain, questionsById, []).sections).toEqual([]);
  });
});

describe('subject-wise and topic-wise tables', () => {
  it('count attempted/correct/wrong/skipped, accuracy, time and marks per subject', () => {
    expect(t.subjects.map((r) => r.id)).toEqual(['mathematics', 'english']);
    expect(row(t.subjects, 'mathematics')).toMatchObject({ questions: 4, attempted: 3, correct: 2, wrong: 1, skipped: 1, accuracy: 66.7, timeSeconds: 160, marks: 3.5 });
    expect(row(t.subjects, 'english')).toMatchObject({ questions: 2, attempted: 2, correct: 1, wrong: 1, skipped: 0, accuracy: 50, timeSeconds: 105, marks: 1.5 });
  });
  it('per topic, with the subject it belongs to', () => {
    expect(t.topics).toHaveLength(3);
    expect(row(t.topics, 'mathematics::percentage')).toMatchObject({ questions: 2, attempted: 1, correct: 1, skipped: 1, accuracy: 100, marks: 2, timeSeconds: 40 });
    expect(t.topics.every((r) => !!r.subjectName)).toBe(true);
  });
  it('labels follow the 10-attempt rule: below it, "Insufficient data" (never Strong/Weak)', () => {
    expect(t.subjects.every((r) => r.label === 'Insufficient data')).toBe(true);
    expect(strengthLabel(9, 0)).toBe('Insufficient data');
    expect(strengthLabel(10, 59.9)).toBe('Weak');
    expect(strengthLabel(10, 60)).toBe('Average');
    expect(strengthLabel(25, 79.9)).toBe('Average');
    expect(strengthLabel(10, 80)).toBe('Strong');
    expect(strengthLabel(0, null)).toBe('Insufficient data');
  });
});

describe('difficulty-wise table', () => {
  it('has easy / medium / hard rows from the questions\' own difficulty', () => {
    expect(t.difficulty.available).toBe(true);
    expect(t.difficulty.rows.map((r) => r.id)).toEqual(['easy', 'medium', 'hard']);
    expect(row(t.difficulty.rows, 'easy')).toMatchObject({ questions: 2, attempted: 2, correct: 1, wrong: 1, timeSeconds: 120, marks: 1.5, label: null });
    expect(row(t.difficulty.rows, 'medium')).toMatchObject({ attempted: 1, correct: 1, skipped: 1, marks: 2 });
    expect(row(t.difficulty.rows, 'hard')).toMatchObject({ attempted: 2, correct: 1, wrong: 1, marks: 1.5 });
  });
  it('says it is unavailable when no question has a difficulty (legacy quizzes) — it does not default one', () => {
    const { analysis: a, context } = analyzeLegacySession(legacy());
    const tl = buildResultTables(a, context);
    expect(tl.difficulty).toEqual({ available: false, rows: [] });
  });
});

describe('time analysis table', () => {
  it('gives the average time on correct / wrong / skipped, the fastest and slowest, and those over the threshold', () => {
    const by = Object.fromEntries(t.time.byOutcome.map((o) => [o.status, o]));
    expect(by.correct).toMatchObject({ questions: 3, averageSeconds: 52, totalSeconds: 155 });
    expect(by.wrong).toMatchObject({ questions: 2, averageSeconds: 55, totalSeconds: 110 });
    expect(by.skipped).toMatchObject({ questions: 1, averageSeconds: null, totalSeconds: 0 });
    expect(t.time.fastest.map((r) => [r.no, r.seconds])).toEqual([[5, 10], [1, 20], [3, 40]]);
    expect(t.time.slowest.map((r) => [r.no, r.seconds])).toEqual([[2, 100], [6, 95], [3, 40]]);
    expect(t.time.thresholdSeconds).toBe(90);
    expect(t.time.overThreshold.map((r) => r.no)).toEqual([2, 6]);
  });
});

describe('question-wise table', () => {
  it('has one row per question with section, subject › topic, difficulty, status, answers as text, time and +/− marks', () => {
    expect(t.questions.map((r) => r.no)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(t.questions.map((r) => r.marks)).toEqual([2, -0.5, 2, 0, -0.5, 2]);
    expect(t.questions.map((r) => r.status)).toEqual(['correct', 'wrong', 'correct', 'skipped', 'wrong', 'correct']);
    const q2 = t.questions[1];
    expect(q2).toMatchObject({ sectionTitle: expect.any(String), difficulty: 'easy', yourAnswer: 'q2-opt-b', correctAnswer: 'q2-opt-a', selectedOptionId: 'B', correctOptionId: 'A', timeSeconds: 100, explanation: 'Because q2' });
    expect(q2.options).toHaveLength(4);
    expect(q2.options[0]).toMatchObject({ id: 'A' });
    expect(t.questions[3]).toMatchObject({ yourAnswer: null, timeSeconds: null }); // skipped: no answer, no recorded time
    expect(t.questions[5].marked).toBe(true);
    expect(t.questions.filter((r) => r.marked)).toHaveLength(1);
    expect(t.questions[0].sectionTitle).toBe(t.sections[0].title);
    expect(t.questions[5].sectionTitle).toBe(t.sections[1].title);
  });
  it('filters by status and marked', () => {
    expect(filterQuestionRows(t.questions, 'wrong').map((r) => r.no)).toEqual([2, 5]);
    expect(filterQuestionRows(t.questions, 'correct').map((r) => r.no)).toEqual([1, 3, 6]);
    expect(filterQuestionRows(t.questions, 'skipped').map((r) => r.no)).toEqual([4]);
    expect(filterQuestionRows(t.questions, 'marked').map((r) => r.no)).toEqual([6]);
    expect(filterQuestionRows(t.questions, 'slow', 90).map((r) => r.no)).toEqual([2, 6]);
    expect(filterQuestionRows(t.questions, 'slow', null)).toEqual([]);
    expect(filterQuestionRows(t.questions, 'all')).toHaveLength(6);
  });
  it('sorts by time, marks, status and number; rows with no time sort last either way; ties keep test order', () => {
    expect(sortQuestionRows(t.questions, 'time', 'asc').map((r) => r.no)).toEqual([5, 1, 3, 6, 2, 4]);
    expect(sortQuestionRows(t.questions, 'time', 'desc').map((r) => r.no)).toEqual([2, 6, 3, 1, 5, 4]);
    expect(sortQuestionRows(t.questions, 'marks', 'desc').map((r) => r.no)).toEqual([1, 3, 6, 4, 2, 5]);
    expect(sortQuestionRows(t.questions, 'status', 'asc').map((r) => r.no)).toEqual([2, 5, 4, 1, 3, 6]); // wrong, skipped, correct
    expect(sortQuestionRows(t.questions, 'no', 'desc').map((r) => r.no)).toEqual([6, 5, 4, 3, 2, 1]);
  });
  it('paginates', () => {
    const p1 = paginate(t.questions, 1, 4);
    expect(p1).toMatchObject({ page: 1, pageCount: 2, from: 1, to: 4, total: 6 });
    expect(paginate(t.questions, 2, 4)).toMatchObject({ page: 2, from: 5, to: 6 });
    expect(paginate(t.questions, 99, 4).page).toBe(2); // clamped
    expect(paginate([], 1, 4)).toMatchObject({ from: 0, to: 0, total: 0, pageCount: 1 });
  });
  it('marksFor: +correct, −negative, 0 skipped (and never "-0")', () => {
    expect(marksFor('correct', { marksPerCorrect: 2, negativeMarks: 0.5 })).toBe(2);
    expect(marksFor('wrong', { marksPerCorrect: 2, negativeMarks: 0.5 })).toBe(-0.5);
    expect(Object.is(marksFor('wrong', { marksPerCorrect: 1, negativeMarks: 0 }), 0)).toBe(true);
    expect(marksFor('skipped', { marksPerCorrect: 2, negativeMarks: 0.5 })).toBe(0);
  });
});

describe('comparison with earlier attempts of the same test', () => {
  it('lists this attempt and each earlier attempt of THIS test (not other tests), with score, accuracy and attempted', () => {
    const prev = previousPracticeAttempts(s, ledger);
    expect(prev).toHaveLength(1);
    expect(prev[0]).toMatchObject({ attemptId: 'old', score: 1.5, maxScore: 6, accuracy: 50, attempted: 2, timeTakenSeconds: 600 });
    expect(t.comparison.map((r) => [r.label, r.isCurrent])).toEqual([['This attempt', true], ['Attempt 1', false]]);
    expect(t.comparison[0]).toMatchObject({ score: 5, maxScore: 12, accuracy: 60, attempted: 5 });
  });
  it('is empty on a first attempt, and for a session with no fixed test', () => {
    expect(buildResultTables(analysis, { ...ctx, previousAttempts: [] }).comparison).toEqual([]);
    expect(previousPracticeAttempts(session({ testDefinitionId: undefined }), ledger)).toEqual([]);
  });
});

describe('what is never invented', () => {
  it('has no rank, percentile or cut-off anywhere in the tables', () => {
    const text = JSON.stringify(t).toLowerCase();
    for (const word of ['rank', 'percentile', 'cutoff', 'cut-off', 'topper']) expect(text).not.toContain(word);
  });
  it('builds from an empty context without throwing', () => {
    expect(() => buildResultTables(analysis, EMPTY_CONTEXT)).not.toThrow();
  });
});

// ─── Mock: two sections with different marking schemes ───────────────────────────────────────────────────────────
describe('mock attempts', () => {
  const mq = (id: string): UniversalQuestion => ({ ...question('q1'), id, question: `Mock ${id}`, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'B' });
  const mqs = new Map(['m1', 'm2', 'm3'].map((id) => [id, mq(id)]));
  const attempt = (id: string, picks: Record<string, string | null>, completedAt: number): MockAttemptRecord => ({
    id, mockDefinitionId: 'mx', examId: 'e', type: 'full-mock', title: 'Mock X', status: 'completed', completedAt, startedAt: 0, lastActiveAt: 0, currentSectionIndex: 0, currentQuestionIndex: 0,
    sections: [
      { sectionId: 's1', title: 'Quant', subjectId: 'mathematics', questionIds: ['m1', 'm2'], marksPerQuestion: 1, negativeMarks: 0.25, durationSeconds: 600, status: 'submitted', locked: true },
      { sectionId: 's2', title: 'English', subjectId: 'english', questionIds: ['m3'], marksPerQuestion: 2, negativeMarks: 0.5, durationSeconds: 300, status: 'submitted', locked: true },
    ],
    states: Object.fromEntries(['m1', 'm2', 'm3'].map((qid) => [qid, { questionId: qid, sectionId: qid === 'm3' ? 's2' : 's1', selectedAnswer: picks[qid] ?? null, isMarkedForReview: false, visited: true, timeSpentSeconds: 30 }])),
  }) as unknown as MockAttemptRecord;
  const now = attempt('a2', { m1: 'B', m2: 'A', m3: 'B' }, 2000); // m1 right, m2 wrong, m3 right
  const before = attempt('a1', { m1: 'A', m2: 'A', m3: null }, 1000);

  it('reads each section\'s own marking scheme and builds the section table from the canonical mock result', () => {
    const c = mockResultContext(now, mqs, [before, now]);
    expect(c.marking).toBeNull(); // schemes differ → "Set per section"
    expect(c.sectionMarking).toEqual({ s1: { marksPerCorrect: 1, negativeMarks: 0.25 }, s2: { marksPerCorrect: 2, negativeMarks: 0.5 } });
    expect(c.allottedSeconds).toBe(900);
    expect(c.sections.map((r) => [r.title, r.score, r.maxScore, r.correct, r.wrong, r.skipped])).toEqual([['Quant', 0.75, 2, 1, 1, 0], ['English', 2, 2, 1, 0, 0]]);
    expect(c.sections[0]).toMatchObject({ allottedSeconds: 600, timeSpentSeconds: 60 });
  });
  it('scores each earlier attempt from its own answers, and marks per question follow the question\'s section', () => {
    const c = mockResultContext(now, mqs, [before, now]);
    expect(c.previousAttempts).toHaveLength(1);
    expect(c.previousAttempts[0]).toMatchObject({ attemptId: 'a1', score: -0.5, maxScore: 4, attempted: 2, accuracy: 0 }); // two wrong in s1: −0.25 × 2
  });
  it('an earlier attempt whose questions are no longer all available gets no score — not a guess', () => {
    const gone = new Map([...mqs].filter(([id]) => id !== 'm3'));
    const c = mockResultContext(before, gone as Map<string, UniversalQuestion>, [before, now]);
    expect(c.previousAttempts[0]).toMatchObject({ attemptId: 'a2', score: null, maxScore: null, accuracy: null, attempted: null });
  });
});

describe('legacy daily quiz', () => {
  it('renders through the same tables: filed under Current Affairs / its chapter, answers as text, 1 per correct', () => {
    const { analysis: a, context } = analyzeLegacySession(legacy());
    const tl = buildResultTables(a, context);
    const v = Object.fromEntries(tl.scorecard.map((r) => [r.key, r]));
    expect(v.score.value).toBe('1 / 3');
    expect(v.marking.value).toBe('No marking scheme');
    expect(tl.subjects.map((r) => [r.id, r.correct, r.wrong, r.skipped])).toEqual([['current-affairs', 1, 1, 1]]);
    expect(tl.topics[0].id).toBe('current-affairs::Sports');
    expect(tl.questions.map((r) => [r.yourAnswer, r.correctAnswer, r.status])).toEqual([['green', 'green', 'correct'], ['red', 'green', 'wrong'], [null, 'green', 'skipped']]);
    expect(tl.comparison).toEqual([]);
  });
});
