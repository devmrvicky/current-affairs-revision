import { create } from 'zustand';
import type { ChapterStats } from '../types';
import { chapterStatsDB } from '../services/db';

export interface ChapterAggregate {
  chapterName: string;
  testsAttempted: number;   // distinct test files with at least one attempt
  totalAttempts: number;
  bestScore: number;
  totalCorrect: number;
  totalQuestions: number;
  lastAttemptAt: number;
}

interface ChapterStoreState {
  stats: ChapterStats[];
  isLoading: boolean;
  load: () => Promise<void>;
  recordAttempt: (fileName: string, chapterName: string, score: number, correct: number, total: number) => Promise<void>;
  getByFileName: (fileName: string) => ChapterStats | undefined;
  /** Aggregate stats across every test (relPath) that belongs to a given chapter folder. */
  getAggregateForChapter: (chapterName: string) => ChapterAggregate | undefined;
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

  getAggregateForChapter: (chapterName) => {
    const rows = get().stats.filter((s) => s.chapterName === chapterName);
    if (rows.length === 0) return undefined;
    return {
      chapterName,
      testsAttempted: rows.length,
      totalAttempts: rows.reduce((sum, r) => sum + r.totalAttempts, 0),
      bestScore: Math.max(...rows.map((r) => r.bestScore)),
      totalCorrect: rows.reduce((sum, r) => sum + r.totalCorrect, 0),
      totalQuestions: rows.reduce((sum, r) => sum + r.totalQuestions, 0),
      lastAttemptAt: Math.max(...rows.map((r) => r.lastAttemptAt)),
    };
  },
}));
