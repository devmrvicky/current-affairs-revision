// ─── Session manager ─────────────────────────────────────────────────────────
// The one place that knows about ALL unfinished sessions: the three engine
// stores (each holds the session that is on screen) plus the registry (every
// other unfinished session). Home's Resume Tests section, resuming and
// abandoning all go through here, so no page has to know where a session
// physically lives.

import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useQuizStore } from '../store/quizStore';
import { useMockSessionStore } from '../store/mockSessionStore';
import { sessionRegistry } from './sessionRegistry';
import { archiveSession } from './sessionArchive';
import {
  isMockUnfinished, isPracticeUnfinished, isQuizUnfinished,
  suspendMock, suspendPractice, suspendQuiz,
  summarizeMock, summarizePractice, summarizeQuiz,
} from './sessionLifecycle';
import type { ResumableSessionSummary, SavedSessionRecord } from '../types/savedSession';

function summarizeRecord(record: SavedSessionRecord, now: number): ResumableSessionSummary | null {
  switch (record.kind) {
    case 'universal': return isPracticeUnfinished(record.payload) ? summarizePractice(record.payload, 'saved', now) : null;
    case 'legacy': return isQuizUnfinished(record.payload) ? summarizeQuiz(record.payload, 'saved', now) : null;
    case 'mock': return isMockUnfinished(record.payload) ? summarizeMock(record.payload, 'saved', now) : null;
  }
}

/**
 * Every unfinished session, newest activity first. Completed sessions never appear (they are history),
 * and a session id that somehow exists in both a store and the registry is listed once, the store's copy winning.
 */
export async function listResumableSessions(): Promise<ResumableSessionSummary[]> {
  const now = Date.now();
  const byId = new Map<string, ResumableSessionSummary>();

  const universal = usePracticeSessionStore.getState().session;
  if (isPracticeUnfinished(universal)) byId.set(universal.id, summarizePractice(universal, 'active', now));
  const legacy = useQuizStore.getState().session;
  if (isQuizUnfinished(legacy)) byId.set(legacy.id, summarizeQuiz(legacy, 'active', now));
  const mock = useMockSessionStore.getState().session;
  if (isMockUnfinished(mock)) byId.set(mock.id, summarizeMock(mock, 'active', now));

  for (const record of await sessionRegistry.list()) {
    if (byId.has(record.id)) continue;
    // One unreadable record must never hide the learner's other sessions.
    try {
      const summary = summarizeRecord(record, now);
      if (summary) byId.set(summary.id, summary);
    } catch (err) {
      console.warn('Skipping an unreadable saved session', record.id, err);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/** Moves whatever unfinished session occupies the engine's store into the registry, so a different one can take its place. */
async function parkOccupant(kind: ResumableSessionSummary['kind'], exceptId: string): Promise<void> {
  if (kind === 'universal') {
    const current = usePracticeSessionStore.getState().session;
    if (isPracticeUnfinished(current) && current.id !== exceptId) await sessionRegistry.parkPractice(suspendPractice(current));
  } else if (kind === 'legacy') {
    const current = useQuizStore.getState().session;
    if (isQuizUnfinished(current) && current.id !== exceptId) await sessionRegistry.parkQuiz(suspendQuiz(current));
  } else {
    const current = useMockSessionStore.getState().session;
    if (isMockUnfinished(current) && current.id !== exceptId) await sessionRegistry.parkMock(suspendMock(current));
  }
}

/**
 * Makes the chosen session the active one for its engine and returns the route to open.
 * A different unfinished session already occupying that engine is parked first — resuming
 * one test never overwrites another's progress. Returns null if the session no longer exists
 * (e.g. it was resumed or abandoned from another tab).
 */
export async function resumeSavedSession(summary: ResumableSessionSummary): Promise<string | null> {
  if (summary.location === 'active') return summary.resumeRoute;

  const record = await sessionRegistry.get(summary.id);
  if (!record) return null;

  await parkOccupant(summary.kind, summary.id);
  // Load first, delete second: if the delete fails the session merely exists twice (and is listed once),
  // never zero times.
  if (record.kind === 'universal') usePracticeSessionStore.getState().loadSession(record.payload);
  else if (record.kind === 'legacy') useQuizStore.getState().loadSession(record.payload);
  else useMockSessionStore.getState().loadSession(record.payload);
  await sessionRegistry.remove(record.id);
  return summary.resumeRoute;
}

/**
 * Closing a test (✕) archives it — it leaves Resume Tests but its record is kept.
 * Nothing here deletes session data. See services/sessionArchive.ts.
 */
export async function abandonSavedSession(summary: ResumableSessionSummary): Promise<boolean> {
  return archiveSession(summary);
}

export interface ResumableGroup {
  label: string;
  sessions: ResumableSessionSummary[];
  lastActiveAt: number;
}

/** Groups Resume cards under their subject/test-type heading. Newest activity first, both between and within groups. Pure. */
export function groupResumableSessions(sessions: ResumableSessionSummary[]): ResumableGroup[] {
  const byLabel = new Map<string, ResumableSessionSummary[]>();
  for (const s of sessions) {
    const list = byLabel.get(s.group) ?? [];
    list.push(s);
    byLabel.set(s.group, list);
  }
  return Array.from(byLabel.entries())
    .map(([label, list]) => {
      const sorted = [...list].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      return { label, sessions: sorted, lastActiveAt: sorted[0].lastActiveAt };
    })
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * Run once at startup. A session still "running" now cannot be on screen, so its clock is stopped
 * at its last heartbeat — covering a browser that was killed without a chance to say goodbye.
 */
export function reconcileSessionsOnBoot(): void {
  const now = Date.now();
  const practice = usePracticeSessionStore.getState();
  if (isPracticeUnfinished(practice.session)) practice.suspend(Math.min(now, practice.session.lastActiveAt ?? now));
  const quiz = useQuizStore.getState();
  if (isQuizUnfinished(quiz.session)) quiz.suspend(Math.min(now, quiz.session.lastActiveAt ?? now));
  const mock = useMockSessionStore.getState();
  if (isMockUnfinished(mock.session)) mock.suspend(Math.min(now, mock.session.lastActiveAt ?? now));
}
