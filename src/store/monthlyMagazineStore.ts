import { create } from 'zustand';
import type { MonthlyMagazineIssue } from '../types';
import { getMonthlyMagazineIssues } from '../services/monthlyMagazineRepository';
import { readingProgressDB, chapterStatsDB } from '../services/db';

/** The reader/progress key namespace used for Monthly Magazine issues in the
 * generic (chapter-agnostic) readingProgress/highlights/notes stores — keeps
 * these entries from ever colliding with a Chapter's chapterId. */
export function issueReaderKey(issueKey: string): string {
  return `monthly:${issueKey}`;
}

/** Per-part key, e.g. "monthly:2025/July#part:0" — reuses the exact same
 * readingProgress store as issueReaderKey, just scoped to one markdown Part,
 * so "N of M sections completed" can be tracked distinctly from the overall
 * issue-level scroll progress (which is a Reading Mode concept, not a
 * per-part one). No new table, no migration — same generic string key. */
export function partReaderKey(issueKey: string, partIndex: number): string {
  return `monthly:${issueKey}#part:${partIndex}`;
}

export interface MonthlyMagazineCard {
  issue: MonthlyMagazineIssue;
  /** 0–100, based on reading progress (scrollPercent) across all parts read so far. */
  readPercent: number;
  totalSections: number;
  completedSections: number;
  totalTests: number;
  completedTests: number;
  /** True once the user has attempted every test in the issue. */
  allTestsCompleted: boolean;
  /** User's manual override — coexists with, doesn't replace, the calculated fields above. */
  manuallyCompleted: boolean;
  lastOpenedAt: number | null;
}

interface MonthlyMagazineStoreState {
  cards: MonthlyMagazineCard[];
  isLoading: boolean;
  load: () => Promise<void>;
  toggleManualCompletion: (issueKey: string) => Promise<void>;
  recordOpened: (issueKey: string) => Promise<void>;
  refreshCard: (issueKey: string) => Promise<void>;
}

async function buildCard(issue: MonthlyMagazineIssue): Promise<MonthlyMagazineCard> {
  const readerKey = issueReaderKey(issue.issueKey);
  const [progress, allStats, allPartProgress] = await Promise.all([
    readingProgressDB.getByChapter(readerKey),
    Promise.all(issue.tests.map((t) => chapterStatsDB.getByFileName(t.relPath))),
    Promise.all(issue.parts.map((_, i) => readingProgressDB.getByChapter(partReaderKey(issue.issueKey, i)))),
  ]);

  const completedTests = allStats.filter((s) => s !== undefined).length;
  const completedSections = allPartProgress.filter((p) => p?.completionStatus === 'completed').length;

  return {
    issue,
    readPercent: progress?.scrollPercent ?? 0,
    totalSections: issue.parts.length,
    completedSections,
    totalTests: issue.tests.length,
    completedTests,
    allTestsCompleted: issue.tests.length > 0 && completedTests >= issue.tests.length,
    manuallyCompleted: progress?.manuallyCompleted ?? false,
    lastOpenedAt: progress?.lastReadAt ?? null,
  };
}

export const useMonthlyMagazineStore = create<MonthlyMagazineStoreState>((set) => ({
  cards: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const issues = getMonthlyMagazineIssues();
      const cards = await Promise.all(issues.map(buildCard));
      set({ cards });
    } finally {
      set({ isLoading: false });
    }
  },

  toggleManualCompletion: async (issueKey) => {
    const readerKey = issueReaderKey(issueKey);
    const current = await readingProgressDB.getOrCreate(readerKey);
    const updated = { ...current, manuallyCompleted: !current.manuallyCompleted };
    await readingProgressDB.upsert(updated);
    set((s) => ({
      cards: s.cards.map((c) =>
        c.issue.issueKey === issueKey ? { ...c, manuallyCompleted: updated.manuallyCompleted } : c
      ),
    }));
  },

  recordOpened: async (issueKey) => {
    const readerKey = issueReaderKey(issueKey);
    const current = await readingProgressDB.getOrCreate(readerKey);
    const updated = { ...current, lastReadAt: Date.now() };
    await readingProgressDB.upsert(updated);
    set((s) => ({
      cards: s.cards.map((c) =>
        c.issue.issueKey === issueKey ? { ...c, lastOpenedAt: updated.lastReadAt } : c
      ),
    }));
  },

  refreshCard: async (issueKey) => {
    const issues = getMonthlyMagazineIssues();
    const issue = issues.find((i) => i.issueKey === issueKey);
    if (!issue) return;
    const fresh = await buildCard(issue);
    set((s) => ({
      cards: s.cards.some((c) => c.issue.issueKey === issueKey)
        ? s.cards.map((c) => (c.issue.issueKey === issueKey ? fresh : c))
        : [...s.cards, fresh],
    }));
  },
}));
