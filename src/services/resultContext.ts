// ─── Result-screen context builders ──────────────────────────────────────────
// Each engine (Practice/Test, Mock, the older daily quiz) turns what it stored into the same ResultContext, so one set of
// tables (resultTables.ts) can render all of them. Nothing here invents data: an earlier attempt whose score cannot be
// re-derived honestly gets null, not a guess.

import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockAttemptRecord } from '../types/mockSession';
import type { QuizSession } from '../types';
import type { MockAnalysis, SummaryStats } from '../types/mockAnalysis';
import type { UniversalAttemptRecord } from './db';
import { sectionBreakdown } from './practiceAnalysisExtras';
import { calculateMockResult } from './mockScoringService';
import { analyzeEntries, type FlatQuestionEntry } from './mockAnalysisService';
import type { MarkingScheme, PreviousAttempt, ResultContext, SectionRow } from './resultTables';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Practice / Test ─────────────────────────────────────────────────────────

/** Earlier sessions of the same fixed test, from the attempt ledger (their score uses this test's marking scheme). */
export function previousPracticeAttempts(session: PracticeSession, ledger: readonly UniversalAttemptRecord[]): PreviousAttempt[] {
  const testId = session.config.testDefinitionId;
  if (!testId) return [];
  const marking: MarkingScheme = session.config.marking ?? { marksPerCorrect: 1, negativeMarks: 0 };
  const bySession = new Map<string, UniversalAttemptRecord[]>();
  for (const r of ledger) {
    if (r.testDefinitionId !== testId || r.sessionId === session.id || r.sessionCompletedAt === undefined) continue;
    const list = bySession.get(r.sessionId);
    if (list) list.push(r); else bySession.set(r.sessionId, [r]);
  }
  return Array.from(bySession, ([attemptId, rows]) => {
    const answered = rows.filter((r) => r.wasAnswered);
    const correct = answered.filter((r) => r.isCorrect).length;
    const wrong = answered.length - correct;
    const first = rows[0];
    const wall = first.sessionStartedAt !== undefined && first.sessionCompletedAt !== undefined
      ? Math.floor((first.sessionCompletedAt - first.sessionStartedAt - (first.sessionPausedMs ?? 0)) / 1000) : null;
    return {
      attemptId,
      completedAt: first.sessionCompletedAt!,
      score: round2(correct * marking.marksPerCorrect - wrong * marking.negativeMarks),
      maxScore: round2(rows.length * marking.marksPerCorrect),
      accuracy: answered.length > 0 ? Math.round((correct / answered.length) * 1000) / 10 : null,
      attempted: answered.length,
      timeTakenSeconds: wall !== null && wall > 0 ? wall : null,
    } satisfies PreviousAttempt;
  });
}

export function practiceResultContext(session: PracticeSession, questionsById: ReadonlyMap<string, UniversalQuestion>, ledger: readonly UniversalAttemptRecord[]): ResultContext {
  const marking: MarkingScheme | null = session.config.marking ? { marksPerCorrect: session.config.marking.marksPerCorrect, negativeMarks: session.config.marking.negativeMarks } : null;
  const scheme = marking ?? { marksPerCorrect: 1, negativeMarks: 0 };
  const sections: SectionRow[] = sectionBreakdown(session, questionsById).map((s) => ({
    sectionId: s.id, title: s.label, questions: s.questions, attempted: s.attempted, correct: s.correct, wrong: s.incorrect, skipped: s.unattempted,
    score: round2(s.correct * scheme.marksPerCorrect - s.incorrect * scheme.negativeMarks), maxScore: round2(s.questions * scheme.marksPerCorrect),
    accuracy: s.accuracy, timeSpentSeconds: s.timeSpentSeconds, allottedSeconds: s.allottedSeconds,
  }));
  const timing = session.config.timing;
  const allotted = timing?.overallSeconds ?? session.config.durationSeconds ?? 0;
  return { marking, allottedSeconds: allotted > 0 ? allotted : null, sections, previousAttempts: previousPracticeAttempts(session, ledger) };
}

// ─── Mock ────────────────────────────────────────────────────────────────────

