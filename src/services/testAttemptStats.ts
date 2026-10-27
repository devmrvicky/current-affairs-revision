// ─── Per-test attempt statistics (pure) ──────────────────────────────────────
// Turns raw rows from the universal attempt ledger into the numbers a test card
// shows — attempts, best, latest, last-attempted, per-attempt history — and
// rebuilds a completed session for review. No database access here: the ledger
// service reads the rows, this module only does arithmetic, so the rules below
// are the single definition of "an attempt" and "a score".
//
// WHAT COUNTS AS AN ATTEMPT
//   One completed session = one attempt. The ledger writes one row per question
//   per session (deterministic id `${sessionId}::${questionId}`), answered or
//   not, so a session is identified by `sessionId` and its size is the number of
//   rows it has. Skipped questions therefore count toward the total — a 25-question
//   test is "x / 25" even when only 20 were answered — and a session submitted
//   with nothing answered is still an attempt (the previous implementation only
//   read answered rows, so such an attempt vanished and totals shrank to the
//   answered count).
//
// WHAT COUNTS AS A SCORE
//   `correct / total`. Marks (with negative marking) are reported alongside when
//   the session recorded its marking scheme; they are never inferred for older
//   rows that did not.
//
// BACKWARD COMPATIBILITY
//   Rows written before per-attempt review existed lack `selectedAnswer`,
//   `questionIndex` and the session metadata. They still count (attempts, best,
//   latest all derive from `isCorrect`/`wasAnswered`/`sessionId`/`attemptedAt`),
//   but are flagged `canReview: false` — nothing is fabricated for them.

import type { UniversalAttemptRecord } from './db';
import type { PracticeSession, SessionQuestionState } from '../types/practiceSession';

export interface TestAttemptSummary {
  sessionId: string;
  /** When the attempt was submitted (older rows: the latest per-question timestamp, which is the closest honest value). */
  completedAt: number;
  correct: number;
  incorrect: number;
  skipped: number;
  total: number;
  /** correct / total, as a whole percent. */
  percent: number;
  /** Present only when the session recorded its marking scheme. */
  marks?: number;
  maxMarks?: number;
  timeSeconds: number;
  mode?: 'practice' | 'test';
  /** True when every row carries the per-question detail needed to rebuild the session. */
  canReview: boolean;
}

export interface TestAttemptStats {
  /** Completed attempts. */
  timesAttempted: number;
  bestCorrect: number;
  bestTotal: number;
  bestAccuracy: number;
  bestSessionId: string;
  latestCorrect: number;
  latestTotal: number;
  latestSessionId: string;
  lastAttemptedAt: number;
  /** Newest first. */
  attempts: TestAttemptSummary[];
}

function summarizeSession(sessionId: string, rows: UniversalAttemptRecord[]): TestAttemptSummary {
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let completedAt = 0;
  let rowTime = 0;
  let canReview = true;
  let marking: { marksPerCorrect: number; negativeMarks: number } | undefined;
  let mode: 'practice' | 'test' | undefined;
  let startedAt: number | undefined;
  let pausedMs = 0;

  for (const r of rows) {
    if (!r.wasAnswered) skipped += 1;
    else if (r.isCorrect) correct += 1;
    else incorrect += 1;

    completedAt = Math.max(completedAt, r.sessionCompletedAt ?? r.attemptedAt);
    rowTime += r.timeTaken || 0;
    if (r.selectedAnswer === undefined || r.questionIndex === undefined) canReview = false;
    if (r.marksPerCorrect !== undefined) marking = { marksPerCorrect: r.marksPerCorrect, negativeMarks: r.negativeMarks ?? 0 };
    if (r.sessionMode) mode = r.sessionMode;
    if (r.sessionStartedAt !== undefined) startedAt = r.sessionStartedAt;
    if (r.sessionPausedMs !== undefined) pausedMs = r.sessionPausedMs;
  }

  const total = rows.length;
  const timeSeconds =
    startedAt !== undefined && completedAt > startedAt
      ? Math.max(0, Math.floor((completedAt - startedAt - pausedMs) / 1000))
      : rowTime;

  const summary: TestAttemptSummary = {
    sessionId,
    completedAt,
    correct,
    incorrect,
    skipped,
    total,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    timeSeconds,
    mode,
    canReview,
  };
  if (marking) {
    summary.marks = Math.round((correct * marking.marksPerCorrect - incorrect * marking.negativeMarks) * 100) / 100;
    summary.maxMarks = total * marking.marksPerCorrect;
  }
  return summary;
}

