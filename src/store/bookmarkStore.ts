import { create } from 'zustand';
import type { BookmarkedQuestion, QuestionAttempt } from '../types';
import { bookmarksDB } from '../services/db';

interface BookmarkStore {
  bookmarks: BookmarkedQuestion[];
  isLoading: boolean;

  load: () => Promise<void>;

  /** Sync bookmarks from completed session attempts */
  syncFromAttempts: (
    attempts: QuestionAttempt[],
    sourceFileName: string,
    sourceDate: string
  ) => Promise<void>;

  /** Toggle a single bookmark by ID (used from quiz session) */
  toggle: (bq: Omit<BookmarkedQuestion, 'bookmarkedAt'>) => Promise<void>;

  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  isBookmarked: (id: string) => boolean;
  getCount: () => number;

  /** Build a DailyQuiz-compatible structure from bookmarks for revision */
  toQuizQuestions: () => { id: number; question: string; options: string[]; correctAnswer: string; explanation: string }[];
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarks: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const bookmarks = await bookmarksDB.getAll();
      set({ bookmarks });
    } finally {
      set({ isLoading: false });
    }
  },

  syncFromAttempts: async (attempts, sourceFileName, sourceDate) => {
    const bookmarkedAttempts = attempts.filter((a) => a.bookmarked);
    const existing = get().bookmarks;
    const existingIds = new Set(existing.map((b) => b.id));

    // Add newly bookmarked
    for (const attempt of bookmarkedAttempts) {
      const id = `${sourceFileName}_${attempt.questionId}`;
      if (!existingIds.has(id)) {
        const bq: BookmarkedQuestion = {
          id,
          questionId: attempt.questionId,
          question: attempt.question,
          options: attempt.options,
          correctAnswer: attempt.correctAnswer,
          explanation: attempt.explanation,
          sourceFileName,
          sourceDate,
          bookmarkedAt: Date.now(),
        };
        await bookmarksDB.upsert(bq);
      }
    }

    // Remove un-bookmarked ones from this source
    const unbookmarkedIds = attempts
      .filter((a) => !a.bookmarked)
      .map((a) => `${sourceFileName}_${a.questionId}`);

    for (const id of unbookmarkedIds) {
      if (existingIds.has(id)) {
        await bookmarksDB.delete(id);
      }
    }

    const updated = await bookmarksDB.getAll();
    set({ bookmarks: updated });
  },

  toggle: async (bqData) => {
    const existing = get().bookmarks.find((b) => b.id === bqData.id);
    if (existing) {
      await bookmarksDB.delete(bqData.id);
      set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== bqData.id) }));
    } else {
      const bq: BookmarkedQuestion = { ...bqData, bookmarkedAt: Date.now() };
      await bookmarksDB.upsert(bq);
      set((s) => ({ bookmarks: [bq, ...s.bookmarks] }));
    }
  },

  remove: async (id) => {
    await bookmarksDB.delete(id);
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
  },

  clearAll: async () => {
    await bookmarksDB.deleteAll();
    set({ bookmarks: [] });
  },

  isBookmarked: (id) => get().bookmarks.some((b) => b.id === id),

  getCount: () => get().bookmarks.length,

  toQuizQuestions: () =>
    get().bookmarks.map((b, i) => ({
      id: i + 1,
      question: b.question,
      options: b.options,
      correctAnswer: b.correctAnswer,
      explanation: b.explanation,
    })),
}));
