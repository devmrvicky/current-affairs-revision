// ─── Universal Session Store (Phase 8) ─────────────────────────────────────────
// Manages the active universal Practice/Test session. Deliberately does NOT
// import anything from quizStore/types/index.ts (DailyQuiz/Question/
// QuestionAttempt) — this store only ever knows about stable question IDs
// and SessionQuestionState, per master prompt §4/§40. Content is resolved
// from the repository by the page, not stored here.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PracticeConfiguration, PracticeSession, SessionQuestionState } from '../types/practiceSession';
import { sessionPurpose, type MarkPurpose } from '../types/questionMark';
import { activatePractice, suspendPractice, touchPractice } from '../services/sessionLifecycle';
import { sessionRegistry, parkInBackground } from '../services/sessionRegistry';
import { captureOrigin, type ReturnOrigin } from '../services/returnRoute';

function newSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface PracticeSessionStore {
  session: PracticeSession | null;

  /** Starts a new session. An unfinished session already in the store is parked in the registry, never discarded. `origin` (default: the screen the learner is on right now) is where Close leads back to. */
  startSession: (config: PracticeConfiguration, questionIds: string[], origin?: ReturnOrigin) => void;
  /** Loads a previously saved session as the active one (the caller has already removed it from the registry). */
  loadSession: (session: PracticeSession) => void;
  /** Test mode lets the learner change an answer; Practice mode locks it once revealed. */
  selectAnswer: (optionId: string, timeTaken: number) => void;
  /** Removes the answer on the current question (Test mode only — a revealed Practice answer stays). */
  clearAnswer: () => void;
  toggleMarkForReview: () => void;
  /** Sets (or, with null, removes) the mark and its purpose on the current question. */
  setMarkPurpose: (purpose: MarkPurpose | null, index?: number) => void;
  /** The whole set of purposes on a question (a question can carry several). Keeps the review flag and the palette purpose consistent. */
  setMarks: (purposes: MarkPurpose[], index?: number) => void;
  /** Leaving the test: stops its clock (see sessionLifecycle.ts). Safe to call repeatedly. */
  suspend: (at?: number) => void;
  /** Test is on screen again: folds time away into the clock and stamps activity. */
  activate: () => void;
  /** Heartbeat — keeps "last active" fresh while the test is open. */
  touch: () => void;
  /** Adds dwell time to the question the learner is leaving, so revisits accumulate. Practice freezes it once revealed; Test keeps counting. */
  addTimeSpent: (index: number, seconds: number) => void;
  /** Sectional tests: records which sections have begun (see services/sessionTiming.ts). Only ever grows. */
  setSectionStarts: (starts: number[]) => void;
  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  completeSession: () => void;
  clearSession: () => void;
}

