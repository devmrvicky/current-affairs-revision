// ─── Session lifecycle (pure) ────────────────────────────────────────────────
// What happens to a test's clock and bookkeeping when the learner walks away
// from it and later comes back — for all three engines — plus the numbers a
// Resume card displays. No stores, no storage, no React: every function takes a
// session and returns a new one, so the timing rules live in one place and can
// be checked in isolation.
//
// THE TIMING RULE
//   Leaving a test does not spend its time. When a session stops being on screen
//   it is *suspended*: `suspendedAt` is stamped. When it is reactivated the time
//   away is folded into `totalPausedTime` (practice / quiz) or used to shift the
//   active section's absolute clock (mock), so the remaining time on return equals
//   the remaining time at departure — never reset, never double-counted.
//   `suspendedAt` is separate from `pausedAt`, which is the learner's own explicit
//   Pause: leaving while explicitly paused changes nothing (already stopped), and
//   returning does not auto-resume it.
//
// CRASH RECOVERY
//   A heartbeat keeps `lastActiveAt` fresh while a test is open. If the browser
//   dies without a chance to suspend, the next start suspends the session *at its
//   last heartbeat* rather than at "now", so the time the app was closed isn't
//   charged to the test.

import type { PracticeSession } from '../types/practiceSession';
import type { MockSession, MockSectionRuntime } from '../types/mockSession';
import type { QuizSession } from '../types';
import type { ResumableSessionSummary, SessionLifecycle } from '../types/savedSession';
import { effectivePurpose } from '../types/questionMark';
import { SUBJECTS } from '../data/registry/subjectRegistry';

// ─── Practice / Test (universal engine) ──────────────────────────────────────

export function isPracticeUnfinished(s: PracticeSession | null | undefined): s is PracticeSession {
  return !!s && !s.isCompleted;
}

export function suspendPractice(s: PracticeSession, at: number = Date.now()): PracticeSession {
  if (s.isCompleted || s.pausedAt || s.suspendedAt) return s;
  return { ...s, suspendedAt: at, lastActiveAt: at };
}

export function activatePractice(s: PracticeSession, now: number = Date.now()): PracticeSession {
  if (s.isCompleted) return s;
  const away = s.suspendedAt ? Math.max(0, now - s.suspendedAt) : 0;
  return {
    ...s,
    suspendedAt: undefined,
    totalPausedTime: s.totalPausedTime + away,
    lastResumedAt: s.suspendedAt ? now : s.lastResumedAt,
    lastActiveAt: now,
  };
}

export function touchPractice(s: PracticeSession, now: number = Date.now()): PracticeSession {
  return s.isCompleted ? s : { ...s, lastActiveAt: now };
}

// ─── Legacy quiz engine (Current Affairs, chapter tests, revision) ───────────

export function isQuizUnfinished(s: QuizSession | null | undefined): s is QuizSession {
  return !!s && !s.isCompleted;
}

export function suspendQuiz(s: QuizSession, at: number = Date.now()): QuizSession {
  if (s.isCompleted || s.isPaused || s.pausedAt || s.suspendedAt) return s;
  return { ...s, suspendedAt: at, lastActiveAt: at };
}

export function activateQuiz(s: QuizSession, now: number = Date.now()): QuizSession {
  if (s.isCompleted) return s;
  const away = s.suspendedAt ? Math.max(0, now - s.suspendedAt) : 0;
  return { ...s, suspendedAt: undefined, totalPausedTime: s.totalPausedTime + away, lastResumedAt: s.suspendedAt ? now : s.lastResumedAt, lastActiveAt: now };
}

export function touchQuiz(s: QuizSession, now: number = Date.now()): QuizSession {
  return s.isCompleted ? s : { ...s, lastActiveAt: now };
}

// ─── Mock / sectional mock ───────────────────────────────────────────────────

