import { create } from 'zustand';
import type { DailyGoal, DailyGoalType } from '../types';
import { dailyGoalDB } from '../services/db';
import { formatDateKey } from '../utils';

interface DailyGoalStore {
  goal: DailyGoal | null;
  isLoading: boolean;

  load: () => Promise<void>;
  increment: (count: number) => Promise<void>;
  incrementTests: (count?: number) => Promise<void>;
  setTarget: (target: number) => Promise<void>;
  /** User explicitly changes what they track and/or the target — never called automatically. */
  setGoal: (type: DailyGoalType, target: number) => Promise<void>;

  getProgress: () => number;         // 0-100
  isGoalMet: () => boolean;
  getRemainingToday: () => number;
  /** Current progress value in the goal's own unit (questions answered or tests completed today). */
  getCurrentValue: () => number;
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

  incrementTests: async (count = 1) => {
    const dateKey = formatDateKey(new Date());
    const updated = await dailyGoalDB.incrementTests(dateKey, count);
    set({ goal: updated });
  },

  setTarget: async (target) => {
    const dateKey = formatDateKey(new Date());
    await dailyGoalDB.setTarget(dateKey, target);
    const updated = await dailyGoalDB.getOrCreate(dateKey);
    set({ goal: updated });
  },

  setGoal: async (type, target) => {
    const dateKey = formatDateKey(new Date());
    const updated = await dailyGoalDB.setGoal(dateKey, type, target);
    set({ goal: updated });
  },

  getCurrentValue: () => {
    const g = get().goal;
    if (!g) return 0;
    return g.type === 'tests' ? g.testsToday : g.questionsToday;
  },

  getProgress: () => {
    const g = get().goal;
    if (!g || g.target === 0) return 0;
    return Math.min(100, Math.round((get().getCurrentValue() / g.target) * 100));
  },

  isGoalMet: () => {
    const g = get().goal;
    return !!g && get().getCurrentValue() >= g.target;
  },

  getRemainingToday: () => {
    const g = get().goal;
    if (!g) return 0;
    return Math.max(0, g.target - get().getCurrentValue());
  },
}));
