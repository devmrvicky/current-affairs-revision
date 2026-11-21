// ─── Question Bank storage ───────────────────────────────────────────────────
// Every write that changes more than one record runs in ONE IndexedDB transaction that aborts on any error — all or nothing.
// These stores hold bank content only; they never touch attempts, bookmarks, saved questions, scores or preferences.

import { getDB, type AppDB } from '../db';
import type { StoreNames, StoreValue } from 'idb';
import { contentHash, serializeTestFile } from './testFile';
import {
  questionKeyOf, testKeyOf,
  type BankOrigin, type BankQuestionData, type BankQuestionRecord, type BankTestRecord, type ImportHistoryRecord, type ImportMode, type MetadataRecord,
} from './types';

/** A validated test, ready to be written. */
export interface PreparedTest {
  id: string;
  title: string;
  subjectId: string;
  chapterId: string;
  chapterTitle: string;
  examIds: string[];
  questions: BankQuestionData[];
  sourceFile: string;
  /** Remote tests: the version/hash/file published in the manifest (taken as given, after the content was verified). */
  version?: number;
  hash?: string;
  file?: string;
}

export interface CommitOptions {
  mode: ImportMode;
  origin?: BankOrigin;
  /** Merge only: what to do when a question id already exists in the test. */
  mergeConflict?: 'skip' | 'update';
  now?: number;
  /** Test seam: called after each record is written; throwing here simulates a failure mid-import. */
  afterWrite?: (writesSoFar: number) => void;
  /**
   * More records to write in the SAME transaction (a restore puts back attempts / bookmarks / retired snapshots alongside the tests),
   * so the whole restore is all-or-nothing.
   */
  extraWrites?: { store: ProgressStore | 'questions'; records: unknown[] }[];
}

/** User-progress stores a backup may carry (only ever written when the person explicitly chose to include them). */
export type ProgressStore = 'universalAttempts' | 'bookmarks' | 'markedForReview' | 'wrongQuestions' | 'savedTests';

export interface CommitSummary { testId: string; added: number; updated: number; skipped: number }

export class BankError extends Error {
  constructor(public code: 'duplicate-test' | 'missing-test' | 'commit-failed', message: string) { super(message); this.name = 'BankError'; }
}

const sameContent = (a: BankQuestionData, b: BankQuestionData) => JSON.stringify(a) === JSON.stringify(b);

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getBankTests(origin?: BankOrigin): Promise<BankTestRecord[]> {
  const db = await getDB();
  const all = origin ? await db.getAllFromIndex('tests', 'by-source', origin) : await db.getAll('tests');
  return all.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

export async function getBankTest(testKey: string): Promise<BankTestRecord | undefined> {
  return (await getDB()).get('tests', testKey);
}

/** The active questions of a test, in the order they were authored (not retired snapshots). */
export async function getBankQuestions(testKey: string): Promise<BankQuestionRecord[]> {
  const db = await getDB();
  const rows = (await db.getAllFromIndex('questions', 'by-testKey', testKey)).filter((r) => !r.retired);
  return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getAllActiveBankQuestions(): Promise<BankQuestionRecord[]> {
  const db = await getDB();
  return (await db.getAll('questions')).filter((r) => !r.retired);
}

export async function getBankQuestionByKey(key: string): Promise<BankQuestionRecord | undefined> {
  return (await getDB()).get('questions', key);
}

export async function getMetadata<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('metadata', key))?.value as T | undefined;
}

export async function setMetadata(key: string, value: unknown): Promise<void> {
  const rec: MetadataRecord = { key, value };
  await (await getDB()).put('metadata', rec);
}

export async function getImportHistory(): Promise<ImportHistoryRecord[]> {
  return (await (await getDB()).getAll('importHistory')).sort((a, b) => b.at - a.at);
}

export async function countBankQuestions(origin?: BankOrigin): Promise<number> {
  const rows = await getAllActiveBankQuestions();
  return origin ? rows.filter((r) => r.origin === origin).length : rows.length;
}

// ─── Writes (atomic) ─────────────────────────────────────────────────────────

function testRecord(p: PreparedTest, origin: BankOrigin, existing: BankTestRecord | undefined, now: number, version: number, count: number): BankTestRecord {
  const meta = { id: p.id, title: p.title, subjectId: p.subjectId, chapterId: p.chapterId, chapterTitle: p.chapterTitle, examIds: p.examIds, version };
  return {
    key: testKeyOf(origin, p.id), id: p.id, origin, title: p.title, subjectId: p.subjectId, chapterId: p.chapterId, chapterTitle: p.chapterTitle, examIds: p.examIds,
    questionCount: count, version, hash: p.hash ?? contentHash(serializeTestFile(meta, p.questions)), createdAt: existing?.createdAt ?? now, updatedAt: now,
    sourceFile: p.sourceFile, file: p.file,
  };
}

/**
 * Writes a batch of tests in a single transaction. If anything throws — a duplicate id, a missing test, a storage error, or the
 * `afterWrite` seam — the transaction aborts and the database is exactly as it was. A success (or failure) is recorded in the import history.
 */
