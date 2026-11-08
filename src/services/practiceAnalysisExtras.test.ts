import { describe, expect, it } from 'vitest';
import { repeatedMistakesInSession, sectionBreakdown } from './practiceAnalysisExtras';
import { analyzePracticeSession } from './practiceAnalysisService';
import { resolveTiming } from './sessionTiming';
import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { AttemptRow } from './reviewAnalytics';

const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
const q = (id: string): UniversalQuestion => ({ id, examIds: ['e'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: `Text ${id}`, difficulty: 'easy', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', explanation: '' });
const questions = new Map(ids.map((i) => [i, q(i)]));

function session(answers: (string | null)[], times: number[], sectional = true): PracticeSession {
  const timing = sectional ? resolveTiming({ kind: 'sectional', sectionMinutes: [10, 5] }, 6, undefined) : {};
  return {
    id: 'now', config: { examId: 'e', subjectIds: ['mathematics'], questionCount: 6, mode: 'test', label: 'T', ...timing }, questionIds: ids,
    states: ids.map((questionId, i) => ({ questionId, selectedAnswer: answers[i], isMarkedForReview: false, timeTaken: times[i] })),
    currentIndex: 0, startedAt: 0, lastActiveAt: 0, isCompleted: true, completedAt: 1000, totalPausedTime: 0, visitedIndices: [0, 1, 2, 3, 4, 5],
  } as PracticeSession;
}

describe('section-wise performance', () => {
  it('splits correct / wrong / skipped / time by section, with the allotted time', () => {
    const s = session(['A', 'B', null, 'A', 'A', 'B'], [30, 40, 0, 10, 20, 30]);
    const [one, two] = sectionBreakdown(s, questions);
    expect(one).toMatchObject({ label: 'Section 1', questions: 3, attempted: 2, correct: 1, incorrect: 1, unattempted: 1, accuracy: 50, timeSpentSeconds: 70, allottedSeconds: 600 });
    expect(two).toMatchObject({ label: 'Section 2', questions: 3, attempted: 3, correct: 2, incorrect: 1, accuracy: 66.7, allottedSeconds: 300 });
  });
  it('the sections add up to the session', () => {
    const s = session(['A', 'B', null, 'A', 'A', 'B'], [1, 1, 1, 1, 1, 1]);
    const parts = sectionBreakdown(s, questions);
    expect(parts.reduce((n, p) => n + p.questions, 0)).toBe(6);
    expect(parts.reduce((n, p) => n + p.correct, 0)).toBe(analyzePracticeSession(s, questions).summary.correct);
  });
  it('accuracy is null, not 0 %, when a section was not answered; time is null when none was recorded', () => {
    const [one] = sectionBreakdown(session([null, null, null, 'A', 'A', 'A'], [0, 0, 0, 5, 5, 5]), questions);
    expect(one.accuracy).toBeNull();
    expect(one.timeSpentSeconds).toBeNull();
  });
  it('nothing for a test that is not sectional', () => {
    expect(sectionBreakdown(session(['A', 'A', 'A', 'A', 'A', 'A'], [1, 1, 1, 1, 1, 1], false), questions)).toEqual([]);
  });
});

describe('repeated mistakes in this session', () => {
  let n = 0;
  const before = (qid: string, correct: boolean, over: Partial<AttemptRow> = {}): AttemptRow => { n++; return { id: `p${n}`, universalQuestionId: qid, subjectId: 'mathematics', topicId: 'average', isCorrect: correct, wasAnswered: true, timeTaken: 5, attemptedAt: 100 + n, sessionId: `old${n}`, sourceFileName: 'universal-session-x', ...over }; };

  it('lists only questions wrong now AND wrong before, most-missed first', () => {
    const s = session(['B', 'B', 'B', 'A', 'A', null], [1, 1, 1, 1, 1, 0], false); // q1 q2 q3 wrong now
    const rows = [before('q1', false), before('q1', false), before('q2', false), before('q3', true), before('q4', false) /* wrong before but right now */];
    const r = repeatedMistakesInSession(s, questions, rows);
    expect(r.map((x) => [x.questionId, x.earlierWrong])).toEqual([['q1', 2], ['q2', 1]]);
  });
  it('ignores this session\'s own ledger rows, so it never depends on whether they were written yet', () => {
    const s = session(['B', 'A', 'A', 'A', 'A', 'A'], [1, 1, 1, 1, 1, 1], false);
    const own = before('q1', false, { sessionId: 'now' });
    expect(repeatedMistakesInSession(s, questions, [own])).toEqual([]);
    expect(repeatedMistakesInSession(s, questions, [own, before('q1', false)]).map((x) => x.questionId)).toEqual(['q1']);
  });
  it('a question wrong now for the first time is not a repeated mistake', () => {
    expect(repeatedMistakesInSession(session(['B', 'A', 'A', 'A', 'A', 'A'], [1, 1, 1, 1, 1, 1], false), questions, [])).toEqual([]);
  });
});
