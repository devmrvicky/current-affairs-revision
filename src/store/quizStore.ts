import { sessionPurpose } from '../types/questionMark';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizSession, QuestionAttempt, DailyQuiz, TestMeta } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { shuffleQuestion } from '../utils';
import type { MarkPurpose } from '../types/questionMark';
import { activateQuiz, suspendQuiz, touchQuiz } from '../services/sessionLifecycle';
import { sessionRegistry, parkInBackground } from '../services/sessionRegistry';
import { captureOrigin, type ReturnOrigin } from '../services/returnRoute';

interface QuizStore {
  session: QuizSession | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  /** An unfinished session already in the store is parked in the registry, never discarded. `origin` (default: the screen the learner is on now) is where Close leads back to. */
  startSession: (quiz: DailyQuiz, fileName: string, testMeta?: TestMeta, origin?: ReturnOrigin) => void;
  /** Loads a previously saved session as the active one (the caller has already removed it from the registry). */
  loadSession: (session: QuizSession) => void;
  /** Sets (or, with null, removes) the mark and its purpose on a question. */
  setMarkPurpose: (questionId: number, purpose: MarkPurpose | null) => void;
  setMarks: (questionId: number, purposes: MarkPurpose[]) => void;
  suspend: (at?: number) => void;
  activate: () => void;
  touch: () => void;
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

      startSession: (quiz, fileName, testMeta, origin = captureOrigin()) => {
        const previous = get().session;
        if (previous && !previous.isCompleted) {
          parkInBackground(sessionRegistry.parkQuiz(suspendQuiz(previous)), 'the previous test');
        }

        // Shuffle once, here, at session creation — the single funnel point
        // for every quiz type (Daily, Chapter, Monthly Magazine, Mixed
        // Revision, Bookmarks practice). The shuffled order then lives
        // inside each QuestionAttempt for the rest of the session: nothing
        // else (next/previous, palette, pause/resume, review) ever calls
        // shuffleQuestion again, so option order stays fixed for the
        // duration of this session and is preserved exactly as-is if the
        // session is persisted and resumed later.
        const attempts: QuestionAttempt[] = quiz.questions.map((q) => {
          const shuffled = shuffleQuestion(q);
          return {
            questionId: shuffled.id,
            question: shuffled.question,
            options: shuffled.options,
            correctAnswer: shuffled.correctAnswer,
            explanation: shuffled.explanation,
            selectedAnswer: null,
            status: 'unanswered',
            timeTaken: 0,
            bookmarked: false,
            universalId: shuffled.universalId,
            subjectId: shuffled.subjectId,
            topicId: shuffled.topicId,
            examId: shuffled.examId,
          };
        });

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
            testMeta,
            lastActiveAt: Date.now(),
            returnRoute: origin.route,
            returnHistoryIdx: origin.idx,
          },
          error: null,
        });
      },

      loadSession: (session) => set({ session, error: null }),

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
        const updated = session.attempts.map((a) => {
          if (a.questionId !== questionId) return a;
          const on = !(a.markPurpose ?? (a.markedForReview ? 'review' : undefined));
          return { ...a, markedForReview: on, markPurpose: on ? ('review' as const) : undefined };
        });
        set({ session: { ...session, attempts: updated } });
      },

      setMarks: (questionId, purposes) => {
        const { session } = get();
        if (!session) return;
        const updated = session.attempts.map((a) =>
          a.questionId === questionId ? { ...a, markPurpose: sessionPurpose(purposes), markedForReview: purposes.includes('review') } : a
        );
        set({ session: { ...session, attempts: updated } });
      },

      setMarkPurpose: (questionId, purpose) => {
        const { session } = get();
        if (!session) return;
        const updated = session.attempts.map((a) =>
          a.questionId === questionId ? { ...a, markPurpose: purpose ?? undefined, markedForReview: purpose === 'review' } : a
        );
        set({ session: { ...session, attempts: updated } });
      },

      suspend: (at) => {
        const { session } = get();
        if (!session) return;
        const next = suspendQuiz(session, at);
        if (next !== session) set({ session: next });
      },

      activate: () => {
        const { session } = get();
        if (!session || session.isCompleted) return;
        set({ session: activateQuiz(session) });
      },

      touch: () => {
        const { session } = get();
        if (!session || session.isCompleted) return;
        set({ session: touchQuiz(session) });
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
