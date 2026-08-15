// ─── Test Scoring Service ──────────────────────────────────────────────────────
// Pure function, no side effects — applies a mock test's negative-marking
// rules to a completed QuizSession. Deliberately separate from
// `utils/buildAnalysis` (which computes the existing 0-100 "score" used by
// History/SavedTest) so neither this nor that behavior changes for the other.

import type { QuizSession, TestNegativeMarking } from '../types';
import { calcElapsed } from '../utils';

export interface TestScore {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  skipped: number;
  accuracy: number; // 0-100, based on attempted questions only
  marks: number; // raw score after negative marking, can be negative
  maxMarks: number;
  percentage: number; // marks / maxMarks * 100, can be negative
  timeTakenSeconds: number;
  avgTimePerQuestionSeconds: number;
}

export function computeTestScore(session: QuizSession, marking: TestNegativeMarking): TestScore {
  const correct = session.attempts.filter((a) => a.status === 'correct').length;
  const incorrect = session.attempts.filter((a) => a.status === 'wrong').length;
  const skipped = session.attempts.filter((a) => a.status === 'unanswered').length;
  const attempted = correct + incorrect;
  const total = session.totalQuestions;

  const marks = correct * marking.marksPerCorrect - incorrect * marking.negativeMarks;
  const maxMarks = total * marking.marksPerCorrect;
  const percentage = maxMarks > 0 ? Math.round((marks / maxMarks) * 1000) / 10 : 0;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  const timeTakenSeconds = calcElapsed(session);
  const avgTimePerQuestionSeconds = attempted > 0 ? Math.round(timeTakenSeconds / attempted) : 0;

  return {
    totalQuestions: total,
    attempted,
    correct,
    incorrect,
    skipped,
    accuracy,
    marks: Math.round(marks * 100) / 100,
    maxMarks,
    percentage,
    timeTakenSeconds,
    avgTimePerQuestionSeconds,
  };
}