export function isMockUnfinished(s: MockSession | null | undefined): s is MockSession {
  return !!s && s.status === 'active';
}

export function suspendMock(s: MockSession, at: number = Date.now()): MockSession {
  if (s.status !== 'active' || s.suspendedAt) return s;
  return { ...s, suspendedAt: at, lastActiveAt: at };
}

/**
 * Section clocks are absolute (`startedAt`/`endAt`), so "stopping the clock" means moving them
 * forward by the time spent away — only the section that is running; locked and not-yet-started
 * sections never had a running clock.
 */
export function activateMock(s: MockSession, now: number = Date.now()): MockSession {
  if (s.status !== 'active') return s;
  const away = s.suspendedAt ? Math.max(0, now - s.suspendedAt) : 0;
  const sections: MockSectionRuntime[] =
    away > 0
      ? s.sections.map((sec) =>
          sec.status === 'active' && !sec.locked && sec.startedAt !== undefined && sec.endAt !== undefined
            ? { ...sec, startedAt: sec.startedAt + away, endAt: sec.endAt + away }
            : sec
        )
      : s.sections;
  return { ...s, sections, suspendedAt: undefined, lastResumedAt: s.suspendedAt ? now : s.lastResumedAt, lastActiveAt: now };
}

export function touchMock(s: MockSession, now: number = Date.now()): MockSession {
  return s.status !== 'active' ? s : { ...s, lastActiveAt: now };
}

// ─── Crash recovery ──────────────────────────────────────────────────────────

/** Anything still "running" when the app starts cannot be on screen — stop its clock at the last heartbeat. */
export function reconcilePractice(s: PracticeSession, now: number = Date.now()): PracticeSession {
  return suspendPractice(s, Math.min(now, s.lastActiveAt ?? now));
}
export function reconcileQuiz(s: QuizSession, now: number = Date.now()): QuizSession {
  return suspendQuiz(s, Math.min(now, s.lastActiveAt ?? now));
}
export function reconcileMock(s: MockSession, now: number = Date.now()): MockSession {
  return suspendMock(s, Math.min(now, s.lastActiveAt ?? now));
}

// ─── Summaries for Resume cards ──────────────────────────────────────────────

function subjectNames(ids: string[]): string {
  return ids.map((id) => SUBJECTS.find((s) => s.id === id)?.name ?? id).join(', ');
}

function lifecycleOf(completed: boolean, stopped: boolean): SessionLifecycle {
  return completed ? 'completed' : stopped ? 'paused' : 'active';
}

function remainingFrom(durationSeconds: number | undefined, startedAt: number, totalPausedTime: number, stoppedAt: number | undefined, now: number): number | null {
  if (!durationSeconds) return null;
  const reference = stoppedAt ?? now;
  const elapsed = Math.max(0, (reference - startedAt - totalPausedTime) / 1000);
  return Math.max(0, Math.round(durationSeconds - elapsed));
}

export function summarizePractice(s: PracticeSession, location: 'active' | 'saved', now: number = Date.now()): ResumableSessionSummary {
  const lastAnswer = s.states.reduce((m, st) => Math.max(m, st.answeredAt ?? 0), 0);
  const subjects = subjectNames(s.config.subjectIds);
  return {
    id: s.id,
    kind: 'universal',
    title: s.config.label,
    subtitle: [subjects, s.config.mode === 'test' ? 'Test mode' : 'Practice mode'].filter(Boolean).join(' · '),
    group: s.config.subjectIds.length === 1 ? subjects : s.config.subjectIds.length > 1 ? 'Mixed subjects' : 'Other tests',
    mode: s.config.mode,
    answered: s.states.filter((st) => st.selectedAnswer !== null).length,
    total: s.questionIds.length,
    position: s.currentIndex + 1,
    remainingSeconds: s.config.mode === 'test' ? remainingFrom(s.config.durationSeconds, s.startedAt, s.totalPausedTime, s.suspendedAt ?? s.pausedAt, now) : null,
    markedCount: s.states.filter((st) => effectivePurpose(st)).length,
    createdAt: s.startedAt,
    lastActiveAt: s.lastActiveAt ?? Math.max(s.suspendedAt ?? 0, s.pausedAt ?? 0, lastAnswer, s.startedAt),
    lastResumedAt: s.lastResumedAt,
    lifecycle: lifecycleOf(s.isCompleted, !!(s.pausedAt || s.suspendedAt)),
    resumeRoute: '/session',
    location,
  };
}

