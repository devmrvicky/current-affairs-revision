import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { SavedTest, Statistics, Settings, WrongQuestion, BookmarkedQuestion, ChapterStats } from '../types';

// ─── Schema ───────────────────────────────────────────────────────────────────

interface AppDB extends DBSchema {
  savedTests: {
    key: string;
    value: SavedTest;
    indexes: { 'by-date': string; 'by-savedAt': number };
  };
  statistics: {
    key: string;
    value: Statistics;
  };
  settings: {
    key: string;
    value: Settings;
  };
  revisionQueue: {
    key: string;
    value: { id: string; questionId: number; testId: string; addedAt: number };
    indexes: { 'by-testId': string };
  };
  wrongQuestions: {
    key: string;
    value: WrongQuestion;
    indexes: { 'by-status': string; 'by-dateKey': string };
  };
  bookmarks: {
    key: string;
    value: BookmarkedQuestion;
    indexes: { 'by-source': string; 'by-bookmarkedAt': number };
  };
  chapterStats: {
    key: string;  // fileName
    value: ChapterStats;
  };
}

const DB_NAME = 'CurrentAffairsDB';
const DB_VERSION = 3; // v2→v3: bookmarks + chapterStats stores

let dbInstance: IDBPDatabase<AppDB> | null = null;

async function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const testStore = db.createObjectStore('savedTests', { keyPath: 'id' });
        testStore.createIndex('by-date', 'date');
        testStore.createIndex('by-savedAt', 'savedAt');
        db.createObjectStore('statistics', { keyPath: 'id' as never });
        db.createObjectStore('settings', { keyPath: 'id' as never });
        const revStore = db.createObjectStore('revisionQueue', { keyPath: 'id' });
        revStore.createIndex('by-testId', 'testId');
      }
      if (oldVersion < 2) {
        const wqStore = db.createObjectStore('wrongQuestions', { keyPath: 'id' });
        wqStore.createIndex('by-status', 'status');
        wqStore.createIndex('by-dateKey', 'dateKey');
      }
      if (oldVersion < 3) {
        const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
        bmStore.createIndex('by-source', 'sourceFileName');
        bmStore.createIndex('by-bookmarkedAt', 'bookmarkedAt');
        db.createObjectStore('chapterStats', { keyPath: 'fileName' });
      }
    },
  });
  return dbInstance;
}

// ─── Saved Tests ──────────────────────────────────────────────────────────────

export const testDB = {
  async save(test: SavedTest): Promise<void> {
    const db = await getDB();
    await db.put('savedTests', test);
  },

  async getAll(): Promise<SavedTest[]> {
    const db = await getDB();
    const all = await db.getAll('savedTests');
    return all.sort((a, b) => b.savedAt - a.savedAt);
  },

  async getById(id: string): Promise<SavedTest | undefined> {
    const db = await getDB();
    return db.get('savedTests', id);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('savedTests', id);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('savedTests');
  },
};

// ─── Statistics ───────────────────────────────────────────────────────────────

const STATS_KEY = 'global';

const defaultStats: Statistics = {
  totalTests: 0,
  totalQuestionsAttempted: 0,
  totalCorrect: 0,
  totalWrong: 0,
  averageAccuracy: 0,
  bestScore: 0,
  worstScore: 100,
  currentStreak: 0,
  longestStreak: 0,
  totalRevisions: 0,
  dailyStats: [],
  lastUpdated: Date.now(),
};

