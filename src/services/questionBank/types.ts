// ─── Question Bank: shared types ─────────────────────────────────────────────
// The bank is where tests that are NOT bundled with the app come from:
//   bundled — JSON shipped in src/data (unchanged; not stored in the bank's tables)
//   local   — imported on this device (IndexedDB only; "This device only")
//   remote  — published through GitHub for everyone, downloaded and cached in IndexedDB
// Question-bank data and user progress live in separate stores: nothing here ever writes to attempts, bookmarks,
// saved questions, scores or preferences.

export type BankOrigin = 'local' | 'remote';
export type BankSource = 'bundled' | BankOrigin;

/** One test of the bank (store: `tests`). The key is origin-qualified so a local and a remote test with the same id can never clash. */
export interface BankTestRecord {
  key: string; // `${origin}:${id}`
  id: string;
  origin: BankOrigin;
  title: string;
  subjectId: string;
  chapterId: string;
  chapterTitle: string;
  examIds: string[];
  questionCount: number;
  /** Bumped on every replace/merge/update — independent per test. */
  version: number;
  /** SHA-256 of the test's canonical JSON — what sync compares. */
  hash: string;
  createdAt: number;
  updatedAt: number;
  sourceFile?: string;
  /** Remote tests: the manifest `file` the content came from. */
  file?: string;
}

/** The question exactly as authored (ExamVerse JSON schema, normalized), before the pool gives it a collision-proof id. */
export interface BankQuestionData {
  id: string;
  topicId?: string;
  subtopicId?: string;
  questionType: 'mcq' | 'true_false' | 'fill_blank';
  question: string;
  options: { id: string; text: string; image?: string }[];
  correctAnswer: string;
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: 'en' | 'hi' | 'bilingual';
  tags?: string[];
}

/** One question of a test (store: `questions`). */
export interface BankQuestionRecord {
  key: string; // `${testKey}::${questionId}`
  testKey: string;
  testId: string;
  origin: BankOrigin;
  questionId: string;
  subjectId: string;
  chapterId: string;
  updatedAt: number;
  /** Position in the test as authored (a test's questions keep their order). */
  order?: number;
  /**
   * Set when a Replace / update removed or re-keyed this question. The record is kept as a frozen snapshot so that
   * attempts recorded against it still resolve for review — but it is never part of a test or the practice pool.
   */
  retired?: boolean;
  data: BankQuestionData;
}

export type ImportMode = 'add' | 'replace' | 'merge' | 'restore';

export interface ImportHistoryRecord {
  id: string;
  at: number;
  fileName: string;
  testId: string;
  mode: ImportMode;
  added: number;
  updated: number;
  skipped: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface MetadataRecord { key: string; value: unknown }

// ─── Manifest (public/data/question-bank/manifest.json) ─────────────────────

export interface ManifestEntry {
  id: string;
  title: string;
  subject: string;
  chapter: string;
  /** Path of the test JSON, relative to the manifest's folder. */
  file: string;
  questionCount: number;
  version: number;
  updatedAt: string;
  /** SHA-256 (hex) of the test file's exact bytes. */
  hash: string;
}

export interface Manifest {
  version: number;
  updatedAt: string;
  tests: ManifestEntry[];
}

export const EMPTY_MANIFEST: Manifest = { version: 1, updatedAt: '1970-01-01T00:00:00.000Z', tests: [] };

export const testKeyOf = (origin: BankOrigin, id: string) => `${origin}:${id}`;
export const questionKeyOf = (testKey: string, questionId: string) => `${testKey}::${questionId}`;
