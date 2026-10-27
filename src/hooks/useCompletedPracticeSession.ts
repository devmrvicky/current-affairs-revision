import { useEffect, useState } from 'react';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { getPracticeAttemptSession } from '../services/attemptLedgerService';
import type { PracticeSession } from '../types/practiceSession';

export type CompletedSessionState =
  | { status: 'loading' }
  /** No completed session to show (nothing in progress/finished, or a past attempt that can't be rebuilt). */
  | { status: 'missing' }
  | { status: 'ready'; session: PracticeSession; isPastAttempt: boolean };

/**
 * The completed session the result/review pages should render.
 *   • No attempt id → the live one the session engine just finished (store).
 *   • With an attempt id → that past attempt, rebuilt read-only from the attempt
 *     ledger. The live store is never touched, so reviewing history can't disturb
 *     a session that happens to be in progress.
 */
export function useCompletedPracticeSession(attemptId: string | undefined): CompletedSessionState {
  const live = usePracticeSessionStore((s) => s.session);
  const [past, setPast] = useState<{ id: string; session: PracticeSession | null } | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    getPracticeAttemptSession(attemptId)
      .then((session) => { if (!cancelled) setPast({ id: attemptId, session }); })
      .catch((err) => {
        console.error('Failed to load past attempt', err);
        if (!cancelled) setPast({ id: attemptId, session: null });
      });
    return () => { cancelled = true; };
  }, [attemptId]);

  if (attemptId) {
    if (!past || past.id !== attemptId) return { status: 'loading' };
    return past.session ? { status: 'ready', session: past.session, isPastAttempt: true } : { status: 'missing' };
  }
  return live && live.isCompleted ? { status: 'ready', session: live, isPastAttempt: false } : { status: 'missing' };
}
