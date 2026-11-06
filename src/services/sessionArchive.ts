// ─── Session archive ─────────────────────────────────────────────────────────
// The ✕ on a Resume card ends the session as a *resumable* thing without
// destroying it: the full session is copied into the archivedSessions store
// first, and only then taken off the Resume list. If the archive write fails,
// nothing is removed — the learner keeps the session and sees an error.

import { archivedSessionsDB } from './db';
import { sessionRegistry } from './sessionRegistry';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useQuizStore } from '../store/quizStore';
import { useMockSessionStore } from '../store/mockSessionStore';
import type { ArchivedSessionRecord, ResumableSessionSummary } from '../types/savedSession';
import type { PracticeSession } from '../types/practiceSession';
import type { QuizSession } from '../types';
import type { MockSession } from '../types/mockSession';

/** Builds the archive row from a summary + the full session payload. Pure. */
export function buildArchiveRecord(
  summary: ResumableSessionSummary,
  payload: PracticeSession | QuizSession | MockSession,
  now: number = Date.now(),
): ArchivedSessionRecord {
  return {
    id: summary.id,
    kind: summary.kind,
    payload,
    archivedAt: now,
    archivedReason: 'user-closed',
    title: summary.title,
    subtitle: summary.subtitle,
    answered: summary.answered,
    total: summary.total,
    lastActiveAt: summary.lastActiveAt,
  };
}

function activePayload(summary: ResumableSessionSummary): PracticeSession | QuizSession | MockSession | null {
  if (summary.kind === 'universal') return usePracticeSessionStore.getState().session;
  if (summary.kind === 'legacy') return useQuizStore.getState().session;
  return useMockSessionStore.getState().session;
}

/**
 * Archives the session, then removes it from wherever it was resumable.
 * Order matters: archive first, remove second. A failure between the two leaves
 * the session in both places (listed once, still resumable) — never in neither.
 * Returns false when the session no longer exists (e.g. closed from another tab).
 */
export async function archiveSession(summary: ResumableSessionSummary): Promise<boolean> {
  let payload: PracticeSession | QuizSession | MockSession | null | undefined;
  if (summary.location === 'saved') {
    payload = (await sessionRegistry.get(summary.id))?.payload;
  } else {
    payload = activePayload(summary);
    if (payload && payload.id !== summary.id) payload = null;
  }
  if (!payload) return false;

  await archivedSessionsDB.put(buildArchiveRecord(summary, payload));

  if (summary.location === 'saved') {
    await sessionRegistry.remove(summary.id);
  } else if (summary.kind === 'universal') {
    usePracticeSessionStore.getState().clearSession();
  } else if (summary.kind === 'legacy') {
    useQuizStore.getState().clearSession();
  } else {
    useMockSessionStore.getState().clearSession();
  }
  return true;
}