export function mockResultContext(attempt: MockAttemptRecord, questionsById: ReadonlyMap<string, UniversalQuestion>, allAttemptsOfThisMock: readonly MockAttemptRecord[]): ResultContext {
  const result = calculateMockResult(attempt, questionsById as Map<string, UniversalQuestion>);
  const sectionMarking: Record<string, MarkingScheme> = {};
  for (const s of attempt.sections) sectionMarking[s.sectionId] = { marksPerCorrect: s.marksPerQuestion, negativeMarks: s.negativeMarks };
  const schemes = Object.values(sectionMarking);
  const uniform = schemes.length > 0 && schemes.every((m) => m.marksPerCorrect === schemes[0].marksPerCorrect && m.negativeMarks === schemes[0].negativeMarks);

  const sections: SectionRow[] = result.sections.map((s) => {
    const attempted = s.correct + s.incorrect;
    return {
      sectionId: s.sectionId, title: s.title, questions: s.questionCount, attempted, correct: s.correct, wrong: s.incorrect, skipped: s.unattempted,
      score: s.marks, maxScore: s.maxMarks, accuracy: attempted > 0 ? s.accuracy : null,
      timeSpentSeconds: s.timeUsedSeconds > 0 ? s.timeUsedSeconds : null, allottedSeconds: s.timeAllottedSeconds > 0 ? s.timeAllottedSeconds : null,
    };
  });
  const allotted = attempt.sections.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);

  const previousAttempts: PreviousAttempt[] = allAttemptsOfThisMock.filter((a) => a.id !== attempt.id).map((a) => {
    const everyQuestionKnown = a.sections.every((s) => s.questionIds.every((id) => questionsById.has(id)));
    if (!everyQuestionKnown) {
      // The earlier attempt used questions that are no longer all available — its score can't be re-derived honestly.
      return { attemptId: a.id, completedAt: a.completedAt, score: null, maxScore: null, accuracy: null, attempted: null, timeTakenSeconds: Object.values(a.states).reduce((n, st) => n + st.timeSpentSeconds, 0) };
    }
    const r = calculateMockResult(a, questionsById as Map<string, UniversalQuestion>);
    const attempted = r.correct + r.incorrect;
    return { attemptId: a.id, completedAt: a.completedAt, score: r.marks, maxScore: r.maxMarks, accuracy: attempted > 0 ? r.accuracy : null, attempted, timeTakenSeconds: r.timeTakenSeconds };
  });

  return { marking: uniform ? schemes[0] : null, sectionMarking, allottedSeconds: allotted > 0 ? allotted : null, sections, previousAttempts };
}

// ─── Older daily quiz / legacy test ──────────────────────────────────────────

const LETTERS = 'ABCDEFGH';

/**
 * Builds the same MockAnalysis for a finished legacy QuizSession (a daily quiz, or a test run on the legacy engine),
 * so it renders through the same tables. Legacy questions carry no subject/topic: they are filed under Current Affairs
 * and the chapter (the source file), which is where they actually came from.
 */
export function analyzeLegacySession(session: QuizSession): { analysis: MockAnalysis; context: ResultContext } {
  const marking: MarkingScheme | null = session.testMeta ? { marksPerCorrect: session.testMeta.marking.marksPerCorrect, negativeMarks: session.testMeta.marking.negativeMarks } : null;
  const scheme = marking ?? { marksPerCorrect: 1, negativeMarks: 0 };
  const topicId = session.fileName.replace(/\.json$/i, '') || 'general';
  const letterOf = (options: string[], text: string | null) => { const i = text === null ? -1 : options.indexOf(text); return i >= 0 ? LETTERS[i] : null; };

  const entries: FlatQuestionEntry[] = session.attempts.map((a, i) => {
    const question: UniversalQuestion = {
      id: `legacy-${session.id}-${a.questionId}`, examIds: [], subjectId: 'current-affairs', topicId, questionType: 'mcq', question: a.question,
      options: a.options.map((text, k) => ({ id: LETTERS[k] ?? String(k), text })), correctAnswer: letterOf(a.options, a.correctAnswer) ?? a.correctAnswer, explanation: a.explanation,
      // Legacy questions have no difficulty. It is left unset on purpose (not defaulted), so the difficulty table honestly says it isn't recorded.
    } as UniversalQuestion;
    const purpose = a.markPurpose ?? (a.markedForReview ? 'review' : undefined);
    return {
      questionId: question.id, index: i + 1, markPurpose: purpose, sectionId: 'session', subjectId: 'current-affairs', topicId, question,
      selectedAnswer: a.status === 'unanswered' ? null : letterOf(a.options, a.selectedAnswer), isMarkedForReview: !!purpose, visited: true,
      timeSpentSeconds: a.timeTaken, marksPerQuestion: scheme.marksPerCorrect, negativeMarks: scheme.negativeMarks,
    };
  });

  const correct = session.attempts.filter((a) => a.status === 'correct').length;
  const incorrect = session.attempts.filter((a) => a.status === 'wrong').length;
  const attempted = correct + incorrect;
  const total = session.attempts.length;
  const score = round2(correct * scheme.marksPerCorrect - incorrect * scheme.negativeMarks);
  const maxScore = round2(total * scheme.marksPerCorrect);
  const timeTaken = session.attempts.reduce((n, a) => n + a.timeTaken, 0);
  const summary: SummaryStats = {
    score, maxScore, percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0, accuracy: attempted > 0 ? Math.round((correct / attempted) * 10000) / 100 : null,
    attempted, correct, incorrect, unattempted: total - attempted, totalQuestions: total, timeTakenSeconds: timeTaken, scoringApplicable: !!marking,
  };
  const analysis = {
    ...analyzeEntries({ attemptId: session.id, mockId: session.id, title: session.testMeta?.examName ?? session.fileName, completedAt: session.lastActiveAt ?? session.startTime, entries, summary }),
  } as MockAnalysis;
  return { analysis, context: { marking, allottedSeconds: session.testMeta?.durationSeconds ?? null, sections: [], previousAttempts: [] } };
}