export function summarizeQuiz(s: QuizSession, location: 'active' | 'saved', now: number = Date.now()): ResumableSessionSummary {
  const slash = s.fileName.lastIndexOf('/');
  const chapter = slash > 0 ? s.fileName.slice(0, slash).split('/').pop() : undefined;
  const timed = s.testMeta?.durationSeconds;
  return {
    id: s.id,
    kind: 'legacy',
    title: s.testMeta?.examName ?? `${s.date} — Current Affairs`,
    subtitle: ['Current Affairs', chapter].filter(Boolean).join(' · '),
    group: 'Current Affairs',
    mode: s.testMeta?.isTest ? 'test' : 'practice',
    answered: s.attempts.filter((a) => a.status !== 'unanswered').length,
    total: s.totalQuestions,
    position: s.currentIndex + 1,
    remainingSeconds: remainingFrom(timed, s.startTime, s.totalPausedTime, s.suspendedAt ?? s.pausedAt, now),
    markedCount: s.attempts.filter((a) => a.markPurpose ?? a.markedForReview).length,
    createdAt: s.startTime,
    lastActiveAt: s.lastActiveAt ?? Math.max(s.suspendedAt ?? 0, s.pausedAt ?? 0, s.startTime),
    lastResumedAt: s.lastResumedAt,
    lifecycle: lifecycleOf(s.isCompleted, !!(s.isPaused || s.pausedAt || s.suspendedAt)),
    resumeRoute: '/quiz',
    location,
  };
}

export function summarizeMock(s: MockSession, location: 'active' | 'saved', now: number = Date.now()): ResumableSessionSummary {
  const all = s.sections.flatMap((sec) => sec.questionIds);
  const section = s.sections[s.currentSectionIndex];
  const before = s.sections.slice(0, s.currentSectionIndex).reduce((n, sec) => n + sec.questionIds.length, 0);
  const lastAnswer = Object.values(s.states).reduce((m, st) => Math.max(m, st.answeredAt ?? 0), 0);
  const stoppedAt = s.suspendedAt;
  const remaining = section?.endAt !== undefined ? Math.max(0, Math.round((section.endAt - (stoppedAt ?? now)) / 1000)) : null;
  return {
    id: s.id,
    kind: 'mock',
    title: s.title,
    subtitle: s.sections.length > 1 ? `Mock test · Section ${s.currentSectionIndex + 1}/${s.sections.length}${section ? ` — ${section.title}` : ''}` : `Mock test${section ? ` — ${section.title}` : ''}`,
    group: 'Mock tests',
    mode: 'mock',
    answered: all.filter((qid) => s.states[qid]?.selectedAnswer !== null && s.states[qid]?.selectedAnswer !== undefined).length,
    total: all.length,
    position: before + s.currentQuestionIndex + 1,
    remainingSeconds: remaining,
    markedCount: Object.values(s.states).filter((st) => effectivePurpose(st)).length,
    createdAt: s.startedAt,
    lastActiveAt: s.lastActiveAt ?? Math.max(s.suspendedAt ?? 0, lastAnswer, s.startedAt),
    lastResumedAt: s.lastResumedAt,
    lifecycle: lifecycleOf(s.status === 'completed', !!s.suspendedAt),
    resumeRoute: `/mock-tests/${s.mockDefinitionId}/session`,
    location,
  };
}