export async function commitTests(prepared: readonly PreparedTest[], options: CommitOptions): Promise<CommitSummary[]> {
  const { mode, origin = 'local', mergeConflict = 'skip' } = options;
  const now = options.now ?? Date.now();
  const db = await getDB();
  const extraStores = Array.from(new Set((options.extraWrites ?? []).map((w) => w.store).filter((s) => s !== 'questions')));
  const tx = db.transaction(['tests', 'questions', 'importHistory', ...extraStores] as StoreNames<AppDB>[], 'readwrite');
  const tests = tx.objectStore('tests');
  const questions = tx.objectStore('questions');
  const history = tx.objectStore('importHistory');
  const byTestKey = questions.index('by-testKey');
  const summaries: CommitSummary[] = [];
  let writes = 0;
  const wrote = () => { writes += 1; options.afterWrite?.(writes); };

  try {
    for (const p of prepared) {
      const testKey = testKeyOf(origin, p.id);
      const existing = await tests.get(testKey);
      if (mode === 'add' && existing) throw new BankError('duplicate-test', `A ${origin} test with the id "${p.id}" already exists. Use Replace or Merge to change it.`);
      if ((mode === 'replace' || mode === 'merge') && !existing) throw new BankError('missing-test', `There is no ${origin} test with the id "${p.id}" to ${mode}. Use Add to create it.`);

      const old = await byTestKey.getAll(testKey);
      const oldActive = new Map(old.filter((r) => !r.retired).map((r) => [r.questionId, r]));
      const summary: CommitSummary = { testId: p.id, added: 0, updated: 0, skipped: 0 };

      const rec = (q: BankQuestionData, order: number): BankQuestionRecord => ({
        key: questionKeyOf(testKey, q.id), testKey, testId: p.id, origin, questionId: q.id, subjectId: p.subjectId, chapterId: p.chapterId, updatedAt: now, order, data: q,
      });

      if (mode === 'merge') {
        let order = Math.max(-1, ...old.filter((r) => !r.retired).map((r) => r.order ?? 0)) + 1;
        for (const q of p.questions) {
          const there = oldActive.get(q.id);
          if (!there) { await questions.put(rec(q, order++)); summary.added++; wrote(); }
          else if (mergeConflict === 'update' && !sameContent(there.data, q)) { await questions.put({ ...rec(q, there.order ?? 0) }); summary.updated++; wrote(); }
          else summary.skipped++;
        }
      } else {
        // add / replace / restore: the test's questions become exactly `p.questions`.
        const keep = new Set(p.questions.map((q) => q.id));
        for (const [id, r] of oldActive) {
          if (!keep.has(id)) { await questions.put({ ...r, retired: true, updatedAt: now }); wrote(); } // kept as a frozen snapshot
        }
        let order = 0;
        for (const q of p.questions) {
          const there = oldActive.get(q.id);
          if (!there) { summary.added++; await questions.put(rec(q, order)); wrote(); }
          else if (!sameContent(there.data, q) || there.order !== order) { if (!sameContent(there.data, q)) summary.updated++; else summary.skipped++; await questions.put(rec(q, order)); wrote(); }
          else summary.skipped++;
          order++;
        }
      }

      const activeCount = mode === 'merge' ? oldActive.size + summary.added : p.questions.length;
      const changed = summary.added + summary.updated > 0 || !existing;
      const version = p.version ?? (existing ? existing.version + (changed ? 1 : 0) : 1);
      await tests.put(testRecord(p, origin, existing, now, version, activeCount));
      wrote();
      await history.put({ id: crypto.randomUUID(), at: now, fileName: p.sourceFile, testId: p.id, mode, added: summary.added, updated: summary.updated, skipped: summary.skipped, status: 'success' });
      summaries.push(summary);
    }
    for (const w of options.extraWrites ?? []) {
      const store = tx.objectStore(w.store as StoreNames<AppDB>);
      for (const r of w.records) { await store.put(r as StoreValue<AppDB, StoreNames<AppDB>>); wrote(); }
    }
    await tx.done;
    return summaries;
  } catch (err) {
    try { tx.abort(); } catch { /* already finished */ }
    await tx.done.catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    // Record the failure in its own transaction so it can be inspected; the bank itself is untouched.
    await Promise.all(prepared.map((p) => db.put('importHistory', { id: crypto.randomUUID(), at: now, fileName: p.sourceFile, testId: p.id, mode, added: 0, updated: 0, skipped: 0, status: 'failed', error: message }))).catch(() => undefined);
    throw err instanceof BankError ? err : new BankError('commit-failed', `Nothing was changed: ${message}`);
  }
}

/** Removes a test from the bank. Its questions are kept as retired snapshots so attempts recorded against them still open for review. */
export async function deleteBankTest(testKey: string, now: number = Date.now()): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction(['tests', 'questions'], 'readwrite');
  try {
    const existing = await tx.objectStore('tests').get(testKey);
    if (!existing) { await tx.done; return false; }
    const rows = await tx.objectStore('questions').index('by-testKey').getAll(testKey);
    for (const r of rows) if (!r.retired) await tx.objectStore('questions').put({ ...r, retired: true, updatedAt: now });
    await tx.objectStore('tests').delete(testKey);
    await tx.done;
    return true;
  } catch (err) {
    try { tx.abort(); } catch { /* done */ }
    await tx.done.catch(() => undefined);
    throw err;
  }
}