/** Groups rows by session and summarizes each. */
export function summarizeSessions(rows: UniversalAttemptRecord[]): TestAttemptSummary[] {
  const bySession = new Map<string, UniversalAttemptRecord[]>();
  for (const r of rows) {
    const bucket = bySession.get(r.sessionId);
    if (bucket) bucket.push(r);
    else bySession.set(r.sessionId, [r]);
  }
  return Array.from(bySession, ([sessionId, sessionRows]) => summarizeSession(sessionId, sessionRows));
}

function statsFromSummaries(summaries: TestAttemptSummary[]): TestAttemptStats | null {
  if (summaries.length === 0) return null;
  const attempts = [...summaries].sort((a, b) => b.completedAt - a.completedAt);

  // Best = highest correct/total; ties go to the more recent attempt (attempts is newest-first, so the first strictly-better one wins).
  let best = attempts[0];
  for (const a of attempts) {
    const ratio = a.total > 0 ? a.correct / a.total : 0;
    const bestRatio = best.total > 0 ? best.correct / best.total : 0;
    if (ratio > bestRatio) best = a;
  }
  const latest = attempts[0];

  return {
    timesAttempted: attempts.length,
    bestCorrect: best.correct,
    bestTotal: best.total,
    bestAccuracy: best.percent,
    bestSessionId: best.sessionId,
    latestCorrect: latest.correct,
    latestTotal: latest.total,
    latestSessionId: latest.sessionId,
    lastAttemptedAt: latest.completedAt,
    attempts,
  };
}

/** Stats for every test that has at least one attempt, in one pass over the rows. Rows with no testDefinitionId (Quick Practice, daily quizzes…) are ignored. */
export function computeAllTestStats(rows: UniversalAttemptRecord[]): Map<string, TestAttemptStats> {
  const byTest = new Map<string, UniversalAttemptRecord[]>();
  for (const r of rows) {
    if (!r.testDefinitionId) continue;
    const bucket = byTest.get(r.testDefinitionId);
    if (bucket) bucket.push(r);
    else byTest.set(r.testDefinitionId, [r]);
  }
  const out = new Map<string, TestAttemptStats>();
  for (const [testId, testRows] of byTest) {
    const stats = statsFromSummaries(summarizeSessions(testRows));
    if (stats) out.set(testId, stats);
  }
  return out;
}

/** Stats for a single test. */
export function computeTestStats(rows: UniversalAttemptRecord[], testDefinitionId: string): TestAttemptStats | null {
  return statsFromSummaries(summarizeSessions(rows.filter((r) => r.testDefinitionId === testDefinitionId)));
}

/**
 * Rebuilds a completed PracticeSession from one session's ledger rows so the
 * existing result/review pages can render a past attempt. Returns null when the
 * rows predate per-question detail — the caller then offers no review rather
 * than showing invented answers.
 */
export function rebuildSessionFromRows(rows: UniversalAttemptRecord[]): PracticeSession | null {
  if (rows.length === 0) return null;
  if (rows.some((r) => r.selectedAnswer === undefined || r.questionIndex === undefined || !r.universalQuestionId)) return null;

  const ordered = [...rows].sort((a, b) => (a.questionIndex ?? 0) - (b.questionIndex ?? 0));
  const first = ordered[0];
  const summary = summarizeSession(first.sessionId, ordered);

  const states: SessionQuestionState[] = ordered.map((r) => ({
    questionId: r.universalQuestionId as string,
    selectedAnswer: r.selectedAnswer ?? null,
    isMarkedForReview: r.markedForReview ?? false,
    answeredAt: r.wasAnswered ? r.attemptedAt : undefined,
    timeTaken: r.timeTaken || 0,
  }));

  const startedAt = first.sessionStartedAt ?? summary.completedAt - summary.timeSeconds * 1000;
  const marking = first.marksPerCorrect !== undefined ? { marksPerCorrect: first.marksPerCorrect, negativeMarks: first.negativeMarks ?? 0 } : undefined;

  return {
    id: first.sessionId,
    config: {
      examId: first.examId,
      subjectIds: [first.subjectId],
      questionCount: ordered.length,
      mode: first.sessionMode ?? 'practice',
      label: first.sessionLabel ?? 'Past attempt',
      testDefinitionId: first.testDefinitionId,
      ...(marking ? { marking } : {}),
    },
    questionIds: states.map((s) => s.questionId),
    states,
    currentIndex: 0,
    startedAt,
    completedAt: summary.completedAt,
    isCompleted: true,
    totalPausedTime: first.sessionPausedMs ?? 0,
    visitedIndices: [],
  };
}
