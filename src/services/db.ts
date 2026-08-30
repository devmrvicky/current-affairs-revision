import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import type { SavedTest, Statistics, Settings, WrongQuestion, BookmarkedQuestion, MarkedReviewQuestion, ChapterStats, DailyGoal, NotificationSettings, NotificationCategorySettings, Highlight, ReadingProgress, ReaderNote, ReadingPrefs, AiSummaryCacheEntry } from '../types';
import type { MockAttemptRecord } from '../types/mockSession';

// ─── Sync types ───────────────────────────────────────────────────────────────
// Local store name → remote (Supabase) table name. Kept distinct on purpose so
// the local schema and remote schema can evolve independently.
export type SyncTable = 'saved_tests' | 'bookmarks' | 'wrong_questions' | 'marked_for_review' | 'settings';
export type SyncOp = 'upsert' | 'delete' | 'clear';

export interface SyncOutboxEntry {
  id: string;          // uuid, unique per queued operation
  table: SyncTable;
  op: SyncOp;
  payload: unknown;    // the record itself for upsert; the record id for delete; unused for clear
  createdAt: number;
}

export interface SyncMeta {
  id: 'meta';
  deviceId: string;
  userId: string | null;
  lastSyncedAt: number; // server timestamp watermark for pull
}

// ─── Universal attempt ledger (ExamVerse) ─────────────────────────────────────
// One record per answered/skipped question, tagged with universal
// exam/subject/topic identity when known. Powers "Unattempted Questions" and
// cross-content Weak Topics in the Review Center. Immutable content (the
// question bank) lives in src/data/*; this is purely user state, consistent
// with the app's existing content/user-data separation.

export interface UniversalAttemptRecord {
  id: string; // uuid, one per attempt
  /** Exact id in the universal question pool — present whenever we can determine it (daily, chapter-wise, and anything from the Practice/Test Configurator). Absent for content not yet in the universal pool (e.g. Monthly Magazine). */
  universalQuestionId?: string;
  examId: string;
  subjectId: string;
  topicId?: string;
  isCorrect: boolean;
  wasAnswered: boolean;
  timeTaken: number;
  attemptedAt: number;
  sessionId: string;
  sourceFileName: string;
  /** Present when the session came from a specific PracticeTestDefinition (a named test/mock card, not free-form Quick Practice) — powers per-test "Attempted N times, Best M/Q" stats generically across every subject (product-refactor §89-90). */
  testDefinitionId?: string;
}

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
  markedForReview: {
    key: string;
    value: MarkedReviewQuestion;
    indexes: { 'by-source': string; 'by-markedAt': number };
  };
  chapterStats: {
    key: string;
    value: ChapterStats;
  };
  dailyGoal: {
    key: string;
    value: DailyGoal;
  };
  notificationSettings: {
    key: string;
    value: NotificationSettings;
  };
  highlights: {
    key: string;
    value: Highlight;
    indexes: { 'by-chapter': string; 'by-createdAt': number };
  };
  readingProgress: {
    key: string;
    value: ReadingProgress;
  };
  readerNotes: {
    key: string;
    value: ReaderNote;
    indexes: { 'by-chapter': string };
  };
  readerPrefs: {
    key: string;
    value: ReadingPrefs;
  };
  syncOutbox: {
    key: string;
    value: SyncOutboxEntry;
    indexes: { 'by-createdAt': number };
  };
  syncMeta: {
    key: string;
    value: SyncMeta;
  };
  aiSummaries: {
    key: string;
    value: AiSummaryCacheEntry;
  };
  universalAttempts: {
    key: string;
    value: UniversalAttemptRecord;
    indexes: { 'by-universalQuestionId': string; 'by-examId': string; 'by-topicId': string; 'by-attemptedAt': number };
  };
  mockAttempts: {
    key: string;
    value: MockAttemptRecord;
    indexes: { 'by-mockDefinitionId': string; 'by-completedAt': number };
  };
}