export const statsDB = {
  async get(): Promise<Statistics> {
    const db = await getDB();
    const stats = await db.get('statistics', STATS_KEY as never);
    return (stats as unknown as Statistics) ?? { ...defaultStats };
  },

  async update(updater: (prev: Statistics) => Statistics): Promise<void> {
    const db = await getDB();
    const current = await this.get();
    const updated = updater(current);
    await db.put('statistics', { ...updated, id: STATS_KEY } as never);
  },

  async recalculate(tests: SavedTest[]): Promise<void> {
    const nonRevision = tests.filter((t) => !t.isRevision);
    if (nonRevision.length === 0) {
      await this.update(() => ({ ...defaultStats, lastUpdated: Date.now() }));
      return;
    }

    const totalQ = nonRevision.reduce((s, t) => s + t.totalQuestions, 0);
    const totalC = nonRevision.reduce((s, t) => s + t.correct, 0);
    const totalW = nonRevision.reduce((s, t) => s + t.wrong, 0);
    const scores = nonRevision.map((t) => t.score);
    const revisions = tests.filter((t) => t.isRevision).length;

    // Build daily stats
    const dayMap: Record<string, SavedTest[]> = {};
    nonRevision.forEach((t) => {
      if (!dayMap[t.date]) dayMap[t.date] = [];
      dayMap[t.date].push(t);
    });

    const dailyStats = Object.entries(dayMap).map(([date, ts]) => ({
      date,
      testsAttempted: ts.length,
      totalQuestions: ts.reduce((s, t) => s + t.totalQuestions, 0),
      correct: ts.reduce((s, t) => s + t.correct, 0),
      wrong: ts.reduce((s, t) => s + t.wrong, 0),
      accuracy: Math.round((ts.reduce((s, t) => s + t.accuracy, 0) / ts.length) * 10) / 10,
      avgScore: Math.round((ts.reduce((s, t) => s + t.score, 0) / ts.length) * 10) / 10,
    }));

    // Streaks
    const sortedDates = [...Object.keys(dayMap)].sort();
    let currentStreak = 0, longestStreak = 0, streak = 0;
    const today = new Date().toISOString().split('T')[0];

    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) { streak = 1; continue; }
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      streak = diff === 1 ? streak + 1 : 1;
      if (streak > longestStreak) longestStreak = streak;
    }

    const lastDate = sortedDates[sortedDates.length - 1];
    const todayDiff = lastDate
      ? Math.abs((new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    currentStreak = todayDiff <= 1 ? streak : 0;

    await this.update(() => ({
      totalTests: nonRevision.length,
      totalQuestionsAttempted: totalQ,
      totalCorrect: totalC,
      totalWrong: totalW,
      averageAccuracy: totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0,
      bestScore: Math.max(...scores),
      worstScore: Math.min(...scores),
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      totalRevisions: revisions,
      dailyStats,
      lastUpdated: Date.now(),
    }));
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const defaultSettings: Settings = {
  theme: 'system',
  soundEnabled: false,
  autoSave: true,
  showExplanation: true,
  keyboardNavigation: true,
  fontSize: 'md',
};

export const settingsDB = {
  async get(): Promise<Settings> {
    const db = await getDB();
    const s = await db.get('settings', 'user' as never);
    return (s as unknown as Settings) ?? { ...defaultSettings };
  },

  async save(settings: Settings): Promise<void> {
    const db = await getDB();
    await db.put('settings', { ...settings, id: 'user' } as never);
  },
};

// ─── Wrong Questions ──────────────────────────────────────────────────────────

export const wrongQuestionsDB = {
  async getAll(): Promise<WrongQuestion[]> {
    const db = await getDB();
    return db.getAll('wrongQuestions');
  },

  async getActive(): Promise<WrongQuestion[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('wrongQuestions', 'by-status', 'learning');
    return all.sort((a, b) => b.wrongCount - a.wrongCount);
  },

  async upsert(wq: WrongQuestion): Promise<void> {
    const db = await getDB();
    await db.put('wrongQuestions', wq);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('wrongQuestions', id);
  },

  async getById(id: string): Promise<WrongQuestion | undefined> {
    const db = await getDB();
    return db.get('wrongQuestions', id);
  },

  async count(): Promise<{ total: number; mastered: number; learning: number }> {
    const db = await getDB();
    const all = await db.getAll('wrongQuestions');
    return {
      total: all.length,
      mastered: all.filter((q) => q.status === 'mastered').length,
      learning: all.filter((q) => q.status === 'learning').length,
    };
  },
};

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export const bookmarksDB = {
  async getAll(): Promise<BookmarkedQuestion[]> {
    const db = await getDB();
    const all = await db.getAll('bookmarks');
    return all.sort((a, b) => b.bookmarkedAt - a.bookmarkedAt);
  },

  async upsert(bq: BookmarkedQuestion): Promise<void> {
    const db = await getDB();
    await db.put('bookmarks', bq);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('bookmarks', id);
  },

  async deleteAll(): Promise<void> {
    const db = await getDB();
    await db.clear('bookmarks');
  },

  async getById(id: string): Promise<BookmarkedQuestion | undefined> {
    const db = await getDB();
    return db.get('bookmarks', id);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('bookmarks');
  },
};

// ─── Chapter Stats ────────────────────────────────────────────────────────────

export const chapterStatsDB = {
  async getAll(): Promise<ChapterStats[]> {
    const db = await getDB();
    return db.getAll('chapterStats');
  },

  async getByFileName(fileName: string): Promise<ChapterStats | undefined> {
    const db = await getDB();
    return db.get('chapterStats', fileName);
  },

  async upsert(stats: ChapterStats): Promise<void> {
    const db = await getDB();
    await db.put('chapterStats', stats);
  },

  async recordAttempt(fileName: string, chapterName: string, score: number, correct: number, totalQuestions: number): Promise<void> {
    const existing = await this.getByFileName(fileName);
    const now = Date.now();
    const displayDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    if (existing) {
      const totalAttempts = existing.totalAttempts + 1;
      const avgScore = Math.round(((existing.averageScore * existing.totalAttempts) + score) / totalAttempts);
      await this.upsert({
        ...existing,
        totalAttempts,
        bestScore: Math.max(existing.bestScore, score),
        averageScore: avgScore,
        totalCorrect: existing.totalCorrect + correct,
        totalQuestions: existing.totalQuestions + totalQuestions,
        lastAttemptAt: now,
        lastAttemptDate: displayDate,
      });
    } else {
      await this.upsert({
        fileName,
        chapterName,
        totalAttempts: 1,
        bestScore: score,
        averageScore: score,
        totalCorrect: correct,
        totalQuestions,
        lastAttemptAt: now,
        lastAttemptDate: displayDate,
      });
    }
  },
};
