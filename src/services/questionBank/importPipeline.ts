// ─── Local import: files → validated, previewed, atomically imported ─────────
// Fully offline. Several JSON files at once; each is validated (syntax with exact line/column, then every test- and question-level rule)
// and previewed before anything is written. A file with ANY error is never partly imported and never "fixed": the whole batch waits
// until every file is valid, then goes in as one transaction (all or nothing).

import { commitTests, getBankQuestions, getBankTest, type CommitSummary, type PreparedTest } from './bankDb';
import { emitBankChanged } from './bankEvents';
import { examIdsForSubject, MAX_FILE_BYTES, parseTestFile, type FileIssue, type ParsedTestFile, type TestFileMeta } from './testFile';
import { testKeyOf, type ImportMode } from './types';

export const EXPORT_BUNDLE_FORMAT = 'examverse-question-bank-export';

export interface ImportCandidate {
  uid: string;
  fileName: string;
  size: number;
  /** null when the file could not be read at all (see readError). */
  text: string | null;
  readError?: string;
  /** Test details the learner filled in (needed for a bare array, which has none). */
  overrides: Partial<TestFileMeta>;
}

export type ImportBatchMode = Exclude<ImportMode, 'restore'>;

export interface ImportPreview {
  uid: string;
  fileName: string;
  parsed: ParsedTestFile;
  /** A LOCAL test with this id already exists. */
  testExists: boolean;
  duplicateQuestionIds: string[];
  newQuestionIds: string[];
  /** Replace: ids the existing test has that the file does not (they are kept only as retired snapshots). */
  removedQuestionIds: string[];
  errors: FileIssue[];
  warnings: FileIssue[];
  valid: boolean;
}

let uidCounter = 0;
export const nextCandidateUid = () => `c${Date.now().toString(36)}-${uidCounter++}`;

/** Reads a picked/dropped file. Never throws: a file that can't be read becomes a candidate with a readError. */
export async function readCandidate(file: File): Promise<ImportCandidate> {
  const base = { uid: nextCandidateUid(), fileName: file.name, size: file.size, overrides: {} };
  if (file.size > MAX_FILE_BYTES) return { ...base, text: null, readError: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  try { return { ...base, text: await file.text() }; } catch { return { ...base, text: null, readError: 'This file could not be read.' }; }
}

/** An export bundle ({ format, tests: [...] }) becomes one candidate per test; anything else is passed through. */
export function expandBundles(candidates: readonly ImportCandidate[]): ImportCandidate[] {
  return candidates.flatMap((c) => {
    if (c.text === null) return [c];
    try {
      const raw = JSON.parse(c.text.charCodeAt(0) === 0xfeff ? c.text.slice(1) : c.text) as { format?: unknown; tests?: unknown };
      if (raw && !Array.isArray(raw) && raw.format === EXPORT_BUNDLE_FORMAT && Array.isArray(raw.tests)) {
        return raw.tests.map((t, i) => ({ ...c, uid: `${c.uid}.${i}`, fileName: `${c.fileName} › test ${i + 1}`, text: JSON.stringify(t), size: JSON.stringify(t).length }));
      }
    } catch { /* not JSON: the parser below reports the exact position */ }
    return [c];
  });
}

export function toPrepared(parsed: ParsedTestFile): PreparedTest {
  if (!parsed.ok || !parsed.meta) throw new Error('This file has errors and cannot be imported.');
  const m = parsed.meta;
  return { id: m.id, title: m.title, subjectId: m.subjectId, chapterId: m.chapterId, chapterTitle: m.chapterTitle, examIds: m.examIds.length > 0 ? m.examIds : examIdsForSubject(m.subjectId), questions: parsed.questions, sourceFile: parsed.fileName };
}

const err = (code: string, message: string): FileIssue => ({ severity: 'error', code, message });

export async function previewImports(candidates: readonly ImportCandidate[], mode: ImportBatchMode): Promise<ImportPreview[]> {
  const seenIds = new Map<string, string>();
  const out: ImportPreview[] = [];
  for (const c of candidates) {
    const parsed = c.text === null
      ? ({ fileName: c.fileName, ok: false, meta: null, questions: [], errors: [err('unreadable', c.readError ?? 'This file could not be read.')], warnings: [], questionCount: 0, difficulty: { easy: 0, medium: 0, hard: 0, unspecified: 0 }, duplicateIdsInFile: [] } as ParsedTestFile)
      : parseTestFile(c.text, c.fileName, c.overrides);
    const errors = [...parsed.errors];
    let testExists = false, duplicateQuestionIds: string[] = [], newQuestionIds: string[] = [], removedQuestionIds: string[] = [];

    if (parsed.meta) {
      const id = parsed.meta.id;
      const earlier = seenIds.get(id);
      if (earlier) errors.push(err('duplicate-test-id-in-batch', `Test id "${id}" is also used by ${earlier}. Each test in a batch needs its own id.`));
      else seenIds.set(id, c.fileName);

      const existing = await getBankTest(testKeyOf('local', id));
      testExists = !!existing;
      if (mode === 'add' && existing) errors.push(err('duplicate-test-id', `A test with the id "${id}" is already on this device. Use Replace or Merge to change it, or give this file a different id.`));
      if ((mode === 'replace' || mode === 'merge') && !existing) errors.push(err('missing-test', `There is no test with the id "${id}" on this device to ${mode}. Use Add to create it.`));

      const have = new Set((existing ? await getBankQuestions(existing.key) : []).map((r) => r.questionId));
      const incoming = parsed.ok ? parsed.questions.map((q) => q.id) : [];
      duplicateQuestionIds = incoming.filter((q) => have.has(q));
      newQuestionIds = incoming.filter((q) => !have.has(q));
      removedQuestionIds = Array.from(have).filter((q) => !incoming.includes(q));
    }
    out.push({ uid: c.uid, fileName: c.fileName, parsed, testExists, duplicateQuestionIds, newQuestionIds, removedQuestionIds, errors, warnings: parsed.warnings, valid: errors.length === 0 });
  }
  return out;
}

/** Imports every previewed file in ONE transaction. Refuses (and writes nothing) unless every file is valid. */
export async function commitImports(previews: readonly ImportPreview[], mode: ImportBatchMode, options: { mergeConflict?: 'skip' | 'update'; afterWrite?: (n: number) => void } = {}): Promise<CommitSummary[]> {
  if (previews.length === 0) throw new Error('There is nothing to import.');
  const bad = previews.find((p) => !p.valid);
  if (bad) throw new Error(`Fix the errors in ${bad.fileName} first — nothing was imported.`);
  const summaries = await commitTests(previews.map((p) => toPrepared(p.parsed)), { mode, origin: 'local', mergeConflict: options.mergeConflict, afterWrite: options.afterWrite });
  emitBankChanged();
  return summaries;
}
