// ─── Universal Session Store (Phase 8) ─────────────────────────────────────────
// Manages the active universal Practice/Test session. Deliberately does NOT
// import anything from quizStore/types/index.ts (DailyQuiz/Question/
// QuestionAttempt) — this store only ever knows about stable question IDs
// and SessionQuestionState, per master prompt §4/§40. Content is resolved
// from the repository by the page, not stored here.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PracticeConfiguration, PracticeSession, SessionQuestionState } from '../types/practiceSession';

function newSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface PracticeSessionStore {
  session: PracticeSession | null;

  startSession: (config: PracticeConfiguration, questionIds: string[]) => void;
  selectAnswer: (optionId: string, timeTaken: number) => void;
  toggleMarkForReview: () => void;
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

      startSession: (config, questionIds) => {
        const states: SessionQuestionState[] = questionIds.map((questionId) => ({
          questionId,
          selectedAnswer: null,
          isMarkedForReview: false,
          timeTaken: 0,
        }));

        set({
          session: {
            id: newSessionId(),
            config,
            questionIds,
            states,
            currentIndex: 0,
            startedAt: Date.now(),
            isCompleted: false,
            totalPausedTime: 0,
            visitedIndices: [0],
          },
        });
      },

      selectAnswer: (optionId, timeTaken) => {
        const session = get().session;
        if (!session) return;
        const states = [...session.states];
        const current = states[session.currentIndex];
        if (current.selectedAnswer !== null) return; // already answered — immutable once set, same as legacy engine
        states[session.currentIndex] = { ...current, selectedAnswer: optionId, answeredAt: Date.now(), timeTaken };
        set({ session: { ...session, states } });
      },

      toggleMarkForReview: () => {
        const session = get().session;
        if (!session) return;
        const states = [...session.states];
        const current = states[session.currentIndex];
        states[session.currentIndex] = { ...current, isMarkedForReview: !current.isMarkedForReview };
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
        if (!session) return;
        set({ session: { ...session, isCompleted: true, completedAt: Date.now(), pausedAt: undefined } });
      },

      clearSession: () => set({ session: null }),
    }),
    { name: 'examverse-universal-session' }
  )
);
