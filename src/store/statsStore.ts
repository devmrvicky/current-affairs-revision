import { create } from 'zustand';
import type { Statistics, Settings } from '../types';
import { statsDB, settingsDB } from '../services/db';

// ─── Statistics Store ─────────────────────────────────────────────────────────

interface StatisticsStore {
  stats: Statistics | null;
  isLoading: boolean;
  load: () => Promise<void>;
}

const defaultStats: Statistics = {
  totalTests: 0,
  totalQuestionsAttempted: 0,
  totalCorrect: 0,
  totalWrong: 0,
  averageAccuracy: 0,
  bestScore: 0,
  worstScore: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalRevisions: 0,
  dailyStats: [],
  lastUpdated: Date.now(),
};

export const useStatisticsStore = create<StatisticsStore>((set) => ({
  stats: null,
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const stats = await statsDB.get();
      set({ stats: stats ?? defaultStats });
    } finally {
      set({ isLoading: false });
    }
  },
}));

// ─── Settings Store ───────────────────────────────────────────────────────────

interface SettingsStore {
  settings: Settings;
  isLoading: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

const defaultSettings: Settings = {
  theme: 'system',
  soundEnabled: false,
  autoSave: true,
  showExplanation: true,
  keyboardNavigation: true,
  fontSize: 'md',
  autoNextSeconds: 0,
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const settings = await settingsDB.get();
      set({ settings });
      applyTheme(settings.theme);
    } finally {
      set({ isLoading: false });
    }
  },

  update: async (patch) => {
    const updated = { ...get().settings, ...patch };
    set({ settings: updated });
    await settingsDB.save(updated);
    if (patch.theme) applyTheme(patch.theme);
  },
}));

export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}