export const usePracticeSessionStore = create<PracticeSessionStore>()(
  persist(
    (set, get) => ({
      session: null,

      startSession: (config, questionIds, origin = captureOrigin()) => {
        // Never discard another unfinished test just because a new one is starting: park it.
        const previous = get().session;
        if (previous && !previous.isCompleted) {
          parkInBackground(sessionRegistry.parkPractice(suspendPractice(previous)), 'the previous test');
        }

        const states: SessionQuestionState[] = questionIds.map((questionId) => ({
          questionId,
          selectedAnswer: null,
          isMarkedForReview: false,
          timeTaken: 0,
        }));

        const now = Date.now();
        set({
          session: {
            id: newSessionId(),
            config,
            questionIds,
            states,
            currentIndex: 0,
            startedAt: now,
            lastActiveAt: now,
            isCompleted: false,
            totalPausedTime: 0,
            visitedIndices: [0],
            ...(config.timing?.mode === 'sectional' ? { sectionStarts: [0] } : {}),
            returnRoute: origin.route,
            returnHistoryIdx: origin.idx,
          },
        });
      },

      loadSession: (session) => set({ session }),

      setSectionStarts: (starts) => {
        const session = get().session;
        if (!session || session.isCompleted || session.config.timing?.mode !== 'sectional') return;
        const current = session.sectionStarts ?? [0];
        if (starts.length <= current.length) return; // sections only ever move forward — a stale write can't reopen one
        set({ session: { ...session, sectionStarts: starts } });
      },

      selectAnswer: (optionId, timeTaken) => {
        const session = get().session;
        if (!session || session.isCompleted) return;
        const current = session.states[session.currentIndex];
        const isTest = session.config.mode === 'test';
        // Practice reveals the answer the moment it is chosen, so it is final. A Test hides
        // correctness until submission, so the learner may change their mind — the result is
        // always computed from whatever is selected at submit time.
        if (current.selectedAnswer !== null && !isTest) return;
        if (isTest && current.selectedAnswer === optionId) return;
        const states = [...session.states];
        states[session.currentIndex] = { ...current, selectedAnswer: optionId, answeredAt: Date.now(), timeTaken };
        set({ session: { ...session, states } });
      },

      clearAnswer: () => {
        const session = get().session;
        if (!session || session.isCompleted || session.config.mode !== 'test') return;
        const current = session.states[session.currentIndex];
        if (current.selectedAnswer === null) return;
        const states = [...session.states];
        states[session.currentIndex] = { ...current, selectedAnswer: null, answeredAt: undefined };
        set({ session: { ...session, states } });
      },

      toggleMarkForReview: () => {
        const session = get().session;
        if (!session) return;
        const states = [...session.states];
        const current = states[session.currentIndex];
        const on = !(current.markPurpose ?? (current.isMarkedForReview ? 'review' : undefined));
        states[session.currentIndex] = { ...current, isMarkedForReview: on, markPurpose: on ? 'review' : undefined };
        set({ session: { ...session, states } });
      },

      setMarkPurpose: (purpose, index) => {
        const session = get().session;
        if (!session) return;
        const at = index ?? session.currentIndex;
        const current = session.states[at];
        if (!current) return;
        const states = [...session.states];
        // One mark per question: setting a purpose replaces whatever was there, so repeated marking can't duplicate.
        states[at] = { ...current, markPurpose: purpose ?? undefined, isMarkedForReview: purpose === 'review' };
        set({ session: { ...session, states } });
      },

      setMarks: (purposes, index) => {
        const session = get().session;
        if (!session) return;
        const at = index ?? session.currentIndex;
        const current = session.states[at];
        if (!current) return;
        const states = [...session.states];
        states[at] = { ...current, markPurpose: sessionPurpose(purposes), isMarkedForReview: purposes.includes('review') };
        set({ session: { ...session, states } });
      },

      addTimeSpent: (index, seconds) => {
        const session = get().session;
        if (!session || seconds <= 0) return;
        const current = session.states[index];
        // Practice: time stops once the answer is revealed. Test: the learner can still be working on
        // the question (changing the answer), so time keeps accumulating.
        if (!current || (current.selectedAnswer !== null && session.config.mode !== 'test')) return;
        const states = [...session.states];
        states[index] = { ...current, timeTaken: current.timeTaken + seconds };
        set({ session: { ...session, states } });
      },

      goToQuestion: (index) => {
        const session = get().session;
        if (!session || index < 0 || index >= session.questionIds.length) return;
        const visited = session.visitedIndices.includes(index) ? session.visitedIndices : [...session.visitedIndices, index];
        set({ session: { ...session, currentIndex: index, visitedIndices: visited } });
      },

      nextQuestion: () => {
        const session = get().session;
        if (!session) return;
        const nextIndex = Math.min(session.currentIndex + 1, session.questionIds.length - 1);
        get().goToQuestion(nextIndex);
      },

      pauseSession: () => {
        const session = get().session;
        if (!session || session.pausedAt) return;
        set({ session: { ...session, pausedAt: Date.now() } });
      },

      resumeSession: () => {
        const session = get().session;
        if (!session || !session.pausedAt) return;
        const additionalPause = Date.now() - session.pausedAt;
        set({ session: { ...session, pausedAt: undefined, totalPausedTime: session.totalPausedTime + additionalPause } });
      },

      completeSession: () => {
        const session = get().session;
        if (!session || session.isCompleted) return; // idempotent — a second submit (timer expiry racing a click) changes nothing
        set({ session: { ...session, isCompleted: true, completedAt: Date.now(), pausedAt: undefined, suspendedAt: undefined } });
      },

      suspend: (at) => {
        const session = get().session;
        if (!session) return;
        const next = suspendPractice(session, at);
        if (next !== session) set({ session: next });
      },

      activate: () => {
        const session = get().session;
        if (!session || session.isCompleted) return;
        set({ session: activatePractice(session) });
      },

      touch: () => {
        const session = get().session;
        if (!session || session.isCompleted) return;
        set({ session: touchPractice(session) });
      },

      clearSession: () => set({ session: null }),
    }),
    { name: 'examverse-universal-session' }
  )
);
