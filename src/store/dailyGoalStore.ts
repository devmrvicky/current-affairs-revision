import { create } from 'zustand';
import type { DailyGoal } from '../types';
import { dailyGoalDB } from '../services/db';
import { formatDateKey } from '../utils';

interface DailyGoalStore {
  goal: DailyGoal | null;
  isLoading: boolean;

  load: () => Promise<void>;
  increment: (count: number) => Promise<void>;
  setTarget: (target: number) => Promise<void>;

  getProgress: () => number;         // 0-100
  isGoalMet: () => boolean;
  getRemainingToday: () => number;
}

export const useDailyGoalStore = create<DailyGoalStore>((set, get) => ({
  goal: null,
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const dateKey = formatDateKey(new Date());
      const goal = await dailyGoalDB.getOrCreate(dateKey);
      set({ goal });
    } finally {
      set({ isLoading: false });
    }
  },

  increment: async (count) => {
    const dateKey = formatDateKey(new Date());
    const updated = await dailyGoalDB.incrementQuestions(dateKey, count);
    set({ goal: updated });
  },

  setTarget: async (target) => {
    const dateKey = formatDateKey(new Date());
    await dailyGoalDB.setTarget(dateKey, target);
    const updated = await dailyGoalDB.getOrCreate(dateKey);
    set({ goal: updated });
  },

  getProgress: () => {
    const g = get().goal;
    if (!g || g.target === 0) return 0;
    return Math.min(100, Math.round((g.questionsToday / g.target) * 100));
  },

  isGoalMet: () => {
    const g = get().goal;
    return !!g && g.questionsToday >= g.target;
  },

  getRemainingToday: () => {
    const g = get().goal;
    if (!g) return 0;
    return Math.max(0, g.target - g.questionsToday);
  },
}));
