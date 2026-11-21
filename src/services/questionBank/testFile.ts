// ─── A bank test file: parse, validate (with exact locations), serialize ─────
// The per-test JSON is the EXISTING ExamVerse question-file schema (a bare array of questions, or { questions: [...] }),
// reusing authorValidation and canonicalQuestionNormalizer — no second schema. A wrapper object may additionally carry the test's
// own details (id, title, subject, chapter, chapterTitle, examIds, version); those are additive and ignored by the existing loaders.
// A bare array has no such details, so the importer asks for them (`overrides`).

import { validateQuestionFileText, type ValidationIssue } from '../author/authorValidation';
import { normalizeOptions, resolveCorrectAnswer, unwrapQuestionFile } from '../canonicalQuestionNormalizer';
import { subjectRegistry, resolveSubjectId } from '../../data/registry/subjectRegistry';
import { EXAMS } from '../../data/registry/examRegistry';
import { slugify } from '../../utils/slug';
import { sha256Hex } from './sha256';
import type { BankQuestionData } from './types';

export interface TestFileMeta {
  id: string;
  title: string;
  subjectId: string;
  chapterId: string;
  chapterTitle: string;
  examIds: string[];
  version?: number;
}

export interface FileIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** 1-based position in the file text, when it can be located. */
  line?: number;
  column?: number;
  questionIndex?: number;
  questionId?: string;
}

export interface ParsedTestFile {
  fileName: string;
  /** No errors: safe to import. Warnings never block. */
  ok: boolean;
  meta: TestFileMeta | null;
  /** Normalized questions — empty unless the file has no errors (an invalid question is never silently dropped or fixed). */
  questions: BankQuestionData[];
  errors: FileIssue[];
  warnings: FileIssue[];
  questionCount: number;
  difficulty: { easy: number; medium: number; hard: number; unspecified: number };
  /** Question ids that appear more than once inside this file. */
  duplicateIdsInFile: string[];
}

export const TEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// ─── Locating things in the text ─────────────────────────────────────────────

const lineCol = (text: string, offset: number) => {
  const before = text.slice(0, offset);
  return { line: before.split('\n').length, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
};

/** Start offset of each element of the questions array (the text must already be valid JSON). */
export function questionStartOffsets(text: string): number[] | null {
  let i = 0;
  const n = text.length;
  const ws = () => { while (i < n && /\s/.test(text[i])) i++; };
  const skipString = () => { i++; while (i < n && text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; };
  const skipValue = () => {
    ws();
    const c = text[i];
    if (c === '"') { skipString(); return; }
    if (c === '{' || c === '[') {
      let depth = 0;
      while (i < n) {
        const ch = text[i];
        if (ch === '"') { skipString(); continue; }
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { i++; return; } }
        i++;
      }
      return;
    }
    while (i < n && !/[,\]}\s]/.test(text[i])) i++;
  };
  const readArray = (): number[] => {
    const offsets: number[] = [];
    i++; ws();
    if (text[i] === ']') return offsets;
    for (;;) { ws(); offsets.push(i); skipValue(); ws(); if (text[i] === ',') { i++; continue; } break; }
    return offsets;
  };
  ws();
  if (text[i] === '[') return readArray();
  if (text[i] !== '{') return null;
  i++;
  for (;;) {
    ws();
    if (text[i] !== '"') return null;
    const keyStart = i;
    skipString();
    const key = text.slice(keyStart + 1, i - 1);
    ws(); i++; ws();
    if (key === 'questions' && text[i] === '[') return readArray();
    skipValue(); ws();
    if (text[i] === ',') { i++; continue; }
    return null;
  }
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function readMeta(raw: unknown, overrides: Partial<TestFileMeta>, fileName: string): { meta: Partial<TestFileMeta>; chapterText?: string } {
  const w = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const examRaw = w.examIds ?? w.examId;
  const fileBase = fileName.replace(/\.json$/i, '');
  const chapterText = overrides.chapterTitle ?? str(w.chapterTitle) ?? str(w.chapter) ?? str(w.chapterId);
  const subjectText = overrides.subjectId ?? str(w.subjectId) ?? str(w.subject);
  return {
    chapterText,
    meta: {
      id: overrides.id ?? str(w.id) ?? str(w.testId) ?? (slugify(fileBase) || undefined),
      title: overrides.title ?? str(w.title) ?? fileBase,
      subjectId: subjectText ? resolveSubjectId(subjectText) : undefined,
      chapterId: overrides.chapterId ?? (chapterText ? slugify(str(w.chapterId) ?? str(w.chapter) ?? chapterText) : undefined),
      chapterTitle: chapterText,
      examIds: overrides.examIds ?? (Array.isArray(examRaw) ? examRaw.filter((e): e is string => typeof e === 'string') : typeof examRaw === 'string' ? [examRaw] : []),
      version: typeof w.version === 'number' && Number.isInteger(w.version) && w.version > 0 ? w.version : undefined,
    },
  };
}

