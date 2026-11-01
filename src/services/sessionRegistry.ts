// ─── Session registry ────────────────────────────────────────────────────────
// Thin IndexedDB-backed collection of PARKED sessions: unfinished tests that
// were displaced from their engine's store because something else was started.
// It never holds the session that is on screen — that stays in its Zustand
// store — and a session id is only ever in one of the two places.
//
// Parking is deliberately fire-and-forget from the stores' synchronous start
// actions, so failures are logged, not thrown: the learner must always be able
// to start the test they asked for. (The displaced session still exists in
// memory for the rest of the call, and the write is a single small put.)

import { savedSessionsDB } from './db';
import type { SavedSessionRecord } from '../types/savedSession';
import type { PracticeSession } from '../types/practiceSession';
import type { MockSession } from '../types/mockSession';
import type { QuizSession } from '../types';

export const sessionRegistry = {
  async parkPractice(session: PracticeSession): Promise<void> {
    await savedSessionsDB.put({ id: session.id, kind: 'universal', savedAt: Date.now(), lastActiveAt: session.lastActiveAt ?? session.startedAt, payload: session });
  },
  async parkQuiz(session: QuizSession): Promise<void> {
    await savedSessionsDB.put({ id: session.id, kind: 'legacy', savedAt: Date.now(), lastActiveAt: session.lastActiveAt ?? session.startTime, payload: session });
  },
  async parkMock(session: MockSession): Promise<void> {
    await savedSessionsDB.put({ id: session.id, kind: 'mock', savedAt: Date.now(), lastActiveAt: session.lastActiveAt ?? session.startedAt, payload: session });
  },
  list(): Promise<SavedSessionRecord[]> {
    return savedSessionsDB.getAll();
  },
  get(id: string): Promise<SavedSessionRecord | undefined> {
    return savedSessionsDB.get(id);
  },
  remove(id: string): Promise<void> {
    return savedSessionsDB.delete(id);
  },
};

/** Logs instead of throwing — see the note at the top of this file. */
export function parkInBackground(write: Promise<void>, what: string): void {
  write.catch((err) => console.error(`[sessionRegistry] could not save ${what} — it will not appear under Resume Tests`, err));
}
