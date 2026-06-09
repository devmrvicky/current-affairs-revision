import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { WrongQuestion, QuestionAttempt } from '../types';
import { wrongQuestionsDB } from '../services/db';
import { formatDateKey } from '../utils';

const MASTERY_THRESHOLD = 3; // consecutive correct answers to mark as mastered

interface WrongQuestionsStore {
  questions: WrongQuestion[];
  isLoading: boolean;

  // Load from DB
  load: () => Promise<void>;

  // Ingest wrong answers from a completed quiz attempt
  ingestFromAttempts: (
    attempts: QuestionAttempt[],
    dateKey: string,
    displayDate: string,
    fileName: string
  ) => Promise<void>;

  // Record a revision attempt for a single question
  recordRevisionAttempt: (id: string, isCorrect: boolean) => Promise<void>;

  // Remove a question (e.g. user dismisses it)
  dismiss: (id: string) => Promise<void>;

  // Computed helpers
  getActive: () => WrongQuestion[];
  getMastered: () => WrongQuestion[];
  getSmartQueue: () => WrongQuestion[];
}

export const useWrongQuestionsStore = create<WrongQuestionsStore>((set, get) => ({
  questions: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const questions = await wrongQuestionsDB.getAll();
      set({ questions });
    } finally {
      set({ isLoading: false });
    }
  },

  ingestFromAttempts: async (attempts, dateKey, displayDate, fileName) => {
    const wrongAttempts = attempts.filter(
      (a) => a.status === 'wrong' || a.status === 'unanswered'
    );
    if (wrongAttempts.length === 0) return;

    const existing = get().questions;
    const updates: WrongQuestion[] = [];

    for (const attempt of wrongAttempts) {
      const id = `${dateKey}_${attempt.questionId}`;
      const existingQ = existing.find((q) => q.id === id);

      if (existingQ) {
        // Already tracked — increment wrong count, reset consecutive correct
        const updated: WrongQuestion = {
          ...existingQ,
          wrongCount: existingQ.wrongCount + 1,
          consecutiveCorrect: 0,
          status: 'learning',
          lastAttemptAt: Date.now(),
        };
        await wrongQuestionsDB.upsert(updated);
        updates.push(updated);
      } else {
        // New wrong question
        const wq: WrongQuestion = {
          id,
          questionId: attempt.questionId,
          question: attempt.question,
          options: attempt.options,
          correctAnswer: attempt.correctAnswer,
          explanation: attempt.explanation,
          dateKey,
          displayDate,
          fileName,
          wrongCount: 1,
          consecutiveCorrect: 0,
          status: 'learning',
          lastAttemptAt: Date.now(),
          addedAt: Date.now(),
        };
        await wrongQuestionsDB.upsert(wq);
        updates.push(wq);
      }
    }

    // Merge updates into state
    set((state) => {
      const map = new Map(state.questions.map((q) => [q.id, q]));
      updates.forEach((u) => map.set(u.id, u));
      return { questions: Array.from(map.values()) };
    });
  },

  recordRevisionAttempt: async (id, isCorrect) => {
    const q = get().questions.find((q) => q.id === id);
    if (!q) return;

    const consecutiveCorrect = isCorrect ? q.consecutiveCorrect + 1 : 0;
    const isMastered = consecutiveCorrect >= MASTERY_THRESHOLD;

    const updated: WrongQuestion = {
      ...q,
      consecutiveCorrect,
      status: isMastered ? 'mastered' : 'learning',
      wrongCount: isCorrect ? q.wrongCount : q.wrongCount + 1,
      lastAttemptAt: Date.now(),
    };

    await wrongQuestionsDB.upsert(updated);
    set((state) => ({
      questions: state.questions.map((existing) =>
        existing.id === id ? updated : existing
      ),
    }));
  },

  dismiss: async (id) => {
    await wrongQuestionsDB.delete(id);
    set((state) => ({ questions: state.questions.filter((q) => q.id !== id) }));
  },

  getActive: () => get().questions.filter((q) => q.status === 'learning'),

  getMastered: () => get().questions.filter((q) => q.status === 'mastered'),

  // Smart queue: sort by wrong count desc, then by last attempt asc (least recently tried first)
  getSmartQueue: () => {
    const active = get().questions.filter((q) => q.status === 'learning');
    return [...active].sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return a.lastAttemptAt - b.lastAttemptAt;
    });
  },
}));
