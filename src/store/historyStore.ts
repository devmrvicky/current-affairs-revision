import { create } from 'zustand';
import type { SavedTest, FilterOptions } from '../types';
import { testDB, statsDB } from '../services/db';

interface HistoryStore {
  tests: SavedTest[];
  isLoading: boolean;
  filters: FilterOptions;

  load: () => Promise<void>;
  save: (test: SavedTest) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setFilters: (f: Partial<FilterOptions>) => void;
  getFiltered: () => SavedTest[];
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  tests: [],
  isLoading: false,
  filters: { search: '', sortBy: 'newest' },

  load: async () => {
    set({ isLoading: true });
    try {
      const tests = await testDB.getAll();
      set({ tests });
    } finally {
      set({ isLoading: false });
    }
  },

  save: async (test) => {
    await testDB.save(test);
    const tests = await testDB.getAll();
    set({ tests });
    await statsDB.recalculate(tests);
  },

  remove: async (id) => {
    await testDB.delete(id);
    const tests = await testDB.getAll();
    set({ tests });
    await statsDB.recalculate(tests);
  },

  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

  getFiltered: () => {
    const { tests, filters } = get();
    let result = [...tests];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (t) => t.displayDate.toLowerCase().includes(q) || t.date.toLowerCase().includes(q)
      );
    }

    switch (filters.sortBy) {
      case 'newest':
        result.sort((a, b) => b.savedAt - a.savedAt);
        break;
      case 'oldest':
        result.sort((a, b) => a.savedAt - b.savedAt);
        break;
      case 'highest':
        result.sort((a, b) => b.score - a.score);
        break;
      case 'lowest':
        result.sort((a, b) => a.score - b.score);
        break;
    }

    return result;
  },
}));
