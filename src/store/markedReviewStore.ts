import { create } from 'zustand';
import type { MarkedReviewQuestion, QuestionAttempt } from '../types';
import { markedForReviewDB } from '../services/db';

interface MarkedReviewStore {
  items: MarkedReviewQuestion[];
  isLoading: boolean;

  load: () => Promise<void>;

  /** Sync marked-for-review questions from completed session attempts */
  syncFromAttempts: (
    attempts: QuestionAttempt[],
    sourceFileName: string,
    sourceDate: string
  ) => Promise<void>;

  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  isMarked: (id: string) => boolean;
  getCount: () => number;
}

export const useMarkedReviewStore = create<MarkedReviewStore>((set, get) => ({
  items: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const items = await markedForReviewDB.getAll();
      set({ items });
    } finally {
      set({ isLoading: false });
    }
  },

  syncFromAttempts: async (attempts, sourceFileName, sourceDate) => {
    const marked = attempts.filter((a) => a.markedForReview);
    const existing = get().items;
    const existingIds = new Set(existing.map((m) => m.id));

    // Add newly marked
    for (const attempt of marked) {
      const id = `${sourceFileName}_${attempt.questionId}`;
      if (!existingIds.has(id)) {
        const mq: MarkedReviewQuestion = {
          id,
          questionId: attempt.questionId,
          question: attempt.question,
          options: attempt.options,
          correctAnswer: attempt.correctAnswer,
          explanation: attempt.explanation,
          sourceFileName,
          sourceDate,
          markedAt: Date.now(),
        };
        await markedForReviewDB.upsert(mq);
      }
    }

    // Remove un-marked ones from this source
    const unmarkedIds = attempts
      .filter((a) => !a.markedForReview)
      .map((a) => `${sourceFileName}_${a.questionId}`);

    for (const id of unmarkedIds) {
      if (existingIds.has(id)) {
        await markedForReviewDB.delete(id);
      }
    }

    const updated = await markedForReviewDB.getAll();
    set({ items: updated });
  },

  remove: async (id) => {
    await markedForReviewDB.delete(id);
    set((s) => ({ items: s.items.filter((m) => m.id !== id) }));
  },

  clearAll: async () => {
    await markedForReviewDB.deleteAll();
    set({ items: [] });
  },

  isMarked: (id) => get().items.some((m) => m.id === id),

  getCount: () => get().items.length,
}));