const DB_NAME = 'CurrentAffairsDB';
const DB_VERSION = 10;

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
      if (oldVersion < 4) {
        db.createObjectStore('dailyGoal', { keyPath: 'dateKey' });
        db.createObjectStore('notificationSettings', { keyPath: 'id' as never });
      }
      if (oldVersion < 5) {
        const hlStore = db.createObjectStore('highlights', { keyPath: 'id' });
        hlStore.createIndex('by-chapter', 'chapterId');
        hlStore.createIndex('by-createdAt', 'createdAt');
        db.createObjectStore('readingProgress', { keyPath: 'chapterId' });
        const notesStore = db.createObjectStore('readerNotes', { keyPath: 'id' });
        notesStore.createIndex('by-chapter', 'chapterId');
        db.createObjectStore('readerPrefs', { keyPath: 'id' as never });
      }
      if (oldVersion < 6) {
        const mfrStore = db.createObjectStore('markedForReview', { keyPath: 'id' });
        mfrStore.createIndex('by-source', 'sourceFileName');
        mfrStore.createIndex('by-markedAt', 'markedAt');
      }
      if (oldVersion < 7) {
        const outboxStore = db.createObjectStore('syncOutbox', { keyPath: 'id' });
        outboxStore.createIndex('by-createdAt', 'createdAt');
        db.createObjectStore('syncMeta', { keyPath: 'id' as never });
      }
      if (oldVersion < 8) {
        db.createObjectStore('aiSummaries', { keyPath: 'contentKey' });
      }
      if (oldVersion < 9) {
        const uaStore = db.createObjectStore('universalAttempts', { keyPath: 'id' });
        uaStore.createIndex('by-universalQuestionId', 'universalQuestionId');
        uaStore.createIndex('by-examId', 'examId');
        uaStore.createIndex('by-topicId', 'topicId');
        uaStore.createIndex('by-attemptedAt', 'attemptedAt');
      }
      if (oldVersion < 10) {
        const maStore = db.createObjectStore('mockAttempts', { keyPath: 'id' });
        maStore.createIndex('by-mockDefinitionId', 'mockDefinitionId');
        maStore.createIndex('by-completedAt', 'completedAt');
      }
    },
  });
  return dbInstance;
}

// ─── Sync outbox ──────────────────────────────────────────────────────────────
// Every locally-synced table (saved_tests, bookmarks, wrong_questions,
// marked_for_review, settings) enqueues its writes here. syncService.ts drains
// this queue to Supabase when online. When *applying* data pulled down from
// the server back into IndexedDB, withSyncSuppressed() prevents that write
// from re-enqueueing itself (which would otherwise loop forever).

let _syncSuppressed = false;

export async function withSyncSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  _syncSuppressed = true;
  try {
    return await fn();
  } finally {
    _syncSuppressed = false;
  }
}

async function enqueueSync(table: SyncTable, op: SyncOp, payload: unknown): Promise<void> {
  if (_syncSuppressed) return;
  const db = await getDB();
  const entry: SyncOutboxEntry = {
    id: uuidv4(),
    table,
    op,
    payload,
    createdAt: Date.now(),
  };
  await db.put('syncOutbox', entry);
}

