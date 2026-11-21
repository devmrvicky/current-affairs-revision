// ─── Export, full local backup, restore ──────────────────────────────────────
// Export: selected (or all) local tests as valid JSON that imports straight back in.
// Backup: question-bank metadata + imported tests. Attempts / bookmarks / other progress are in the file ONLY if explicitly selected.
// Restore: validated, previewed (with what it would replace), confirmed by the caller, and applied in ONE transaction.

import { getDB } from '../db';
import { commitTests, getBankQuestions, getBankTests, getImportHistory, type PreparedTest, type ProgressStore } from './bankDb';
import { emitBankChanged } from './bankEvents';
import { EXPORT_BUNDLE_FORMAT } from './importPipeline';
import { examIdsForSubject, parseTestFile, serializeTestFile, type FileIssue } from './testFile';
import { questionKeyOf, testKeyOf, type BankQuestionRecord, type ImportHistoryRecord } from './types';

export const BACKUP_FORMAT = 'examverse-local-backup';
export const BACKUP_VERSION = 1;
export const PROGRESS_STORES: readonly ProgressStore[] = ['universalAttempts', 'bookmarks', 'markedForReview', 'wrongQuestions', 'savedTests'];

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');

async function testFileText(testKey: string, withVersion = true): Promise<{ id: string; text: string } | null> {
  const t = (await getBankTests('local')).find((x) => x.key === testKey);
  if (!t) return null;
  const qs = (await getBankQuestions(testKey)).map((r) => r.data);
  const text = serializeTestFile({ id: t.id, title: t.title, subjectId: t.subjectId, chapterId: t.chapterId, chapterTitle: t.chapterTitle, examIds: t.examIds, version: withVersion ? t.version : undefined }, qs);
  return { id: t.id, text };
}

/** One valid JSON file per selected local test (each re-imports as-is). */
export async function exportTests(testIds: readonly string[] | 'all'): Promise<{ fileName: string; text: string }[]> {
  const ids = testIds === 'all' ? (await getBankTests('local')).map((t) => t.id) : testIds;
  const out: { fileName: string; text: string }[] = [];
  for (const id of ids) {
    const f = await testFileText(testKeyOf('local', id));
    if (f) out.push({ fileName: `${safeName(id)}.json`, text: f.text });
  }
  return out;
}

/** All selected local tests in one JSON file (re-imports as a batch). */
export async function exportBundle(testIds: readonly string[] | 'all', now: Date = new Date()): Promise<{ fileName: string; text: string }> {
  const files = await exportTests(testIds);
  const text = JSON.stringify({ format: EXPORT_BUNDLE_FORMAT, version: 1, exportedAt: now.toISOString(), tests: files.map((f) => JSON.parse(f.text)) }, null, 2) + '\n';
  return { fileName: `question-bank-export-${now.toISOString().slice(0, 10)}.json`, text };
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  tests: unknown[];
  /** Questions removed from tests by earlier replaces, kept so old attempts still open. */
  retiredQuestions: BankQuestionRecord[];
  importHistory: ImportHistoryRecord[];
  /** Present ONLY when the person chose to include progress. */
  progress?: Partial<Record<ProgressStore, unknown[]>>;
}

export async function buildBackup(options: { includeProgress: boolean; now?: Date }): Promise<{ fileName: string; text: string; counts: { tests: number; questions: number; progressRecords: number } }> {
  const now = options.now ?? new Date();
  const tests: unknown[] = [];
  let questions = 0;
  for (const t of await getBankTests('local')) {
    const f = await testFileText(t.key);
    if (f) { const obj = JSON.parse(f.text) as { questions: unknown[] }; tests.push(obj); questions += obj.questions.length; }
  }
  const db = await getDB();
  const retired = (await db.getAllFromIndex('questions', 'by-source', 'local')).filter((r) => r.retired);
  const backup: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), tests, retiredQuestions: retired, importHistory: await getImportHistory() };
  let progressRecords = 0;
  if (options.includeProgress) {
    backup.progress = {};
    for (const s of PROGRESS_STORES) { const rows = await db.getAll(s); backup.progress[s] = rows; progressRecords += rows.length; }
  }
  return { fileName: `question-bank-backup-${now.toISOString().slice(0, 10)}.json`, text: JSON.stringify(backup, null, 2) + '\n', counts: { tests: tests.length, questions, progressRecords } };
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export interface BackupPreview {
  ok: boolean;
  errors: FileIssue[];
  createdAt?: string;
  tests: { id: string; title: string; questionCount: number; willReplace: boolean }[];
  questionCount: number;
  retiredCount: number;
  hasProgress: boolean;
  progressCounts: Partial<Record<ProgressStore, number>>;
}

const bad = (message: string): FileIssue => ({ severity: 'error', code: 'invalid-backup', message });

interface Parsed { preview: BackupPreview; prepared: PreparedTest[]; backup: BackupFile | null }