function toBankQuestion(q: Record<string, unknown>): BankQuestionData {
  const options = normalizeOptions(q.options);
  const out: BankQuestionData = {
    id: String(q.id),
    questionType: (['mcq', 'true_false', 'fill_blank'].includes(String(q.questionType)) ? q.questionType : 'mcq') as BankQuestionData['questionType'],
    question: String(q.question),
    options,
    correctAnswer: resolveCorrectAnswer(options, q.correctAnswer),
  };
  if (str(q.topicId)) out.topicId = str(q.topicId);
  if (str(q.subtopicId)) out.subtopicId = str(q.subtopicId);
  if (typeof q.explanation === 'string' && q.explanation.trim()) out.explanation = q.explanation;
  if (['easy', 'medium', 'hard'].includes(String(q.difficulty))) out.difficulty = q.difficulty as BankQuestionData['difficulty'];
  if (['en', 'hi', 'bilingual'].includes(String(q.language))) out.language = q.language as BankQuestionData['language'];
  if (Array.isArray(q.tags) && q.tags.every((t) => typeof t === 'string')) out.tags = q.tags as string[];
  return out;
}

const fromIssue = (i: ValidationIssue, lines: number[] | null, text: string): FileIssue => {
  const base: FileIssue = { severity: i.severity, code: i.code, message: i.message, questionIndex: i.questionIndex, questionId: i.questionId };
  if (i.questionIndex !== undefined && lines && lines[i.questionIndex] !== undefined) Object.assign(base, lineCol(text, lines[i.questionIndex]));
  return base;
};

export function parseTestFile(rawText: string, fileName: string, overrides: Partial<TestFileMeta> = {}): ParsedTestFile {
  const empty = (errors: FileIssue[]): ParsedTestFile => ({ fileName, ok: false, meta: null, questions: [], errors, warnings: [], questionCount: 0, difficulty: { easy: 0, medium: 0, hard: 0, unspecified: 0 }, duplicateIdsInFile: [] });
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  if (new TextEncoder().encode(rawText).length > MAX_FILE_BYTES) {
    return empty([{ severity: 'error', code: 'file-too-large', message: `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.` }]);
  }

  const v = validateQuestionFileText(rawText);
  if (v.shape === 'invalid') {
    return empty(v.errors.map((e) => {
      const m = /\(line (\d+), column (\d+)\)/.exec(e.message);
      return { severity: 'error', code: e.code, message: e.message, ...(m ? { line: Number(m[1]), column: Number(m[2]) } : {}) } as FileIssue;
    }));
  }

  const raw: unknown = JSON.parse(text);
  const list = (unwrapQuestionFile(raw) ?? []) as Record<string, unknown>[];
  const lines = questionStartOffsets(text);
  const errors = v.errors.map((i) => fromIssue(i, lines, text));
  const warnings = v.warnings.map((i) => fromIssue(i, lines, text));

  // Test-level checks (the existing validator only knows about questions).
  const { meta: m, chapterText } = readMeta(raw, overrides, fileName);
  const testErr = (code: string, message: string) => errors.push({ severity: 'error', code, message });
  if (!m.id) testErr('missing-test-id', 'Give this test an id (letters, numbers, - _ .).');
  else if (!TEST_ID_PATTERN.test(m.id)) testErr('bad-test-id', `Test id "${m.id}" must start with a letter or number and use only letters, numbers, - _ . (max 80).`);
  if (!m.title) testErr('missing-title', 'Give this test a title.');
  if (!m.subjectId) testErr('missing-subject', 'Choose the subject this test belongs to.');
  else if (!subjectRegistry.getSubject(m.subjectId)) testErr('unknown-subject', `Subject "${m.subjectId}" is not a subject the app knows.`);
  if (!m.chapterId || !chapterText) testErr('missing-chapter', 'Give the chapter this test belongs to.');
  for (const e of m.examIds ?? []) if (!EXAMS.some((x) => x.id === e)) warnings.push({ severity: 'warning', code: 'unknown-exam', message: `Exam "${e}" is not an exam the app knows.` });

  const seen = new Set<string>();
  const duplicateIdsInFile = Array.from(new Set(list.map((q) => String(q?.id ?? '')).filter((id) => { if (!id) return false; const dup = seen.has(id); seen.add(id); return dup; })));
  const difficulty = { easy: 0, medium: 0, hard: 0, unspecified: 0 };
  for (const q of list) { const d = String(q?.difficulty); if (d === 'easy' || d === 'medium' || d === 'hard') difficulty[d]++; else difficulty.unspecified++; }

  const ok = errors.length === 0;
  const meta: TestFileMeta | null = m.id && m.title && m.subjectId && m.chapterId
    ? { id: m.id, title: m.title, subjectId: m.subjectId, chapterId: m.chapterId, chapterTitle: chapterText ?? m.chapterId, examIds: m.examIds ?? [], version: m.version } : null;
  return { fileName, ok, meta, questions: ok ? list.map(toBankQuestion) : [], errors, warnings, questionCount: list.length, difficulty, duplicateIdsInFile };
}

// ─── Serializing ─────────────────────────────────────────────────────────────

/** The exact text a test is published/exported as — stable key order, so its hash is stable too. */
export function serializeTestFile(meta: TestFileMeta, questions: readonly BankQuestionData[]): string {
  const body = {
    id: meta.id,
    title: meta.title,
    subject: meta.subjectId,
    chapter: meta.chapterId,
    chapterTitle: meta.chapterTitle,
    examIds: meta.examIds,
    version: meta.version ?? 1,
    questions,
  };
  return JSON.stringify(body, null, 2) + '\n';
}

export const contentHash = (text: string) => sha256Hex(text);

/** Exams whose syllabus includes this subject — used when a test doesn't name its exams. */
export function examIdsForSubject(subjectId: string): string[] {
  return EXAMS.filter((e) => e.subjects.some((s) => s.subjectId === subjectId)).map((e) => e.id);
}
