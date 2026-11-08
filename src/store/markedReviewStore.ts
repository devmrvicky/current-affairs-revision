import { create } from 'zustand';
import type { MarkedReviewQuestion, QuestionAttempt } from '../types';
import { markedForReviewDB } from '../services/db';
import { normalizePurposes, savedPurposes } from '../types/questionMark';

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

  /** Saves (purpose set) or removes (null) one legacy-engine question's Review Center record right away, using the same id the end-of-test sync uses, so the two never duplicate. Resolves to true when a record now exists. */
  saveAttemptMark: (attempt: QuestionAttempt, sourceFileName: string, sourceDate: string, purposes: import('../types/questionMark').MarkPurpose | import('../types/questionMark').MarkPurpose[] | null) => Promise<boolean>;

  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  isMarked: (id: string) => boolean;
  getCount: () => number;
}

export const useMarkedReviewStore = create<MarkedReviewStore>((set, get) => {
  const set_ = set;
  return {
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
    const purposeOf = (a: QuestionAttempt) => a.markPurpose ?? (a.markedForReview ? 'review' : undefined);
    const marked = attempts.filter((a) => purposeOf(a));
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
          purpose: purposeOf(attempt),
        };
        await markedForReviewDB.upsert(mq);
      }
    }

    // Remove un-marked ones from this source
    const unmarkedIds = attempts
      .filter((a) => !purposeOf(a))
      .map((a) => `${sourceFileName}_${a.questionId}`);

    for (const id of unmarkedIds) {
      if (existingIds.has(id)) {
        await markedForReviewDB.delete(id);
      }
    }

    const updated = await markedForReviewDB.getAll();
    set({ items: updated });
  },

  saveAttemptMark: async (attempt, sourceFileName, sourceDate, purposes) => {
    const id = `${sourceFileName}_${attempt.questionId}`;
    // Only the purposes that outlive the test are saved now; 'review' ("revisit before submitting") is saved at test completion like before.
    const set = savedPurposes({ purposes: normalizePurposes(Array.isArray(purposes) ? purposes : purposes ? [purposes] : []) });
    if (set.length === 0) {
      if (await markedForReviewDB.getById(id)) await markedForReviewDB.delete(id);
      set_({ items: await markedForReviewDB.getAll() });
      return false;
    }
    const existing = await markedForReviewDB.getById(id);
    await markedForReviewDB.upsert({
      id,
      questionId: attempt.questionId,
      question: attempt.question,
      options: attempt.options,
      correctAnswer: attempt.correctAnswer,
      explanation: attempt.explanation,
      sourceFileName,
      sourceDate,
      markedAt: existing?.markedAt ?? Date.now(),
      purpose: set[0],
      purposes: set,
    });
    set_({ items: await markedForReviewDB.getAll() });
    return true;
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
};
});
