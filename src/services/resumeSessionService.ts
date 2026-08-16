// ─── Resume Session Detection ─────────────────────────────────────────────────
// Home's "Resume Test" must show the most recent incomplete session
// regardless of which engine it came from — never assume it's today's
// Current Affairs quiz just because that used to be the only option.

import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useQuizStore } from '../store/quizStore';

export interface ResumableSession {
  kind: 'universal' | 'legacy';
  label: string;
  answered: number;
  total: number;
  startedAt: number;
  resumeRoute: string;
}

export function getActiveResumableSession(): ResumableSession | null {
  const universal = usePracticeSessionStore.getState().session;
  const legacy = useQuizStore.getState().session;

  const candidates: ResumableSession[] = [];

  if (universal && !universal.isCompleted) {
    candidates.push({
      kind: 'universal',
      label: universal.config.label,
      answered: universal.states.filter((s) => s.selectedAnswer !== null).length,
      total: universal.questionIds.length,
      startedAt: universal.startedAt,
      resumeRoute: '/session',
    });
  }

  if (legacy && !legacy.isCompleted) {
    candidates.push({
      kind: 'legacy',
      label: legacy.testMeta?.examName ?? `${legacy.date} — Current Affairs`,
      answered: legacy.attempts.filter((a) => a.status !== 'unanswered').length,
      total: legacy.totalQuestions,
      startedAt: legacy.startTime,
      resumeRoute: '/quiz',
    });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.startedAt - a.startedAt)[0];
}
