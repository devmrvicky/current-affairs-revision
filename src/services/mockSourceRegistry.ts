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
import { validateMockSourceFile } from '../types/mockSourceFile';

// Canonical path: src/data/{examId}/mocks/{file}.json (product spec §3). `**`
// also allows an organizational category folder above examId
// (src/data/ssc/ssc-chsl/mocks/mock01.json), consistent with every other
// loader in this app — examId is simply "whatever sits directly before
// /mocks/".
const mockSourceModules = import.meta.glob<{ default: MockSourceFile }>(
  '../data/**/mocks/*.json',
  { eager: false }
);

function parseMocksPath(globKey: string): { examIdFromPath: string } | null {
  const marker = '/data/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + marker.length).split('/');
  const mocksIdx = parts.lastIndexOf('mocks');
  if (mocksIdx < 1 || mocksIdx !== parts.length - 2) return null;
  return { examIdFromPath: parts[mocksIdx - 1] };
}

interface LoadedMockSources {
  files: MockSourceFile[];
  errors: MockSourceValidationError[];
}

let _cache: LoadedMockSources | null = null;

async function loadMockSourceFiles(): Promise<LoadedMockSources> {
  if (_cache) return _cache;
  const files: MockSourceFile[] = [];
  const errors: MockSourceValidationError[] = [];

  for (const [globKey, loader] of Object.entries(mockSourceModules)) {
    const parsed = parseMocksPath(globKey);
    if (!parsed) continue;

    let file: MockSourceFile;
    try {
      const mod = await loader();
      file = mod.default;
    } catch (err) {
      errors.push({ mockSourceId: '(unknown)', filePath: globKey, reason: `failed to load: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    if (!file || typeof file !== 'object') {
      errors.push({ mockSourceId: '(unknown)', filePath: globKey, reason: 'file does not contain a valid mock object' });
      continue;
    }
    // examId on the file itself is authoritative; the path only needs to
    // avoid accidentally matching something unrelated to this exam's mocks.
    if (!file.examId) file.examId = parsed.examIdFromPath;

    const fileErrors = validateMockSourceFile(file, globKey);
    if (fileErrors.length > 0) {
      errors.push(...fileErrors);
      continue; // excluded entirely — a half-valid mock never partially loads
    }

    files.push(file);
  }

  _cache = { files, errors };
  return _cache;
}

export async function getAllMockSourceFiles(): Promise<MockSourceFile[]> {
  return (await loadMockSourceFiles()).files;
}

export async function getMockSourceValidationErrors(): Promise<MockSourceValidationError[]> {
  return (await loadMockSourceFiles()).errors;
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
}
