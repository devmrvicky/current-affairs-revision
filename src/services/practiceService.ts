// ─── Universal Practice/Test Service (Phase 8) ────────────────────────────────
// Builds question pools and computes results entirely from UniversalQuestion
// identity — no DailyQuiz, no legacy adapter. This is what PracticeSession's
// createQuestionPool()/computeResult() from the master prompt maps to.

import type { UniversalQuestion } from '../types/universalQuestion';
import type { PracticeConfiguration, PracticeSession, UniversalTestResult } from '../types/practiceSession';
import { getQuestionsBySubject, getRandomQuestions } from './questionRepository';

export async function createQuestionPool(config: PracticeConfiguration): Promise<UniversalQuestion[]> {
  const pools = await Promise.all(config.subjectIds.map((id) => getQuestionsBySubject(id)));
  let pool = pools.flat().filter((q) => q.examIds.includes(config.examId));

  if (config.subjectIds.length === 1 && config.topicId) {
    pool = pool.filter((q) => q.topicId === config.topicId);
  }
  if (config.difficulty && config.difficulty !== 'mixed') {
    pool = pool.filter((q) => q.difficulty === config.difficulty);
  }
  return pool;
}

/** Picks and fixes the question order for a new session — never larger than the available pool (master prompt §16 elsewhere, §9/§37 here). */
export async function buildSessionQuestionIds(config: PracticeConfiguration): Promise<string[]> {
  const pool = await createQuestionPool(config);
  const count = Math.min(config.questionCount, pool.length);
  const picked = await getRandomQuestions(count, pool);
  return picked.map((q) => q.id);
}

function elapsedSeconds(session: PracticeSession): number {
  const end = session.completedAt ?? Date.now();
  const pausedNow = session.pausedAt ? Date.now() - session.pausedAt : 0;
  return Math.max(0, Math.floor((end - session.startedAt - session.totalPausedTime - pausedNow) / 1000));
}

/**
 * Computes the result entirely from session.states + resolved questions —
 * no separate scoring path for practice vs test, just whether config.marking
 * applies negative marks (master prompt §20, §21).
 */
export function computeUniversalResult(
  session: PracticeSession,
  questionsById: Map<string, UniversalQuestion>
): UniversalTestResult {
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;

  for (const state of session.states) {
    if (!state.selectedAnswer) {
      skipped++;
      continue;
    }
    const q = questionsById.get(state.questionId);
    if (q && state.selectedAnswer === q.correctAnswer) correct++;
    else incorrect++;
  }

  const attempted = correct + incorrect;
  const total = session.questionIds.length;
  const marking = session.config.marking ?? { marksPerCorrect: 1, negativeMarks: 0 };
  const marks = Math.round((correct * marking.marksPerCorrect - incorrect * marking.negativeMarks) * 100) / 100;
  const maxMarks = total * marking.marksPerCorrect;
  const percentage = maxMarks > 0 ? Math.round((marks / maxMarks) * 1000) / 10 : 0;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const timeTakenSeconds = elapsedSeconds(session);
  const avgTimePerQuestionSeconds = attempted > 0 ? Math.round(timeTakenSeconds / attempted) : 0;

  return {
    sessionId: session.id,
    totalQuestions: total,
    attempted,
    correct,
    incorrect,
    skipped,
    marks,
    maxMarks,
    percentage,
    accuracy,
    timeTakenSeconds,
    avgTimePerQuestionSeconds,
  };
}
