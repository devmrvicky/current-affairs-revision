// ─── Saved (parked) sessions ─────────────────────────────────────────────────
// Each engine's Zustand store holds the ONE session that is on screen. Every
// other unfinished session — started earlier, left unfinished, then displaced
// by starting something else — is parked here, in IndexedDB, keyed by its own
// session id. A session lives in exactly one place at a time (an engine store
// or the registry), so there is never a second copy to drift out of sync.

import type { PracticeSession } from './practiceSession';
import type { MockSession } from './mockSession';
import type { QuizSession } from './index';

export type SessionKind = 'universal' | 'legacy' | 'mock';

interface SavedSessionBase {
  /** The session's own id. */
  id: string;
  /** When it was parked (ms) — a tie-breaker; "last active" lives on the session itself. */
  savedAt: number;
  /** Denormalised copy of the session's last activity so the registry can be sorted by an index. */
  lastActiveAt: number;
}

export type SavedSessionRecord =
  | (SavedSessionBase & { kind: 'universal'; payload: PracticeSession })
  | (SavedSessionBase & { kind: 'legacy'; payload: QuizSession })
  | (SavedSessionBase & { kind: 'mock'; payload: MockSession });

export type SessionLifecycle = 'active' | 'paused' | 'completed' | 'abandoned';

/** What a Resume card shows. Derived on demand from the session itself — never stored. */
export interface ResumableSessionSummary {
  id: string;
  kind: SessionKind;
  title: string;
  /** Subject / chapter / topic line, built only from metadata the session actually carries. */
  subtitle?: string;
  /** Heading the Resume list groups this card under — the subject (or "Mock tests" / "Mixed subjects"). Derived, never stored. */
  group: string;
  mode?: 'practice' | 'test' | 'mock';
  answered: number;
  total: number;
  /** 1-based position of the question the learner is on. */
  position: number;
  /** Seconds left on the test clock, or null when the test isn't timed. Frozen at the moment the learner left. */
  remainingSeconds: number | null;
  markedCount: number;
  createdAt: number;
  lastActiveAt: number;
  lastResumedAt?: number;
  lifecycle: SessionLifecycle;
  resumeRoute: string;
  /** Where the session currently lives. */
  location: 'active' | 'saved';
}

// ─── Archived sessions ───────────────────────────────────────────────────────
// Closing a test with the ✕ never deletes it. The session is taken off the
// Resume list and stored here, untouched, so its history and answers survive.
// An archived session is NOT resumable and never appears under Resume Tests.

export interface ArchivedSessionRecord {
  /** The session's own id — the same id it had while active. */
  id: string;
  kind: SessionKind;
  /** The full session exactly as it was when the learner closed it. */
  payload: PracticeSession | QuizSession | MockSession;
  archivedAt: number;
  archivedReason: 'user-closed';
  /** Denormalised for listing without opening the payload. */
  title: string;
  subtitle?: string;
  answered: number;
  total: number;
  lastActiveAt: number;
}
