import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizSession, QuestionAttempt, DailyQuiz } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface QuizStore {
  session: QuizSession | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  startSession: (quiz: DailyQuiz, fileName: string) => void;
  submitAnswer: (selectedAnswer: string, timeTaken: number) => void;
  nextQuestion: () => void;
  goToQuestion: (index: number) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  completeSession: () => void;
  clearSession: () => void;
  toggleBookmark: (questionId: number) => void;
  toggleMarkForReview: (questionId: number) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useQuizStore = create<QuizStore>()(
  persist(
    (set, get) => ({
      session: null,
      isLoading: false,
      error: null,

      startSession: (quiz, fileName) => {
        const attempts: QuestionAttempt[] = quiz.questions.map((q) => ({
          questionId: q.id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          selectedAnswer: null,
          status: 'unanswered',
          timeTaken: 0,
          bookmarked: false,
        }));

        set({
          session: {
            id: uuidv4(),
            date: quiz.date,
            fileName,
            totalQuestions: quiz.questions.length,
            attempts,
            currentIndex: 0,
            startTime: Date.now(),
            totalPausedTime: 0,
            isCompleted: false,
            isPaused: false,
            visitedIndices: [0],
          },
          error: null,
        });
      },

      submitAnswer: (selectedAnswer, timeTaken) => {
        const { session } = get();
        if (!session) return;

        const updated = [...session.attempts];
        const current = updated[session.currentIndex];
        const isCorrect = selectedAnswer === current.correctAnswer;

        updated[session.currentIndex] = {
          ...current,
          selectedAnswer,
          status: isCorrect ? 'correct' : 'wrong',
          timeTaken,
        };

        set({ session: { ...session, attempts: updated } });
      },

      nextQuestion: () => {
        const { session } = get();
        if (!session) return;

        const nextIndex = session.currentIndex + 1;
        if (nextIndex >= session.totalQuestions) {
          set({ session: { ...session, isCompleted: true } });
        } else {
          const visited = session.visitedIndices ?? [];
          set({
            session: {
              ...session,
              currentIndex: nextIndex,
              visitedIndices: visited.includes(nextIndex) ? visited : [...visited, nextIndex],
            },
          });
        }
      },

      goToQuestion: (index) => {
        const { session } = get();
        if (!session) return;
        if (index < 0 || index >= session.totalQuestions) return;
        const visited = session.visitedIndices ?? [];
        set({
          session: {
            ...session,
            currentIndex: index,
            visitedIndices: visited.includes(index) ? visited : [...visited, index],
          },
        });
      },

      pauseSession: () => {
        const { session } = get();
        if (!session) return;
        set({ session: { ...session, isPaused: true, pausedAt: Date.now() } });
      },

      resumeSession: () => {
        const { session } = get();
        if (!session || !session.pausedAt) return;
        const pausedDuration = Date.now() - session.pausedAt;
        set({
          session: {
            ...session,
            isPaused: false,
            pausedAt: undefined,
            totalPausedTime: session.totalPausedTime + pausedDuration,
          },
        });
      },

      completeSession: () => {
        const { session } = get();
        if (!session) return;
        set({ session: { ...session, isCompleted: true } });
      },

      toggleBookmark: (questionId) => {
        const { session } = get();
        if (!session) return;
        const updated = session.attempts.map((a) =>
          a.questionId === questionId ? { ...a, bookmarked: !a.bookmarked } : a
        );
        set({ session: { ...session, attempts: updated } });
      },

      toggleMarkForReview: (questionId) => {
        const { session } = get();
        if (!session) return;
        const updated = session.attempts.map((a) =>
          a.questionId === questionId ? { ...a, markedForReview: !a.markedForReview } : a
        );
        set({ session: { ...session, attempts: updated } });
      },

      clearSession: () => set({ session: null, error: null }),

      setLoading: (v) => set({ isLoading: v }),
      setError: (e) => set({ error: e }),
    }),
    {
      name: 'quiz-session',
      partialize: (s) => ({ session: s.session }),
    }
  )
);
