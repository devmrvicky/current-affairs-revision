// ─── Test timing: overall and sectional (pure) ───────────────────────────────
// A learner can set their own time for a test: one overall countdown, or one countdown per section.
//
// DESIGN: the clock is the session's own elapsed time — Date.now() − startedAt − paused/away time — the
// same value QuizTimer and the Resume list already use. Nothing here is a separate interval counter that can
// drift or reset. For sectional tests the only stored state is `sectionStarts` (the elapsed second at which each
// section began); which section is active, and how long it has left, are *derived* from that and the clock.
// So a refresh, a Back-then-Resume, or an hour away all restore the right section and the right time left —
// and if a section's time ran out while the learner was away, they come back in the next one.

import type { SessionSection, SessionTiming } from '../types/practiceSession';

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 600;
export const MAX_SECTIONS = 8;

export type TimingSpec =
  | { kind: 'default' }
  | { kind: 'none' }
  | { kind: 'overall'; minutes: number }
  | { kind: 'sectional'; sectionMinutes: number[] };

/** Why a spec can't be used for a test of this size, or null when it's fine. */
export function validateTimingSpec(spec: TimingSpec, questionCount: number): string | null {
  const okMinutes = (m: number) => Number.isFinite(m) && Number.isInteger(m) && m >= MIN_MINUTES && m <= MAX_MINUTES;
  if (spec.kind === 'overall') return okMinutes(spec.minutes) ? null : `Enter a whole number of minutes from ${MIN_MINUTES} to ${MAX_MINUTES}.`;
  if (spec.kind === 'sectional') {
    const n = spec.sectionMinutes.length;
    if (n < 2) return 'A sectional test needs at least 2 sections.';
    if (n > MAX_SECTIONS) return `At most ${MAX_SECTIONS} sections are supported.`;
    if (n > questionCount) return `This test has only ${questionCount} question${questionCount === 1 ? '' : 's'} — it can't be split into ${n} sections.`;
    if (!spec.sectionMinutes.every(okMinutes)) return `Every section needs a whole number of minutes from ${MIN_MINUTES} to ${MAX_MINUTES}.`;
  }
  return null;
}

/** [4, 3, 3] for 10 questions in 3 parts — as even as possible, earlier sections take the remainder. */
export function splitQuestions(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

export interface ResolvedTiming {
  /** Undefined = no countdown at all. */
  durationSeconds?: number;
  timing?: SessionTiming;
}

/**
 * Turns the learner's choice into what goes on the session config.
 *   default    → the app's usual duration, untouched (so old behaviour is unchanged)
 *   none       → untimed
 *   overall    → one countdown
 *   sectional  → consecutive sections of (almost) equal size, each with its own countdown
 */
export function resolveTiming(spec: TimingSpec, questionCount: number, defaultSeconds: number | undefined): ResolvedTiming {
  const problem = validateTimingSpec(spec, questionCount);
  if (problem) throw new Error(problem);
  if (spec.kind === 'default') return { durationSeconds: defaultSeconds };
  if (spec.kind === 'none') return {};
  if (spec.kind === 'overall') return { durationSeconds: spec.minutes * 60, timing: { mode: 'overall', overallSeconds: spec.minutes * 60 } };

  const sizes = splitQuestions(questionCount, spec.sectionMinutes.length);
  let cursor = 0;
  const sections: SessionSection[] = spec.sectionMinutes.map((minutes, i) => {
    const section: SessionSection = { id: `section-${i + 1}`, label: `Section ${i + 1}`, startIndex: cursor, endIndex: cursor + sizes[i], durationSeconds: minutes * 60 };
    cursor += sizes[i];
    return section;
  });
  const overallSeconds = sections.reduce((n, s) => n + s.durationSeconds, 0);
  return { durationSeconds: overallSeconds, timing: { mode: 'sectional', overallSeconds, sections } };
}

/** Session-elapsed seconds — identical arithmetic to QuizTimer, so every clock in the app agrees. */
export function sessionElapsedSeconds(s: { startedAt: number; totalPausedTime: number; pausedAt?: number; suspendedAt?: number; completedAt?: number }, now: number): number {
  const stopAt = s.completedAt ?? s.suspendedAt ?? s.pausedAt ?? now;
  return Math.max(0, Math.floor((stopAt - s.startedAt - s.totalPausedTime) / 1000));
}

export interface SectionState {
  activeIndex: number;
  /** Starts including any sections that expired unnoticed (e.g. while the learner was away). */
  starts: number[];
  sectionRemainingSeconds: number;
  /** Whole test time left: this section's remainder plus every later section's full time. */
  totalRemainingSeconds: number;
  /** The last section's time is up. */
  finished: boolean;
}

export function deriveSectionState(timing: SessionTiming, starts: readonly number[] | undefined, elapsedSeconds: number): SectionState {
  const sections = timing.sections ?? [];
  if (sections.length === 0) throw new Error('deriveSectionState needs a sectional timing');
  const out = starts && starts.length > 0 ? [...starts] : [0];
  let i = out.length - 1;
  let deadline = out[i] + sections[i].durationSeconds;
  while (elapsedSeconds >= deadline) {
    if (i === sections.length - 1) return { activeIndex: i, starts: out, sectionRemainingSeconds: 0, totalRemainingSeconds: 0, finished: true };
    out.push(deadline); // the next section began the instant this one ran out
    i++;
    deadline = out[i] + sections[i].durationSeconds;
  }
  const later = sections.slice(i + 1).reduce((n, s) => n + s.durationSeconds, 0);
  return { activeIndex: i, starts: out, sectionRemainingSeconds: deadline - elapsedSeconds, totalRemainingSeconds: deadline - elapsedSeconds + later, finished: false };
}

/** The learner ends the active section early; the next one starts now. The last section can't be "finished" — that is Submit. */
export function finishActiveSection(timing: SessionTiming, starts: readonly number[] | undefined, elapsedSeconds: number): number[] {
  const state = deriveSectionState(timing, starts, elapsedSeconds);
  if (state.finished || state.activeIndex >= (timing.sections?.length ?? 0) - 1) return state.starts;
  return [...state.starts, Math.max(elapsedSeconds, state.starts[state.activeIndex])];
}

export function sectionIndexOfQuestion(timing: SessionTiming, questionIndex: number): number {
  const sections = timing.sections ?? [];
  const i = sections.findIndex((s) => questionIndex >= s.startIndex && questionIndex < s.endIndex);
  return i < 0 ? 0 : i;
}

/** In a sectional test only the active section's questions can be opened — earlier ones are closed, later ones not yet open. */
export function canVisitQuestion(timing: SessionTiming | undefined, activeSectionIndex: number, questionIndex: number): boolean {
  if (!timing || timing.mode !== 'sectional') return true;
  return sectionIndexOfQuestion(timing, questionIndex) === activeSectionIndex;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** One line for a button or summary: "Default timer", "No timer", "30 min", "3 sections · 45 min". */
export function describeTimingSpec(spec: TimingSpec): string {
  if (spec.kind === 'default') return 'Default timer';
  if (spec.kind === 'none') return 'No timer';
  if (spec.kind === 'overall') return `${spec.minutes} min`;
  return `${spec.sectionMinutes.length} sections · ${spec.sectionMinutes.reduce((n, m) => n + m, 0)} min`;
}
