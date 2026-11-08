// ─── Extra sections of the Practice/Test analysis (pure) ─────────────────────
// The main analysis (practiceAnalysisService → analyzeEntries → AnalysisView) is the same engine the Mock analysis uses.
// These two add what only a practice/test session has: how each *section* of a sectional test went, and which questions
// the learner has now got wrong more than once.

import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import { sectionIndexOfQuestion } from './sessionTiming';
import { buildQuestionHistories, type AttemptRow } from './reviewAnalytics';

export interface SectionResult {
  id: string;
  label: string;
  questions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  /** Null when nothing in the section was answered (never shown as 0 %). */
  accuracy: number | null;
  /** Time recorded on the section's questions. Null when the session recorded none. */
  timeSpentSeconds: number | null;
  /** The time the learner set for the section. */
  allottedSeconds: number;
}

/** Per-section results for a sectional test; an empty list for any other kind of session. */
export function sectionBreakdown(session: PracticeSession, questionsById: ReadonlyMap<string, UniversalQuestion>): SectionResult[] {
  const timing = session.config.timing;
  if (timing?.mode !== 'sectional' || !timing.sections?.length) return [];
  return timing.sections.map((section) => {
    let attempted = 0, correct = 0, time = 0, questions = 0;
    for (let i = section.startIndex; i < section.endIndex; i++) {
      const q = questionsById.get(session.questionIds[i]);
      const state = session.states[i];
      if (!q || !state || sectionIndexOfQuestion(timing, i) !== timing.sections!.indexOf(section)) continue;
      questions++;
      time += state.timeTaken;
      if (state.selectedAnswer === null) continue;
      attempted++;
      if (state.selectedAnswer === q.correctAnswer) correct++;
    }
    return {
      id: section.id, label: section.label, questions, attempted, correct, incorrect: attempted - correct, unattempted: questions - attempted,
      accuracy: attempted === 0 ? null : Math.round((correct / attempted) * 1000) / 10,
      timeSpentSeconds: time > 0 ? time : null,
      allottedSeconds: section.durationSeconds,
    };
  });
}

export interface RepeatedMistake {
  questionId: string;
  question: string;
  topicId?: string;
  /** Times it was wrong in earlier attempts (this session not counted). */
  earlierWrong: number;
  earlierAttempts: number;
  lastWrongAt: number | undefined;
}

/**
 * Questions wrong in THIS session that were also wrong before. `earlierAttempts` are the ledger rows from other sessions —
 * this session's own rows are ignored, so the answer doesn't depend on whether they were written to the ledger yet.
 */
export function repeatedMistakesInSession(session: PracticeSession, questionsById: ReadonlyMap<string, UniversalQuestion>, earlierAttempts: readonly AttemptRow[]): RepeatedMistake[] {
  const histories = buildQuestionHistories(earlierAttempts.filter((a) => a.sessionId !== session.id));
  const out: RepeatedMistake[] = [];
  session.questionIds.forEach((id, i) => {
    const state = session.states[i];
    const q = questionsById.get(id);
    if (!q || !state || state.selectedAnswer === null || state.selectedAnswer === q.correctAnswer) return; // wrong this time only
    const h = histories.get(id);
    if (!h || h.wrong === 0) return;
    out.push({ questionId: id, question: q.question, topicId: q.topicId, earlierWrong: h.wrong, earlierAttempts: h.attempts, lastWrongAt: h.lastAttemptAt });
  });
  return out.sort((a, b) => b.earlierWrong - a.earlierWrong);
}
