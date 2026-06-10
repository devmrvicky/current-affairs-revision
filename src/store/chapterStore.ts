import { create } from 'zustand';
import type { ChapterStats } from '../types';
import { chapterStatsDB } from '../services/db';

interface ChapterStoreState {
  stats: ChapterStats[];
  isLoading: boolean;
  load: () => Promise<void>;
  recordAttempt: (fileName: string, chapterName: string, score: number, correct: number, total: number) => Promise<void>;
  getByFileName: (fileName: string) => ChapterStats | undefined;
}

export const useChapterStore = create<ChapterStoreState>((set, get) => ({
  stats: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const stats = await chapterStatsDB.getAll();
      set({ stats });
    } finally {
      set({ isLoading: false });
    }
  },

  recordAttempt: async (fileName, chapterName, score, correct, total) => {
    await chapterStatsDB.recordAttempt(fileName, chapterName, score, correct, total);
    const stats = await chapterStatsDB.getAll();
    set({ stats });
  },

  getByFileName: (fileName) => get().stats.find((s) => s.fileName === fileName),
}));
