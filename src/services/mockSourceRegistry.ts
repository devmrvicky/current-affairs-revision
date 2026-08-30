// ─── Mock Source Registry ───────────────────────────────────────────────────
// The ONE place that reads src/data/{examId}/mocks/{file}.json off disk.
// Both questionRepository (which needs a flat UniversalQuestion[] for the
// universal pool — Practice by Topic, Review Center, search, analytics) and
// mockDefinitionRepository (which needs the structured sections/settings to
// run a Full/Sectional Mock session) read through THIS registry rather than
// each re-parsing the glob themselves — one parse, two views, per the
// product's own "FULL MOCK JSON → Question Registry → {Full Mock, Sectional,
// Practice}" diagram.
//
// A malformed file is reported and excluded from BOTH views rather than
// thrown — one bad mock must never take down every other mock or the whole
// Practice pool (product spec §87).

import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockSourceFile, MockSourceValidationError } from '../types/mockSourceFile';
import { normalizeMockSource, validateNormalized } from './mockSourceNormalizer';

// Canonical path: src/data/{examId}/mocks/{file}.json (product spec: this is
// THE canonical convention — the old singular "mock/" folder is legacy and
// must never be required for new content). `**` also allows an
// organizational category folder above examId
// (src/data/ssc/ssc-chsl/mocks/mock01.json), consistent with every other
// loader in this app — examId is simply "whatever sits directly before
// /mocks/".
const mockSourceModules = import.meta.glob<{ default: unknown }>(
  '../data/**/mocks/*.json',
  { eager: false }
);

function parseMocksPath(globKey: string): { examIdFromPath: string; fileName: string } | null {
  const marker = '/data/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + marker.length).split('/');
  const mocksIdx = parts.lastIndexOf('mocks');
  if (mocksIdx < 1 || mocksIdx !== parts.length - 2) return null;
  const fileName = parts[parts.length - 1].replace(/\.json$/i, '');
  return { examIdFromPath: parts[mocksIdx - 1], fileName };
}

export interface MockSourceDiagnosticEntry {
  filePath: string;
  fileName: string;
  examId: string;
  status: 'ok' | 'error';
  mockId?: string;
  questionCount?: number;
  sectionSummaries?: { title: string; questionCount: number }[];
  warnings: string[];
  errors: string[];
}

interface LoadedMockSources {
  files: MockSourceFile[];
  errors: MockSourceValidationError[];
  diagnostics: MockSourceDiagnosticEntry[];
}

let _cache: LoadedMockSources | null = null;
let _cacheFailed = false;

async function loadMockSourceFiles(): Promise<LoadedMockSources> {
  // Never permanently cache a bad load — a failed pass (e.g. a transient
  // import error while content is mid-edit in dev) gets retried on the next
  // call rather than freezing the app in a broken state until reload.
  if (_cache && !_cacheFailed) return _cache;
  const files: MockSourceFile[] = [];
  const errors: MockSourceValidationError[] = [];
  const diagnostics: MockSourceDiagnosticEntry[] = [];
  _cacheFailed = false;

  for (const [globKey, loader] of Object.entries(mockSourceModules)) {
    const parsed = parseMocksPath(globKey);
    if (!parsed) continue;
    const { examIdFromPath, fileName } = parsed;

    let raw: unknown;
    try {
      const mod = await loader();
      raw = mod.default;
    } catch (err) {
      const reason = `failed to load: ${err instanceof Error ? err.message : String(err)}`;
      errors.push({ mockSourceId: fileName, filePath: globKey, reason });
      diagnostics.push({ filePath: globKey, fileName, examId: examIdFromPath, status: 'error', warnings: [], errors: [reason] });
      _cacheFailed = true;
      continue;
    }

    const { file, warnings, errors: normalizeErrors } = normalizeMockSource(raw, { examIdFromPath, fileName, filePath: globKey });

    if (!file || normalizeErrors.length > 0) {
      errors.push(...normalizeErrors);
      diagnostics.push({ filePath: globKey, fileName, examId: examIdFromPath, status: 'error', warnings, errors: normalizeErrors.map((e) => e.reason) });
      continue;
    }

    const validationErrors = validateNormalized(file, globKey);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
      diagnostics.push({ filePath: globKey, fileName, examId: examIdFromPath, status: 'error', mockId: file.id, warnings, errors: validationErrors.map((e) => e.reason) });
      continue; // excluded entirely — a half-valid mock never partially loads, and never breaks any other mock
    }

    files.push(file);
    diagnostics.push({
      filePath: globKey, fileName, examId: file.examId, status: 'ok', mockId: file.id,
      questionCount: file.questions.length,
      sectionSummaries: file.sections.map((s) => ({ title: s.title, questionCount: s.questionCount })),
      warnings, errors: [],
    });
  }

  _cache = { files, errors, diagnostics };
  return _cache;
}

export async function getAllMockSourceFiles(): Promise<MockSourceFile[]> {
  return (await loadMockSourceFiles()).files;
}

export async function getMockSourceValidationErrors(): Promise<MockSourceValidationError[]> {
  return (await loadMockSourceFiles()).errors;
}

/** Development diagnostics — "Mock Content Diagnostics": one entry per discovered file, ok or error, with every warning surfaced (never silently absorbed). */
export async function getMockSourceDiagnostics(): Promise<MockSourceDiagnosticEntry[]> {
  return (await loadMockSourceFiles()).diagnostics;
}

export async function getMockSourceFile(mockId: string): Promise<MockSourceFile | null> {
  const { files } = await loadMockSourceFiles();
  return files.find((f) => f.id === mockId) ?? null;
}

/** Deterministic, globally-unique namespaced id for a question local to one mock file (product spec §21). */
export function namespacedQuestionId(mockSourceId: string, localId: string): string {
  return `${mockSourceId}::${localId}`;
}

/**
 * One mock file's questions, converted to the UniversalQuestion shape the
 * rest of the app already knows how to use everywhere (Practice by Topic,
 * Review Center, favorites, search, attempt ledger) — no special-casing
 * required anywhere downstream (product spec §123/§124).
 */
export function toUniversalQuestions(file: MockSourceFile): UniversalQuestion[] {
  // A question normally belongs to exactly one section — precompute that map once per file.
  const sectionByQuestionId = new Map<string, { id: string; title: string }>();
  for (const s of file.sections) {
    for (const qid of s.questionIds) sectionByQuestionId.set(qid, { id: s.id, title: s.title });
  }

  return file.questions.map((q) => {
    const section = sectionByQuestionId.get(q.id);
    return {
      id: namespacedQuestionId(file.id, q.id),
      examIds: [file.examId],
      subjectId: q.subjectId,
      topicId: q.topicId,
      subtopicId: q.subTopicId,
      questionType: 'mcq',
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty ?? 'medium',
      language: q.language ?? 'en',
      source: `mock-source:${file.id}`,
      year: file.source?.year,
      examSource: file.source ? `${file.title}${file.source.shift ? ` — ${file.source.shift}` : ''}` : undefined,
      sourceMockId: file.id,
      sourceSectionId: section?.id,
      sourceSectionTitle: section?.title,
    };
  });
}

export async function getAllMockSourceUniversalQuestions(): Promise<UniversalQuestion[]> {
  const files = await getAllMockSourceFiles();
  return files.flatMap(toUniversalQuestions);
}

/** Test-only / dev hook — mirrors questionRepository's clearQuestionCache. */
export function clearMockSourceCache(): void {
  _cache = null;
  _cacheFailed = false;
}