async function parseBackup(text: string): Promise<Parsed> {
  const empty = (errors: FileIssue[]): Parsed => ({ preview: { ok: false, errors, tests: [], questionCount: 0, retiredCount: 0, hasProgress: false, progressCounts: {} }, prepared: [], backup: null });
  let raw: unknown;
  try { raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch (e) { return empty([bad(`This is not valid JSON: ${e instanceof Error ? e.message : 'parse error'}`)]); }
  const b = raw as Partial<BackupFile> | null;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) return empty([bad('This is not an ExamVerse question-bank backup.')]);
  if (b.version !== BACKUP_VERSION) return empty([bad(`This backup is version ${String(b.version)}; this app restores version ${BACKUP_VERSION}.`)]);
  if (!Array.isArray(b.tests)) return empty([bad('The backup has no "tests" list.')]);

  const errors: FileIssue[] = [];
  const prepared: PreparedTest[] = [];
  const seen = new Set<string>();
  b.tests.forEach((t, i) => {
    const p = parseTestFile(JSON.stringify(t), `backup test ${i + 1}`);
    if (!p.ok || !p.meta) { for (const e of p.errors) errors.push({ ...e, message: `Test ${i + 1}${p.meta ? ` (“${p.meta.id}”)` : ''}: ${e.message}` }); return; }
    if (seen.has(p.meta.id)) { errors.push(bad(`Test id "${p.meta.id}" appears more than once in the backup.`)); return; }
    seen.add(p.meta.id);
    const m = p.meta;
    prepared.push({ id: m.id, title: m.title, subjectId: m.subjectId, chapterId: m.chapterId, chapterTitle: m.chapterTitle, examIds: m.examIds.length > 0 ? m.examIds : examIdsForSubject(m.subjectId), questions: p.questions, sourceFile: 'backup', version: m.version });
  });
  if (b.retiredQuestions !== undefined && !Array.isArray(b.retiredQuestions)) errors.push(bad('"retiredQuestions" must be a list.'));
  for (const s of Object.keys(b.progress ?? {})) if (!PROGRESS_STORES.includes(s as ProgressStore)) errors.push(bad(`The backup carries progress for "${s}", which this app does not restore.`));

  const existing = new Set((await getBankTests('local')).map((t) => t.id));
  const progressCounts: Partial<Record<ProgressStore, number>> = {};
  for (const s of PROGRESS_STORES) { const rows = b.progress?.[s]; if (Array.isArray(rows)) progressCounts[s] = rows.length; }
  const preview: BackupPreview = {
    ok: errors.length === 0, errors, createdAt: b.createdAt,
    tests: prepared.map((p) => ({ id: p.id, title: p.title, questionCount: p.questions.length, willReplace: existing.has(p.id) })),
    questionCount: prepared.reduce((n, p) => n + p.questions.length, 0), retiredCount: Array.isArray(b.retiredQuestions) ? b.retiredQuestions.length : 0,
    hasProgress: !!b.progress && Object.keys(b.progress).length > 0, progressCounts,
  };
  return { preview, prepared, backup: errors.length === 0 ? (b as BackupFile) : null };
}

export async function previewBackup(text: string): Promise<BackupPreview> {
  return (await parseBackup(text)).preview;
}

/**
 * Applies a backup in ONE transaction: tests, their questions, retired snapshots, import history and — only if `restoreProgress` is true AND
 * the backup carries it — progress. Anything that fails changes nothing. Tests with the same id are replaced; others are left alone.
 */
export async function restoreBackup(text: string, options: { restoreProgress: boolean; afterWrite?: (n: number) => void }): Promise<{ tests: number; questions: number; progressRecords: number }> {
  const { preview, prepared, backup } = await parseBackup(text);
  if (!preview.ok || !backup) throw new Error(preview.errors[0]?.message ?? 'This backup cannot be restored.');

  const activeKeys = new Set(prepared.flatMap((p) => p.questions.map((q) => questionKeyOf(testKeyOf('local', p.id), q.id))));
  const retired = (backup.retiredQuestions ?? []).filter((r) => r && r.origin === 'local' && typeof r.key === 'string' && !activeKeys.has(r.key)).map((r) => ({ ...r, retired: true }));
  const extra: { store: ProgressStore | 'questions'; records: unknown[] }[] = [{ store: 'questions', records: retired }];
  let progressRecords = 0;
  if (options.restoreProgress && backup.progress) {
    for (const s of PROGRESS_STORES) { const rows = backup.progress[s]; if (Array.isArray(rows) && rows.length > 0) { extra.push({ store: s, records: rows }); progressRecords += rows.length; } }
  }
  await commitTests(prepared, { mode: 'restore', origin: 'local', extraWrites: extra, afterWrite: options.afterWrite });
  emitBankChanged();
  return { tests: prepared.length, questions: preview.questionCount, progressRecords };
}
