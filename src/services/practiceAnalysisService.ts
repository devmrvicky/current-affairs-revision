// ─── Practice / Test analysis ────────────────────────────────────────────────
// Turns a finished Practice/Test session — live from the session store or rebuilt
// from the attempt ledger — into the SAME MockAnalysis the mock result page
// renders, through the SAME core (analyzeEntries). There is no second analysis
// engine: only the adapter from a PracticeSession's per-question state to the
// normalized entries lives here.
//
// Scoring follows the test's own marking scheme. A plain Practice session has
// none, so `scoringApplicable` is false and the score is simply the number
// correct. Per-question time comes from the time the session recorded; if it
// recorded none (older attempts), the analysis says so rather than inventing it.

import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockAnalysis, SummaryStats } from '../types/mockAnalysis';
import { effectivePurpose } from '../types/questionMark';
import { analyzeEntries, type FlatQuestionEntry } from './mockAnalysisService';

export function analyzePracticeSession(session: PracticeSession, questionsById: Map<string, UniversalQuestion>): MockAnalysis {
  const marking = session.config.marking;
  const marksPerQuestion = marking?.marksPerCorrect ?? 1;
  const negativeMarks = marking?.negativeMarks ?? 0;
  const visitedKnown = session.visitedIndices.length > 0;

  const entries: FlatQuestionEntry[] = [];
  session.questionIds.forEach((questionId, i) => {
    const question = questionsById.get(questionId);
    const state = session.states[i];
    if (!question || !state) return; // an unresolved question can't be analysed honestly — it is left out, not guessed at
    const purpose = effectivePurpose(state);
    entries.push({
      questionId,
      index: i + 1,
      markPurpose: purpose,
      sectionId: 'session',
      subjectId: question.subjectId,
      topicId: question.topicId ?? 'general',
      question,
      selectedAnswer: state.selectedAnswer,
      isMarkedForReview: !!purpose,
      visited: !visitedKnown || session.visitedIndices.includes(i) || state.selectedAnswer !== null || state.timeTaken > 0 || !!purpose,
      timeSpentSeconds: state.timeTaken,
      marksPerQuestion,
      negativeMarks,
    });
  });

  let correct = 0;
  let incorrect = 0;
  for (const e of entries) {
    if (e.selectedAnswer === null) continue;
    if (e.selectedAnswer === e.question.correctAnswer) correct += 1;
    else incorrect += 1;
  }
  const attempted = correct + incorrect;
  const total = entries.length;
  const score = Math.round((correct * marksPerQuestion - incorrect * negativeMarks) * 100) / 100;
  const maxScore = total * marksPerQuestion;
  const completedAt = session.completedAt ?? Date.now();
  const elapsed = Math.floor((completedAt - session.startedAt - session.totalPausedTime) / 1000);
  const recordedTime = entries.reduce((n, e) => n + e.timeSpentSeconds, 0);

  const summary: SummaryStats = {
    score,
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
    accuracy: attempted > 0 ? Math.round((correct / attempted) * 10000) / 100 : null,
    attempted,
    correct,
    incorrect,
    unattempted: total - attempted,
    totalQuestions: total,
    // Wall-clock time the session was open; per-question times can sum to less (time between questions).
    timeTakenSeconds: elapsed > 0 ? elapsed : recordedTime,
    scoringApplicable: !!marking,
  };

  const base = analyzeEntries({
    attemptId: session.id,
    mockId: session.config.testDefinitionId ?? session.id,
    title: session.config.label,
    completedAt,
    entries,
    summary,
    visitedStateKnown: visitedKnown,
  });
  return base;
}
