// Shared seeded data for the result-table tests: one fully worked Test session whose every table value is known by hand.
import { resolveTiming } from '../services/sessionTiming';
import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { UniversalAttemptRecord } from '../services/db';
import type { QuizSession } from '../types';

// ─── A fully worked Test session: 6 questions, +2 / −0.5, two timed sections of 3 ───────────────────────────────
// q1 maths/average  easy   correct  20s      q4 maths/percentage medium skipped  0s
// q2 maths/average  easy   WRONG   100s      q5 english/grammar  hard   WRONG   10s
// q3 maths/percentage medium correct 40s     q6 english/grammar  hard   correct 95s  (marked Doubtful)
export const IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
const META: Record<string, [string, string, 'easy' | 'medium' | 'hard']> = {
  q1: ['mathematics', 'average', 'easy'], q2: ['mathematics', 'average', 'easy'], q3: ['mathematics', 'percentage', 'medium'],
  q4: ['mathematics', 'percentage', 'medium'], q5: ['english', 'grammar', 'hard'], q6: ['english', 'grammar', 'hard'],
};
export const question = (id: string): UniversalQuestion => ({
  id, examIds: ['e'], subjectId: META[id][0], topicId: META[id][1], questionType: 'mcq', question: `Question ${id}`, difficulty: META[id][2],
  options: [{ id: 'A', text: `${id}-opt-a` }, { id: 'B', text: `${id}-opt-b` }], correctAnswer: 'A', explanation: `Because ${id}`,
});
export const questionsById = new Map(IDS.map((id) => [id, question(id)]));
const answers: [string | null, number][] = [['A', 20], ['B', 100], ['A', 40], [null, 0], ['B', 10], ['A', 95]];
export const session = (over: Partial<PracticeSession['config']> = {}): PracticeSession => ({
  id: 'now', config: { examId: 'e', subjectIds: ['mathematics'], questionCount: 6, mode: 'test', label: 'Worked test', testDefinitionId: 't1', marking: { marksPerCorrect: 2, negativeMarks: 0.5 },
    ...resolveTiming({ kind: 'sectional', sectionMinutes: [5, 5] }, 6, undefined), ...over },
  questionIds: IDS,
  states: answers.map(([selectedAnswer, timeTaken], i) => ({ questionId: IDS[i], selectedAnswer, isMarkedForReview: i === 5, markPurpose: i === 5 ? 'doubtful' : undefined, timeTaken })),
  currentIndex: 0, startedAt: 0, lastActiveAt: 0, isCompleted: true, completedAt: 400_000, totalPausedTime: 0, visitedIndices: [0, 1, 2, 3, 4, 5],
}) as unknown as PracticeSession;

const ledgerRow = (sid: string, i: number, over: Partial<UniversalAttemptRecord>): UniversalAttemptRecord => ({
  id: `${sid}-${i}`, universalQuestionId: IDS[i], examId: 'e', subjectId: 'mathematics', topicId: 'average', isCorrect: false, wasAnswered: true, timeTaken: 10, attemptedAt: 1, sessionId: sid, sourceFileName: 'x', testDefinitionId: 't1', sessionCompletedAt: 900_000, sessionStartedAt: 300_000, sessionPausedMs: 0, ...over,
});
export const ledger = [
  ledgerRow('old', 0, { isCorrect: true }), ledgerRow('old', 1, { isCorrect: false }), ledgerRow('old', 2, { wasAnswered: false }),
  ledgerRow('other-test', 0, { testDefinitionId: 'zzz' }), // a different test: never compared
];


// ─── Legacy daily quiz ───────────────────────────────────────────────────────────────────────────────────────────
export function legacy(): QuizSession {
  const opts = ['red', 'green', 'blue', 'pink'];
  const at = (n: number, picked: string | null, status: 'correct' | 'wrong' | 'unanswered', timeTaken: number) => ({ questionId: n, question: `Legacy ${n}`, options: opts, correctAnswer: 'green', explanation: `Because ${n}`, selectedAnswer: picked, status, timeTaken });
  return {
    id: 'lg1', date: '2026-11-01', fileName: 'Sports.json', totalQuestions: 3, currentIndex: 0, startTime: 0, totalPausedTime: 0, isCompleted: true, isPaused: false, visitedIndices: [0, 1, 2],
    attempts: [at(1, 'green', 'correct', 12), at(2, 'red', 'wrong', 30), at(3, null, 'unanswered', 0)],
  } as unknown as QuizSession;
}
