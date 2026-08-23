import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Highlight, HighlightColor, ReadingProgress, ReaderNote, ReadingPrefs } from '../types';
import { highlightsDB, readingProgressDB, readerNotesDB, readerPrefsDB } from '../services/db';

interface ReaderStore {
  // Highlights
  highlights: Highlight[];
  // Reading progress per chapter
  progress: Record<string, ReadingProgress>;
  // Notes
  notes: ReaderNote[];
  // Preferences
  prefs: ReadingPrefs;
  isLoading: boolean;

  loadAll: () => Promise<void>;

  // Highlight actions
  addHighlight: (chapterId: string, text: string, color: HighlightColor, startOffset: number, endOffset: number) => Promise<Highlight>;
  updateHighlightColor: (id: string, color: HighlightColor) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;
  getHighlightsForChapter: (chapterId: string) => Highlight[];

  // Notes actions
  addNote: (chapterId: string, text: string, anchorText: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  getNotesForChapter: (chapterId: string) => ReaderNote[];

  // Progress actions
  loadProgress: (chapterId: string, meta?: { examId?: string; subjectId?: string; chapterName?: string }) => Promise<ReadingProgress>;
  updateProgress: (chapterId: string, patch: Partial<ReadingProgress>) => Promise<void>;
  toggleFavorite: (chapterId: string) => Promise<void>;
  incrementReadingTime: (chapterId: string, seconds: number) => Promise<void>;

  // Prefs actions
  updatePrefs: (patch: Partial<ReadingPrefs>) => Promise<void>;

  // Computed
  getContinueReading: () => ReadingProgress[];
  getFavorites: () => string[];
  getCompletedCount: () => number;
  /** All reading progress for one subject — only returns records that were created with subjectId metadata (native syllabus chapters). Legacy Current Affairs records predate this field and won't appear here even though they're the same underlying data; use getContinueReading()/getFavorites() for those. */
  getProgressForSubject: (subjectId: string) => ReadingProgress[];
}

const DEFAULT_PREFS: ReadingPrefs = {
  fontSize: 17,
  fontFamily: 'serif',
  lineHeight: 1.8,
  maxWidth: 680,
};

export const useReaderStore = create<ReaderStore>((set, get) => ({
  highlights: [],
  progress: {},
  notes: [],
  prefs: DEFAULT_PREFS,
  isLoading: false,

  loadAll: async () => {
    set({ isLoading: true });
    try {
      const [highlights, progressList, notes, prefs] = await Promise.all([
        highlightsDB.getAll(),
        readingProgressDB.getAll(),
        readerNotesDB.getAll(),
        readerPrefsDB.get(),
      ]);
      const progressMap: Record<string, ReadingProgress> = {};
      progressList.forEach((p) => { progressMap[p.chapterId] = p; });
      set({ highlights, progress: progressMap, notes, prefs });
    } finally {
      set({ isLoading: false });
    }
  },

  addHighlight: async (chapterId, text, color, startOffset, endOffset) => {
    const h: Highlight = {
      id: uuidv4(),
      chapterId,
      text,
      color,
      startOffset,
      endOffset,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await highlightsDB.upsert(h);
    set((s) => ({ highlights: [h, ...s.highlights] }));
    return h;
  },

  updateHighlightColor: async (id, color) => {
    const existing = get().highlights.find((h) => h.id === id);
    if (!existing) return;
    const updated = { ...existing, color, updatedAt: Date.now() };
    await highlightsDB.upsert(updated);
    set((s) => ({ highlights: s.highlights.map((h) => (h.id === id ? updated : h)) }));
  },

  removeHighlight: async (id) => {
    await highlightsDB.delete(id);
    set((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) }));
  },

  getHighlightsForChapter: (chapterId) =>
    get().highlights.filter((h) => h.chapterId === chapterId),

  addNote: async (chapterId, text, anchorText) => {
    const n: ReaderNote = {
      id: uuidv4(),
      chapterId,
      text,
      anchorText,
      createdAt: Date.now(),
    };
    await readerNotesDB.upsert(n);
    set((s) => ({ notes: [n, ...s.notes] }));
  },

  removeNote: async (id) => {
    await readerNotesDB.delete(id);
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  getNotesForChapter: (chapterId) =>
    get().notes.filter((n) => n.chapterId === chapterId),

  loadProgress: async (chapterId, meta) => {
    const existing = get().progress[chapterId];
    if (existing) return existing;
    const p = await readingProgressDB.getOrCreate(chapterId, meta);
    set((s) => ({ progress: { ...s.progress, [chapterId]: p } }));
    return p;
  },

  updateProgress: async (chapterId, patch) => {
    const current = get().progress[chapterId] ?? await readingProgressDB.getOrCreate(chapterId);
    const updated: ReadingProgress = { ...current, ...patch, lastReadAt: Date.now() };
    await readingProgressDB.upsert(updated);
    set((s) => ({ progress: { ...s.progress, [chapterId]: updated } }));
  },

  toggleFavorite: async (chapterId) => {
    const updated = await readingProgressDB.toggleFavorite(chapterId);
    set((s) => ({ progress: { ...s.progress, [chapterId]: updated } }));
  },

  incrementReadingTime: async (chapterId, seconds) => {
    const current = get().progress[chapterId] ?? await readingProgressDB.getOrCreate(chapterId);
    const updated: ReadingProgress = {
      ...current,
      timeSpentSeconds: current.timeSpentSeconds + seconds,
      lastReadAt: Date.now(),
      completionStatus: current.completionStatus === 'not_started' ? 'reading' : current.completionStatus,
    };
    await readingProgressDB.upsert(updated);
    set((s) => ({ progress: { ...s.progress, [chapterId]: updated } }));
  },

  updatePrefs: async (patch) => {
    const updated = { ...get().prefs, ...patch };
    set({ prefs: updated });
    await readerPrefsDB.save(updated);
  },

  getContinueReading: () => {
    const all = Object.values(get().progress);
    return all
      .filter((p) => p.completionStatus === 'reading' && p.scrollPercent > 0 && p.scrollPercent < 95)
      .sort((a, b) => b.lastReadAt - a.lastReadAt);
  },

  getFavorites: () =>
    Object.values(get().progress).filter((p) => p.isFavorite).map((p) => p.chapterId),

  getCompletedCount: () =>
    Object.values(get().progress).filter((p) => p.completionStatus === 'completed').length,

  getProgressForSubject: (subjectId) =>
    Object.values(get().progress).filter((p) => p.subjectId === subjectId),
}));