export const syncOutboxDB = {
  async getAll(): Promise<SyncOutboxEntry[]> {
    const db = await getDB();
    const all = await db.getAll('syncOutbox');
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  async deleteMany(ids: string[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('syncOutbox', 'readwrite');
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('syncOutbox');
  },
};

export const syncMetaDB = {
  async get(): Promise<SyncMeta> {
    const db = await getDB();
    const m = await db.get('syncMeta', 'meta' as never);
    return m ?? { id: 'meta', deviceId: '', userId: null, lastSyncedAt: 0 };
  },

  async save(meta: SyncMeta): Promise<void> {
    const db = await getDB();
    await db.put('syncMeta', meta);
  },
};

// ─── Saved Tests ──────────────────────────────────────────────────────────────

export const testDB = {
  async save(test: SavedTest): Promise<void> {
    const db = await getDB();
    await db.put('savedTests', test);
    await enqueueSync('saved_tests', 'upsert', test);
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
    await enqueueSync('saved_tests', 'delete', id);
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
  autoNextSeconds: 0,
  hapticEnabled: true,
};

export const settingsDB = {
  async get(): Promise<Settings> {
    const db = await getDB();
    const s = await db.get('settings', 'user' as never);
    // Merge with defaults so settings saved before a new field was added
    // (e.g. autoNextSeconds) don't end up undefined.
    return { ...defaultSettings, ...((s as unknown as Settings) ?? {}) };
  },

  async save(settings: Settings): Promise<void> {
    const db = await getDB();
    await db.put('settings', { ...settings, id: 'user' } as never);
    await enqueueSync('settings', 'upsert', settings);
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
    await enqueueSync('wrong_questions', 'upsert', wq);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('wrongQuestions', id);
    await enqueueSync('wrong_questions', 'delete', id);
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
    await enqueueSync('bookmarks', 'upsert', bq);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('bookmarks', id);
    await enqueueSync('bookmarks', 'delete', id);
  },

  async deleteAll(): Promise<void> {
    const db = await getDB();
    await db.clear('bookmarks');
    await enqueueSync('bookmarks', 'clear', null);
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

// ─── Marked For Review ─────────────────────────────────────────────────────────

export const markedForReviewDB = {
  async getAll(): Promise<MarkedReviewQuestion[]> {
    const db = await getDB();
    const all = await db.getAll('markedForReview');
    return all.sort((a, b) => b.markedAt - a.markedAt);
  },

  async upsert(mq: MarkedReviewQuestion): Promise<void> {
    const db = await getDB();
    await db.put('markedForReview', mq);
    await enqueueSync('marked_for_review', 'upsert', mq);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('markedForReview', id);
    await enqueueSync('marked_for_review', 'delete', id);
  },

  async deleteAll(): Promise<void> {
    const db = await getDB();
    await db.clear('markedForReview');
    await enqueueSync('marked_for_review', 'clear', null);
  },

  async getById(id: string): Promise<MarkedReviewQuestion | undefined> {
    const db = await getDB();
    return db.get('markedForReview', id);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('markedForReview');
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

// ─── Daily Goal ───────────────────────────────────────────────────────────────

const DEFAULT_GOAL_TARGET = 25;

export const dailyGoalDB = {
  async get(dateKey: string): Promise<DailyGoal | undefined> {
    const db = await getDB();
    return db.get('dailyGoal', dateKey);
  },

  async getOrCreate(dateKey: string): Promise<DailyGoal> {
    const existing = await this.get(dateKey);
    if (existing) {
      // Backward compatibility: records created before goal types existed
      // won't have `type`/`testsToday` — default them without losing the
      // user's existing target/streak (Phase-product-refactor §11, §95).
      if (existing.type && existing.testsToday !== undefined) return existing;
      const migrated: DailyGoal = { ...existing, type: existing.type ?? 'questions', testsToday: existing.testsToday ?? 0 };
      const db = await getDB();
      await db.put('dailyGoal', migrated);
      return migrated;
    }
    const [y, m, d] = dateKey.split('-').map(Number);
    const yesterday = new Date(y, (m || 1) - 1, (d || 1) - 1); // local-date arithmetic, no UTC parsing
    const ydKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    const yd = await this.get(ydKey);
    const ydMet = yd ? (yd.type === 'tests' ? yd.testsToday >= yd.target : yd.questionsToday >= yd.target) : false;
    const streakDays = yd && ydMet ? yd.streakDays : 0;
    const bestStreakDays = yd ? Math.max(yd.bestStreakDays, streakDays) : 0;
    const fresh: DailyGoal = {
      type: yd?.type ?? 'questions', // carry the user's chosen type forward day to day — never silently reset it
      target: yd?.target ?? DEFAULT_GOAL_TARGET,
      questionsToday: 0,
      testsToday: 0,
      dateKey,
      streakDays,
      bestStreakDays,
      lastGoalMetDate: yd?.lastGoalMetDate ?? '',
    };
    const db = await getDB();
    await db.put('dailyGoal', fresh);
    return fresh;
  },

  /** User explicitly changes what they're tracking and/or the target. Never called automatically (Phase §94: no silent goal changes). */
  async setGoal(dateKey: string, type: DailyGoal['type'], target: number): Promise<DailyGoal> {
    const goal = await this.getOrCreate(dateKey);
    const updated: DailyGoal = { ...goal, type, target };
    const db = await getDB();
    await db.put('dailyGoal', updated);
    return updated;
  },

  async incrementTests(dateKey: string, count = 1): Promise<DailyGoal> {
    const goal = await this.getOrCreate(dateKey);
    const wasMetBefore = goal.type === 'tests' && goal.testsToday >= goal.target;
    const updated: DailyGoal = { ...goal, testsToday: goal.testsToday + count };
    const nowMet = updated.type === 'tests' && updated.testsToday >= updated.target;
    if (nowMet && !wasMetBefore) {
      updated.streakDays = goal.streakDays + 1;
      updated.bestStreakDays = Math.max(goal.bestStreakDays, updated.streakDays);
      updated.lastGoalMetDate = dateKey;
    }
    const db = await getDB();
    await db.put('dailyGoal', updated);
    return updated;
  },

  async incrementQuestions(dateKey: string, count: number): Promise<DailyGoal> {
    const goal = await this.getOrCreate(dateKey);
    const wasMetBefore = goal.type === 'questions' && goal.questionsToday >= goal.target;
    const updated: DailyGoal = { ...goal, questionsToday: goal.questionsToday + count };
    const nowMet = updated.type === 'questions' && updated.questionsToday >= updated.target;
    if (nowMet && !wasMetBefore) {
      updated.streakDays = goal.streakDays + 1;
      updated.bestStreakDays = Math.max(goal.bestStreakDays, updated.streakDays);
      updated.lastGoalMetDate = dateKey;
    }
    const db = await getDB();
    await db.put('dailyGoal', updated);
    return updated;
  },

  async setTarget(dateKey: string, target: number): Promise<void> {
    const goal = await this.getOrCreate(dateKey);
    const db = await getDB();
    await db.put('dailyGoal', { ...goal, target });
  },
};

// ─── Notification Settings ────────────────────────────────────────────────────

const DEFAULT_NOTIFICATION_CATEGORIES: NotificationSettings['categories'] = {
  dailyRevisionReminder: true,
  dailyQuizReminder: true,
  studyStreak: true,
  weeklyProgress: true,
  revisionTargetCompleted: true,
  chapterCompleted: true,
  testCompleted: false, // off by default — fires right after the user already sees their result on-screen
  wrongQuestionReview: true,
  newChapterAdded: true,
  continueReadingReminder: true,
  incompleteTestReminder: true,
  resumePreviousTest: true,
  achievementUnlocked: true,
  monthlySummary: true,
  missedRevision: true,
  longTimeNoStudy: true,
};

function defaultNotificationSettings(): NotificationSettings {
  return {
    enabled: false,
    categories: { ...DEFAULT_NOTIFICATION_CATEGORIES },
    reminderTime: '09:00',
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    soundEnabled: true,
    vibrationEnabled: true,
    deviceId: uuidv4(),
  };
}

/**
 * Migrates whatever shape happens to be stored (including the older 6-field
 * version of this settings object, or nothing at all) into the current
 * 16-category shape, preserving every choice the user already made instead
 * of silently resetting them.
 */
function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const fallback = defaultNotificationSettings();
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;

  // Old shape (pre-v10): dailyReminderEnabled, dailyReminderTime, streakReminderEnabled, weeklyReportEnabled
  const legacyDaily = typeof r.dailyReminderEnabled === 'boolean' ? r.dailyReminderEnabled : undefined;
  const legacyStreak = typeof r.streakReminderEnabled === 'boolean' ? r.streakReminderEnabled : undefined;
  const legacyWeekly = typeof r.weeklyReportEnabled === 'boolean' ? r.weeklyReportEnabled : undefined;

  const existingCategories = (r.categories && typeof r.categories === 'object') ? r.categories as Record<string, boolean> : {};
  const categories: NotificationCategorySettings = { ...DEFAULT_NOTIFICATION_CATEGORIES };
  for (const key of Object.keys(categories) as (keyof NotificationCategorySettings)[]) {
    if (typeof existingCategories[key] === 'boolean') categories[key] = existingCategories[key];
  }
  // Fold legacy flags in wherever the new category hasn't been explicitly set yet
  if (legacyDaily !== undefined && existingCategories.dailyRevisionReminder === undefined) {
    categories.dailyRevisionReminder = legacyDaily;
    categories.dailyQuizReminder = legacyDaily;
  }
  if (legacyStreak !== undefined && existingCategories.studyStreak === undefined) categories.studyStreak = legacyStreak;
  if (legacyWeekly !== undefined && existingCategories.weeklyProgress === undefined) categories.weeklyProgress = legacyWeekly;

  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : fallback.enabled,
    categories,
    reminderTime: typeof r.reminderTime === 'string' ? r.reminderTime
      : (typeof r.dailyReminderTime === 'string' ? r.dailyReminderTime : fallback.reminderTime),
    quietHoursEnabled: typeof r.quietHoursEnabled === 'boolean' ? r.quietHoursEnabled : fallback.quietHoursEnabled,
    quietHoursStart: typeof r.quietHoursStart === 'string' ? r.quietHoursStart : fallback.quietHoursStart,
    quietHoursEnd: typeof r.quietHoursEnd === 'string' ? r.quietHoursEnd : fallback.quietHoursEnd,
    soundEnabled: typeof r.soundEnabled === 'boolean' ? r.soundEnabled : fallback.soundEnabled,
    vibrationEnabled: typeof r.vibrationEnabled === 'boolean' ? r.vibrationEnabled : fallback.vibrationEnabled,
    deviceId: typeof r.deviceId === 'string' && r.deviceId ? r.deviceId : fallback.deviceId,
    fcmToken: typeof r.fcmToken === 'string' ? r.fcmToken : undefined,
    pushEndpoint: typeof r.pushEndpoint === 'string' ? r.pushEndpoint : undefined,
  };
}

export const notificationSettingsDB = {
  async get(): Promise<NotificationSettings> {
    const db = await getDB();
    const s = await db.get('notificationSettings', 'user' as never);
    const normalized = normalizeNotificationSettings(s);
    // Persist the migration once so the device id (and any folded-in legacy
    // flags) are stable from here on, rather than re-migrating every read.
    if (!s || (s as { deviceId?: string }).deviceId !== normalized.deviceId) {
      await db.put('notificationSettings', { ...normalized, id: 'user' } as never);
    }
    return normalized;
  },

  async save(settings: NotificationSettings): Promise<void> {
    const db = await getDB();
    await db.put('notificationSettings', { ...settings, id: 'user' } as never);
  },
};

// ─── Highlights ───────────────────────────────────────────────────────────────

export const highlightsDB = {
  async getAll(): Promise<Highlight[]> {
    const db = await getDB();
    const all = await db.getAll('highlights');
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },

  async getByChapter(chapterId: string): Promise<Highlight[]> {
    const db = await getDB();
    return db.getAllFromIndex('highlights', 'by-chapter', chapterId);
  },

  async upsert(h: Highlight): Promise<void> {
    const db = await getDB();
    await db.put('highlights', h);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('highlights', id);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('highlights');
  },
};

// ─── Reading Progress ─────────────────────────────────────────────────────────

export const readingProgressDB = {
  async getAll(): Promise<ReadingProgress[]> {
    const db = await getDB();
    return db.getAll('readingProgress');
  },

  async getByChapter(chapterId: string): Promise<ReadingProgress | undefined> {
    const db = await getDB();
    return db.get('readingProgress', chapterId);
  },

  async upsert(p: ReadingProgress): Promise<void> {
    const db = await getDB();
    await db.put('readingProgress', p);
  },

  async getOrCreate(chapterId: string, meta?: { examId?: string; subjectId?: string; chapterName?: string }): Promise<ReadingProgress> {
    const existing = await this.getByChapter(chapterId);
    if (existing) return existing;
    const fresh: ReadingProgress = {
      chapterId,
      scrollPercent: 0,
      scrollY: 0,
      timeSpentSeconds: 0,
      lastReadAt: Date.now(),
      completionStatus: 'not_started',
      isFavorite: false,
      ...meta,
    };
    await this.upsert(fresh);
    return fresh;
  },

  async toggleFavorite(chapterId: string): Promise<ReadingProgress> {
    const p = await this.getOrCreate(chapterId);
    const updated = { ...p, isFavorite: !p.isFavorite };
    await this.upsert(updated);
    return updated;
  },
};

// ─── Reader Notes ─────────────────────────────────────────────────────────────

export const readerNotesDB = {
  async getAll(): Promise<ReaderNote[]> {
    const db = await getDB();
    const all = await db.getAll('readerNotes');
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },

  async getByChapter(chapterId: string): Promise<ReaderNote[]> {
    const db = await getDB();
    return db.getAllFromIndex('readerNotes', 'by-chapter', chapterId);
  },

  async upsert(n: ReaderNote): Promise<void> {
    const db = await getDB();
    await db.put('readerNotes', n);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('readerNotes', id);
  },
};

// ─── Reader Preferences ───────────────────────────────────────────────────────

const DEFAULT_READER_PREFS: ReadingPrefs = {
  fontSize: 17,
  fontFamily: 'serif',
  lineHeight: 1.8,
  maxWidth: 680,
};

export const readerPrefsDB = {
  async get(): Promise<ReadingPrefs> {
    const db = await getDB();
    const p = await db.get('readerPrefs', 'user' as never);
    return (p as unknown as ReadingPrefs) ?? { ...DEFAULT_READER_PREFS };
  },

  async save(prefs: ReadingPrefs): Promise<void> {
    const db = await getDB();
    await db.put('readerPrefs', { ...prefs, id: 'user' } as never);
  },
};

// ─── AI Summary cache ───────────────────────────────────────────────────────
// One cached entry per contentKey (e.g. "chapter:Awards", "monthly:2025/june").
// Regenerating simply overwrites the existing entry — there's no history of
// past summaries, matching "invalidate cache only when markdown changes"
// rather than keeping every past generation.
export const aiSummaryDB = {
  async get(contentKey: string): Promise<AiSummaryCacheEntry | undefined> {
    const db = await getDB();
    return db.get('aiSummaries', contentKey);
  },

  async upsert(entry: AiSummaryCacheEntry): Promise<void> {
    const db = await getDB();
    await db.put('aiSummaries', entry);
  },

  async delete(contentKey: string): Promise<void> {
    const db = await getDB();
    await db.delete('aiSummaries', contentKey);
  },
};

// ─── Universal attempt ledger ──────────────────────────────────────────────────
// Local-only (not enqueued to the sync outbox) — this is derived/bulk attempt
// history, not a small user-editable table like bookmarks/settings, so it's
// out of scope for cross-device sync until that's actually needed (master
// prompt §72: design for it later, don't build it before it's required).

export const universalAttemptsDB = {
  async recordMany(records: UniversalAttemptRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = await getDB();
    const tx = db.transaction('universalAttempts', 'readwrite');
    await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
  },

  async getAttemptedQuestionIds(examId?: string): Promise<Set<string>> {
    const db = await getDB();
    const all = examId
      ? await db.getAllFromIndex('universalAttempts', 'by-examId', examId)
      : await db.getAll('universalAttempts');
    // "Attempted" means actually answered, matching wasAnswered semantics
    // used everywhere else (test results, scoring) — a question the user
    // saw but skipped hasn't really been engaged with, so it should still
    // surface as Unattempted rather than silently disappearing from it.
    return new Set(all.filter((r) => r.wasAnswered).map((r) => r.universalQuestionId).filter((id): id is string => Boolean(id)));
  },

  async getAll(): Promise<UniversalAttemptRecord[]> {
    const db = await getDB();
    return db.getAll('universalAttempts');
  },

  async getByTopic(topicId: string): Promise<UniversalAttemptRecord[]> {
    const db = await getDB();
    return db.getAllFromIndex('universalAttempts', 'by-topicId', topicId);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('universalAttempts');
  },
};

// One frozen, completed Mock/Sectional Mock session per attempt — see
// MockAttemptRecord's doc comment for why this is separate from the
// per-question universalAttempts ledger above.
export const mockAttemptsDB = {
  async save(record: MockAttemptRecord): Promise<void> {
    const db = await getDB();
    await db.put('mockAttempts', record);
  },

  async get(attemptId: string): Promise<MockAttemptRecord | undefined> {
    const db = await getDB();
    return db.get('mockAttempts', attemptId);
  },

  async getForMock(mockDefinitionId: string): Promise<MockAttemptRecord[]> {
    const db = await getDB();
    const records = await db.getAllFromIndex('mockAttempts', 'by-mockDefinitionId', mockDefinitionId);
    return records.sort((a, b) => b.completedAt - a.completedAt);
  },

  async getMostRecentForMock(mockDefinitionId: string): Promise<MockAttemptRecord | undefined> {
    const records = await this.getForMock(mockDefinitionId);
    return records[0];
  },

  async getAll(): Promise<MockAttemptRecord[]> {
    const db = await getDB();
    const all = await db.getAll('mockAttempts');
    return all.sort((a, b) => b.completedAt - a.completedAt);
  },
};
