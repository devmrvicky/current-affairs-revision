// ─── Resume Session Detection ─────────────────────────────────────────────────
// Home's "Resume Test" must show the most recent incomplete session
// regardless of which engine it came from — never assume it's today's
// Current Affairs quiz just because that used to be the only option.

import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useQuizStore } from '../store/quizStore';
import { useMockSessionStore } from '../store/mockSessionStore';

export interface ResumableSession {
  kind: 'universal' | 'legacy' | 'mock';
  label: string;
  answered: number;
  total: number;
  startedAt: number;
  resumeRoute: string;
}

export function getActiveResumableSession(): ResumableSession | null {
  const universal = usePracticeSessionStore.getState().session;
  const legacy = useQuizStore.getState().session;
  const mock = useMockSessionStore.getState().session;

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

  // Mock/Sectional Mock sessions (product spec §69/§101) — only "active" is
  // resumable; "completed"/"abandoned" sessions are history, not a resume
  // target. No special-casing of Current Affairs priority here either way —
  // whichever engine's session is most recently started wins, same as the
  // other two candidates.
  if (mock && mock.status === 'active') {
    const allIds = mock.sections.flatMap((s) => s.questionIds);
    candidates.push({
      kind: 'mock',
      label: mock.title,
      answered: allIds.filter((qid) => mock.states[qid]?.selectedAnswer !== null).length,
      total: allIds.length,
      startedAt: mock.startedAt,
      resumeRoute: `/mock-tests/${mock.mockDefinitionId}/session`,
    });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.startedAt - a.startedAt)[0];
}
