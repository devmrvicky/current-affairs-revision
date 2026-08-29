// ─── Mock Scoring Service ───────────────────────────────────────────────────
// Single canonical scoring implementation for both Full Mock and Sectional
// Mock results (product spec §40: "Never duplicate scoring formulas inside
// UI components"). Pure functions — no store/React dependency — so they're
// trivially unit-testable and reusable from the result page, review page and
// mock-history summaries alike.

import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockSectionRuntime, MockQuestionState, MockResult, MockSectionResult, MockSession } from '../types/mockSession';

export function calculateAccuracy(correct: number, attempted: number): number {
  if (attempted === 0) return 0;
  return Math.round((correct / attempted) * 1000) / 10;
}

export function calculateSectionScore(
  section: MockSectionRuntime,
  states: Record<string, MockQuestionState>,
  questionsById: Map<string, UniversalQuestion>
): MockSectionResult {
  let correct = 0;
  let incorrect = 0;
  let markedForReview = 0;
  let timeUsedSeconds = 0;

  for (const questionId of section.questionIds) {
    const state = states[questionId];
    const question = questionsById.get(questionId);
    if (state?.isMarkedForReview) markedForReview += 1;
    if (state) timeUsedSeconds += state.timeSpentSeconds;

    if (!state || state.selectedAnswer === null || !question) continue;
    if (state.selectedAnswer === question.correctAnswer) correct += 1;
    else incorrect += 1;
  }

  const questionCount = section.questionIds.length;
  const attempted = correct + incorrect;
  const unattempted = questionCount - attempted;
  const marks = Math.round((correct * section.marksPerQuestion - incorrect * section.negativeMarks) * 100) / 100;
  const maxMarks = questionCount * section.marksPerQuestion;
  const timeAllottedSeconds = section.durationSeconds;

  return {
    sectionId: section.sectionId,
    title: section.title,
    questionCount,
    correct,
    incorrect,
    unattempted,
    markedForReview,
    marks,
    maxMarks,
    accuracy: calculateAccuracy(correct, attempted),
    attemptRate: questionCount > 0 ? Math.round((attempted / questionCount) * 1000) / 10 : 0,
    timeAllottedSeconds,
    timeUsedSeconds,
    avgTimePerQuestionSeconds: attempted > 0 ? Math.round(timeUsedSeconds / attempted) : 0,
  };
}

export function calculateMockResult(session: MockSession, questionsById: Map<string, UniversalQuestion>): MockResult {
  const sectionResults = session.sections.map((s) => calculateSectionScore(s, session.states, questionsById));

  const totals = sectionResults.reduce(
    (acc, s) => ({
      totalQuestions: acc.totalQuestions + s.questionCount,
      correct: acc.correct + s.correct,
      incorrect: acc.incorrect + s.incorrect,
      unattempted: acc.unattempted + s.unattempted,
      markedForReview: acc.markedForReview + s.markedForReview,
      marks: acc.marks + s.marks,
      maxMarks: acc.maxMarks + s.maxMarks,
      timeTakenSeconds: acc.timeTakenSeconds + s.timeUsedSeconds,
    }),
    { totalQuestions: 0, correct: 0, incorrect: 0, unattempted: 0, markedForReview: 0, marks: 0, maxMarks: 0, timeTakenSeconds: 0 }
  );

  const attempted = totals.correct + totals.incorrect;

  return {
    sessionId: session.id,
    mockDefinitionId: session.mockDefinitionId,
    type: session.type,
    title: session.title,
    totalQuestions: totals.totalQuestions,
    correct: totals.correct,
    incorrect: totals.incorrect,
    unattempted: totals.unattempted,
    markedForReview: totals.markedForReview,
    marks: Math.round(totals.marks * 100) / 100,
    maxMarks: totals.maxMarks,
    accuracy: calculateAccuracy(totals.correct, attempted),
    percentage: totals.maxMarks > 0 ? Math.round((totals.marks / totals.maxMarks) * 1000) / 10 : 0,
    timeTakenSeconds: totals.timeTakenSeconds,
    completedAt: session.completedAt ?? Date.now(),
    sections: sectionResults,
  };
}
