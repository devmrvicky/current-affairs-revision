// ─── Universal Question Repository ────────────────────────────────────────────
// The one place the rest of ExamVerse (Practice, Test Engine, Search, Analytics)
// asks for questions. Two kinds of sources feed it:
//
//  1. Legacy Current Affairs content (daily + chapter-wise) — converted from
//     the pre-existing DailyQuiz shape via legacyQuestionAdapter. Kept ONLY
//     as a compatibility layer for content authored before ExamVerse existed.
//  2. Native universal content — any file under src/data/{category}/{exam}/
//     {year}/{subject}.json, authored directly in the UniversalQuestion shape.
//     This is how every non-Current-Affairs exam (SSC, Railway, Banking...)
//     gets its questions, and it requires ZERO changes here to add a new
//     exam/subject/year — see loadNativeUniversalQuestions() below.
//
// Practice/Test/Search/Analytics code above this layer never needs to know
// which of the two a question came from (master prompt §13, §14, §70).

import type { UniversalQuestion, Difficulty } from '../types/universalQuestion';
import { validateUniversalQuestion } from '../types/universalQuestion';
import { getQuizRepository, parseDateFromFileName } from './quizRepository';
import { getChapterList, loadChapterTest } from './chapterRepository';
import { convertDailyQuiz } from './legacyQuestionAdapter';
import { subjectRegistry, getTopicDisplayName } from '../data/registry/subjectRegistry';
import { examRegistry } from '../data/registry/examRegistry';
import { getAllMockSourceUniversalQuestions, clearMockSourceCache } from './mockSourceRegistry';
import { slugify } from '../utils/slug';

// ─── Topic-name → topic-id resolution ──────────────────────────────────────────
// Chapter folder names are free-text ("Books and authors"); TOPICS registry ids
// are slugs. Resolve by normalized match so content authors don't need to
// rename folders to satisfy the registry — and when there's no registry entry
// at all, fall back to the folder name's own slug rather than leaving the
// question topicless, so a brand-new chapter folder is practiceable/testable
// with zero registry edits (Universal Chapter auto-discovery requirement).

const normalize = slugify;

export function resolveTopicId(chapterFolderName: string): string {
  const target = normalize(chapterFolderName);
  const topics = subjectRegistry.getTopicsForSubject('current-affairs');
  const hit = topics.find((t) => normalize(t.name) === target || t.id === target);
  return hit?.id ?? target;
}

// ─── Native universal content loader ───────────────────────────────────────────
// Auto-discovers every src/data/{category}/{examId}/{year}/{subjectId}.json
// file — exactly the structure from master prompt §5/§12. {category} is a
// purely organizational folder (ssc/railway/banking/...) and is NOT parsed —
// {examId} must match an id in examRegistry.ts EXACTLY (e.g. "ssc-chsl", not
// "chsl"), since that's the only string the rest of the app uses to identify
// an exam. Each file is a plain JSON array of questions authored WITHOUT
// repeating examId/subjectId/year on every entry (those come from the file's
// own path), keeping content authoring simple. Dropping a new file into this
// structure makes it available everywhere in the app with no code change —
// that's the concrete test of "is this architecture actually universal".

const nativeModules = import.meta.glob<{ default: NativeQuestionFile }>(
  '../data/*/*/*/*.json',
  { eager: false }
);

/** Minimal shape a content author writes per question — everything else is inferred from the file path or defaulted. */
interface NativeQuestionFileEntry {
  id: string; // unique within this file, e.g. "percentage-0001"
  topicId?: string;
  subtopicId?: string;
  questionType?: UniversalQuestion['questionType'];
  question: string;
  options: UniversalQuestion['options'];
  correctAnswer: string;
  explanation?: string;
  difficulty?: Difficulty;
  language?: UniversalQuestion['language'];
  tags?: string[];
  source?: string;
}

type NativeQuestionFile = NativeQuestionFileEntry[];

// Top-level folders under src/data/ that belong to the legacy Current Affairs
// content and must never be mistaken for a native exam category, even if a
// subpath happens to be 4 levels deep (e.g. monthly-magazine/2026/January/
// "Jan 01.json" — 4 segments, and "January" would coincidentally NOT parse
// as a year, but relying on that coincidence is fragile, so we exclude these
// folders by name explicitly instead).
const RESERVED_CATEGORY_FOLDERS = new Set(['current-affairs', 'chapters', 'monthly-magazine', 'registry']);

/** "../data/ssc/ssc-chsl/2026/mathematics.json" → { category: "ssc", examId: "ssc-chsl", year: 2026, subjectId: "mathematics" } */
function parseNativePath(globKey: string): { examId: string; year: number; subjectId: string } | null {
  const marker = '/data/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const rel = globKey.slice(idx + marker.length); // "ssc/ssc-chsl/2026/mathematics.json"
  const parts = rel.split('/');
  if (parts.length !== 4) return null;
  const [category, examId, yearStr, fileName] = parts;
  if (RESERVED_CATEGORY_FOLDERS.has(category)) return null;
  if (!/^\d{4}$/.test(yearStr)) return null; // strict: exactly 4 digits, not just "parses as a number"
  const year = Number(yearStr);
  const subjectId = fileName.replace(/\.json$/i, '');
  if (!examId || !subjectId) return null;
  return { examId, year, subjectId };
}

let _nativeCache: UniversalQuestion[] | null = null;

async function loadNativeUniversalQuestions(): Promise<UniversalQuestion[]> {
  if (_nativeCache) return _nativeCache;
  const all: UniversalQuestion[] = [];

  for (const [globKey, loader] of Object.entries(nativeModules)) {
    const parsed = parseNativePath(globKey);
    if (!parsed) continue; // doesn't match the 4-level exam/year/subject convention — skip rather than guess
    const { examId, year, subjectId } = parsed;

    const mod = await loader();
    const entries = mod.default;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      all.push({
        id: `${examId}-${year}-${subjectId}-${entry.id}`,
        examIds: [examId],
        subjectId,
        topicId: entry.topicId,
        subtopicId: entry.subtopicId,
        questionType: entry.questionType ?? 'mcq',
        question: entry.question,
        options: entry.options,
        correctAnswer: entry.correctAnswer,
        explanation: entry.explanation,
        difficulty: entry.difficulty ?? 'medium',
        language: entry.language ?? 'hi',
        year,
        source: entry.source,
        tags: entry.tags,
      });
    }
  }

  _nativeCache = all;
  return all;
}

// ─── Exam-specific mocks ────────────────────────────────────────────────────
// src/data/{examId}/mock/{fileName}.json — unlike the single-subject native
// loader above, a mock file is inherently MULTI-subject (a full mock mixes
// English+Reasoning+Maths+GA), so each entry declares its own `subjectId`
// rather than inferring it from the path. This is source B of the Practice
// page's three content sources (product-refactor §56).

// NOTE: uses `**` (not a single `*`) so an examId may sit directly under
// data/ (data/ssc-chsl/mock/mock01.json) OR nested under an organizational
// category folder, matching the same category/examId nesting the native
// loader above already allows (data/ssc/ssc-chsl/mock/mock01.json). Only the
// path segment immediately before "mock" is treated as the examId, so this
// is a superset of the old exact-3-segment pattern — nothing that matched
// before stops matching.
const mockModules = import.meta.glob<{ default: MockFileEntry[] }>(
  '../data/**/mock/*.json',
  { eager: false }
);

interface MockFileEntry extends NativeQuestionFileEntry {
  subjectId: string;
}

// Folders that are never an examId, even though `**/mock/*.json` could
// theoretically match something unrelated — defense in depth alongside the
// "examId is whatever sits directly before /mock/" rule below.
const RESERVED_TOP_FOLDERS = new Set(['current-affairs', 'chapters', 'monthly-magazine', 'registry', 'syllabus', 'miscellaneous']);

function parseMockPath(globKey: string): { examId: string; fileName: string } | null {
  const marker = '/data/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + marker.length).split('/'); // [...categoryFolders, examId, "mock", "mock01.json"]
  const mockIdx = parts.lastIndexOf('mock');
  // "mock" must be the second-to-last segment (immediately before the filename),
  // and there must be at least one segment before it to serve as examId.
  if (mockIdx < 1 || mockIdx !== parts.length - 2) return null;
  const examId = parts[mockIdx - 1];
  const fileName = parts[parts.length - 1];
  if (RESERVED_TOP_FOLDERS.has(examId)) return null;
  return { examId, fileName: fileName.replace(/\.json$/i, '') };
}

let _mockCache: UniversalQuestion[] | null = null;

async function loadExamMockQuestions(): Promise<UniversalQuestion[]> {
  if (_mockCache) return _mockCache;
  const all: UniversalQuestion[] = [];

  for (const [globKey, loader] of Object.entries(mockModules)) {
    const parsed = parseMockPath(globKey);
    if (!parsed) continue;
    const { examId, fileName } = parsed;

    const mod = await loader();
    const entries = mod.default;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      all.push({
        id: `${examId}-mock-${fileName}-${entry.id}`,
        examIds: [examId],
        subjectId: entry.subjectId,
        topicId: entry.topicId,
        subtopicId: entry.subtopicId,
        questionType: entry.questionType ?? 'mcq',
        question: entry.question,
        options: entry.options,
        correctAnswer: entry.correctAnswer,
        explanation: entry.explanation,
        difficulty: entry.difficulty ?? 'medium',
        language: entry.language ?? 'hi',
        source: `mock:${fileName}`,
        tags: entry.tags,
      });
    }
  }

  _mockCache = all;
  return all;
}

// ─── Miscellaneous subject tests ────────────────────────────────────────────
// src/data/miscellaneous/{subjectId}/{fileName}.json — single-subject, but
// deliberately NOT tied to one exam (product-refactor §57). `examIds` is
// computed from examRegistry: every exam whose configured syllabus already
// includes this subject gets this content automatically — reusing the
// universal question model's existing multi-exam-membership design
// (Phase 1) rather than inventing a wildcard "applies everywhere" marker.

const miscModules = import.meta.glob<{ default: NativeQuestionFileEntry[] }>(
  '../data/miscellaneous/*/*.json',
  { eager: false }
);

function parseMiscPath(globKey: string): { subjectId: string; fileName: string } | null {
  const marker = '/data/miscellaneous/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + marker.length).split('/'); // [subjectId, "test 01.json"]
  if (parts.length !== 2) return null;
  const [subjectId, fileName] = parts;
  if (!subjectId || !fileName) return null;
  return { subjectId, fileName: fileName.replace(/\.json$/i, '') };
}

function examIdsForSubject(subjectId: string): string[] {
  return examRegistry.getAllExams()
    .filter((exam) => exam.subjects.some((s) => s.subjectId === subjectId))
    .map((exam) => exam.id);
}

let _miscCache: UniversalQuestion[] | null = null;

async function loadMiscellaneousQuestions(): Promise<UniversalQuestion[]> {
  if (_miscCache) return _miscCache;
  const all: UniversalQuestion[] = [];

  for (const [globKey, loader] of Object.entries(miscModules)) {
    const parsed = parseMiscPath(globKey);
    if (!parsed) continue;
    const { subjectId, fileName } = parsed;
    const examIds = examIdsForSubject(subjectId);
    if (examIds.length === 0) continue; // no exam currently lists this subject — nothing would ever surface it, skip rather than orphan it

    const mod = await loader();
    const entries = mod.default;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      all.push({
        id: `misc-${subjectId}-${normalize(fileName)}-${entry.id}`,
        examIds,
        subjectId,
        topicId: entry.topicId,
        subtopicId: entry.subtopicId,
        questionType: entry.questionType ?? 'mcq',
        question: entry.question,
        options: entry.options,
        correctAnswer: entry.correctAnswer,
        explanation: entry.explanation,
        difficulty: entry.difficulty ?? 'medium',
        language: entry.language ?? 'hi',
        source: `miscellaneous:${fileName}`,
        tags: entry.tags,
      });
    }
  }

  _miscCache = all;
  return all;
}

// ─── Universal Chapter test questions (canonical structure) ────────────────
// src/data/chapters/{subjectId}/{chapterId}/{testFile}.json — the canonical
// two-level Universal Chapter layout (see universalChapterRepository.ts,
// which owns discovery/display for the chapter itself; this is only the
// question-pool side, so Practice/Test/Mixed Revision — the SAME universal
// session engine as everywhere else — can find these questions too).
// Deliberately a distinct glob from the flat legacy `chapters/**/*.json`
// used by chapterRepository.ts/loadChapterWiseCurrentAffairsQuestions below
// — `*/*/*.json` only ever matches exactly subjectId/chapterId/file.json,
// so the two structures can never double-count each other's files.
const canonicalChapterModules = import.meta.glob<{ default: NativeQuestionFileEntry[] }>(
  '../data/chapters/*/*/*.json',
  { eager: false }
);

// A chapter question's Markdown body can optionally live in its own file —
// "questionFile": "questions/q05.md" — instead of inline in the JSON, the
// same "authoring convenience, resolved once at load time" pattern
// mockQuestionContentRepository.ts already uses for folder-based mocks.
const canonicalQuestionFileModules = import.meta.glob<string>(
  '../data/chapters/*/*/questions/*.md',
  { eager: true, query: '?raw', import: 'default' }
);

interface CanonicalChapterEntry extends NativeQuestionFileEntry {
  subjectId?: string;
  examId?: string;
  sourceMeta?: { exam?: string };
  /** e.g. "questions/q05.md" — relative to the chapter's own folder. */
  questionFile?: string;
}

function parseCanonicalChapterPath(globKey: string): { subjectId: string; chapterId: string; fileName: string } | null {
  const marker = '/data/chapters/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + marker.length).split('/'); // [subjectId, chapterId, "test01.json"] — exactly 3 by construction of the glob pattern
  if (parts.length !== 3) return null;
  const [subjectId, chapterId, fileName] = parts;
  if (!subjectId || !chapterId || !fileName) return null;
  return { subjectId, chapterId, fileName: fileName.replace(/\.json$/i, '') };
}

/** Folder containing this chapter's `assets/` and `questions/` subfolders — the same baseDir convention resolveMockAsset()/resolveQuestionMarkdown() already use for folder-based mocks. */
export function canonicalChapterBaseDir(subjectId: string, chapterId: string): string {
  return `../data/chapters/${subjectId}/${chapterId}/`;
}

let _canonicalChapterCache: UniversalQuestion[] | null = null;

async function loadCanonicalChapterQuestions(): Promise<UniversalQuestion[]> {
  if (_canonicalChapterCache) return _canonicalChapterCache;
  const all: UniversalQuestion[] = [];

  for (const [globKey, loader] of Object.entries(canonicalChapterModules)) {
    const parsed = parseCanonicalChapterPath(globKey);
    if (!parsed) continue;
    const { subjectId: folderSubjectId, chapterId, fileName } = parsed;
    const baseDir = canonicalChapterBaseDir(folderSubjectId, chapterId);

    const mod = await loader();
    const entries = mod.default as CanonicalChapterEntry[];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      // Preserve an explicitly-authored subjectId/topicId; otherwise derive
      // from the folder itself, and topicId defaults to the chapter's own id
      // (master prompt "Chapter Question Derivation").
      const subjectId = entry.subjectId ?? folderSubjectId;
      const topicId = entry.topicId ?? chapterId;

      const restrictedExamId = entry.examId ?? entry.sourceMeta?.exam;
      const examIds = restrictedExamId ? [restrictedExamId] : examIdsForSubject(subjectId);
      if (examIds.length === 0) continue; // not on any exam's syllabus yet — nothing would ever surface it

      let question = entry.question;
      if (entry.questionFile) {
        const fileGlobKey = `${baseDir}${entry.questionFile}`;
        const resolved = canonicalQuestionFileModules[fileGlobKey];
        if (resolved) question = resolved;
        else console.warn(`[UniversalChapterRepository] questionFile not found: ${entry.questionFile} (chapter ${folderSubjectId}/${chapterId})`);
      }

      all.push({
        id: `chapter-${folderSubjectId}-${chapterId}-${normalize(fileName)}-${entry.id}`,
        examIds,
        subjectId,
        topicId,
        subtopicId: entry.subtopicId,
        questionType: entry.questionType ?? 'mcq',
        question,
        options: entry.options,
        correctAnswer: entry.correctAnswer,
        explanation: entry.explanation,
        difficulty: entry.difficulty ?? 'medium',
        language: entry.language ?? 'hi',
        source: `chapter:${folderSubjectId}/${chapterId}/${fileName}`,
        tags: entry.tags,
        sourceMockBaseDir: baseDir,
      });
    }
  }

  _canonicalChapterCache = all;
  return all;
}

// ─── In-memory cache ────────────────────────────────────────────────────────
// Bundled JSON is immutable content (master prompt §41) — safe to cache for
// the session once loaded. Never cache user state (attempts/bookmarks) here.

let _dailyCache: UniversalQuestion[] | null = null;
let _chapterCache: UniversalQuestion[] | null = null;
let _mockSourceCache: UniversalQuestion[] | null = null;

async function loadMockSourceQuestions(): Promise<UniversalQuestion[]> {
  if (_mockSourceCache) return _mockSourceCache;
  _mockSourceCache = await getAllMockSourceUniversalQuestions();
  return _mockSourceCache;
}

async function loadDailyCurrentAffairsQuestions(): Promise<UniversalQuestion[]> {
  if (_dailyCache) return _dailyCache;
  const repo = getQuizRepository();
  const fileNames = await repo.getAvailableFileNames();
  const all: UniversalQuestion[] = [];

  for (const fileName of fileNames) {
    const quiz = await repo.getQuizByFileName(fileName);
    if (!quiz) continue;
    const date = parseDateFromFileName(fileName);
    const isoDate = date ? date.toISOString().slice(0, 10) : undefined;
    all.push(
      ...convertDailyQuiz(quiz, {
        idPrefix: `current-affairs-daily-${fileName.replace(/\.json$/i, '')}`,
        examIds: ['current-affairs'],
        subjectId: 'current-affairs',
        isCurrentAffairs: true,
        currentAffairDate: isoDate,
        source: fileName,
      })
    );
  }

  _dailyCache = all;
  return all;
}

async function loadChapterWiseCurrentAffairsQuestions(): Promise<UniversalQuestion[]> {
  if (_chapterCache) return _chapterCache;
  const chapters = getChapterList();
  const all: UniversalQuestion[] = [];

  for (const chapter of chapters) {
    const topicId = resolveTopicId(chapter.chapterName);
    for (const test of chapter.tests) {
      const quiz = await loadChapterTest(test.relPath);
      if (!quiz) continue;
      all.push(
        ...convertDailyQuiz(quiz, {
          idPrefix: `current-affairs-chapter-${normalize(chapter.chapterName)}-${normalize(test.label)}`,
          examIds: ['current-affairs'],
          subjectId: 'current-affairs',
          topicId,
          isCurrentAffairs: true,
          source: `${chapter.chapterName}/${test.label}`,
        })
      );
    }
  }

  _chapterCache = all;
  return all;
}

/** All questions currently loadable in the app, across every source. Cached after first call. */
async function loadAllQuestions(): Promise<UniversalQuestion[]> {
  const [daily, chapterWise, canonicalChapter, native, mocks, misc, mockSource] = await Promise.all([
    loadDailyCurrentAffairsQuestions(),
    loadChapterWiseCurrentAffairsQuestions(),
    loadCanonicalChapterQuestions(),
    loadNativeUniversalQuestions(),
    loadExamMockQuestions(),
    loadMiscellaneousQuestions(),
    loadMockSourceQuestions(),
  ]);
  // De-dupe by id defensively — every source uses a disjoint id prefix so
  // collisions shouldn't happen, but a repository consumer should never have
  // to worry about it either way.
  const seen = new Map<string, UniversalQuestion>();
  for (const q of [...daily, ...chapterWise, ...canonicalChapter, ...native, ...mocks, ...misc, ...mockSource]) seen.set(q.id, q);
  return Array.from(seen.values());
}

/** Clears the in-memory content cache. Call after content is re-imported/updated at runtime (rare). */
export function clearQuestionCache(): void {
  _dailyCache = null;
  _chapterCache = null;
  _canonicalChapterCache = null;
  _nativeCache = null;
  _mockCache = null;
  _miscCache = null;
  _mockSourceCache = null;
  clearMockSourceCache();
}

// ─── Public repository API (master prompt §14) ────────────────────────────────

export async function getQuestions(): Promise<UniversalQuestion[]> {
  return loadAllQuestions();
}

export async function getQuestionsByExam(examId: string): Promise<UniversalQuestion[]> {
  const all = await loadAllQuestions();
  return all.filter((q) => q.examIds.includes(examId));
}

export async function getQuestionsBySubject(subjectId: string): Promise<UniversalQuestion[]> {
  const all = await loadAllQuestions();
  return all.filter((q) => q.subjectId === subjectId);
}

export async function getQuestionsByTopic(topicId: string): Promise<UniversalQuestion[]> {
  const all = await loadAllQuestions();
  return all.filter((q) => q.topicId === topicId);
}

export async function getQuestionsByDifficulty(difficulty: Difficulty): Promise<UniversalQuestion[]> {
  const all = await loadAllQuestions();
  return all.filter((q) => q.difficulty === difficulty);
}

export async function getQuestionsByYear(year: number): Promise<UniversalQuestion[]> {
  const all = await loadAllQuestions();
  return all.filter((q) => q.year === year);
}

export async function searchQuestions(query: string): Promise<UniversalQuestion[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await loadAllQuestions();
  return all.filter(
    (item) =>
      item.question.toLowerCase().includes(q) ||
      item.explanation?.toLowerCase().includes(q) ||
      item.tags?.some((t) => t.toLowerCase().includes(q))
  );
}

export async function getRandomQuestions(count: number, from?: UniversalQuestion[]): Promise<UniversalQuestion[]> {
  const pool = from ?? (await loadAllQuestions());
  const shuffled = [...pool];
  // Fisher-Yates — same algorithm already used elsewhere in the app for mixed revision.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Wrong/bookmarked/weak/unattempted question sets depend on USER state
 * (wrongQuestionsStore, bookmarkStore, attempt history), not content. This
 * repository intentionally does not own that state — it only resolves ids
 * you already have back into full UniversalQuestion objects, so the existing
 * stores remain the single source of truth for user data (master prompt §22, §41).
 */
export async function resolveQuestionsByIds(ids: string[]): Promise<UniversalQuestion[]> {
  const all = await loadAllQuestions();
  const byId = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter((q): q is UniversalQuestion => Boolean(q));
}

// ─── Dynamic content discovery ─────────────────────────────────────────────────
// Exam configuration (examRegistry.ts) says what a syllabus SHOULD contain.
// These functions say what actually HAS content, derived from the live
// question pool — never from a second manually-maintained list. This is the
// one place these queries are implemented; examService's syllabus view
// composes these rather than re-deriving counts itself (no duplicate logic).

export interface AvailableSubject {
  subjectId: string;
  questionCount: number;
}

export interface AvailableTopic {
  topicId: string;
  topicName: string;
  questionCount: number;
}

export interface ContentSummary {
  examId: string;
  years: number[];
  subjects: { subjectId: string; questionCount: number; topics: AvailableTopic[] }[];
}

export async function getAvailableYears(examId: string): Promise<number[]> {
  const pool = await getQuestionsByExam(examId);
  const years = new Set(pool.map((q) => q.year).filter((y): y is number => typeof y === 'number'));
  return Array.from(years).sort((a, b) => b - a);
}

export async function getAvailableSubjects(examId: string): Promise<AvailableSubject[]> {
  const pool = await getQuestionsByExam(examId);
  const counts = new Map<string, number>();
  for (const q of pool) counts.set(q.subjectId, (counts.get(q.subjectId) ?? 0) + 1);
  return Array.from(counts.entries()).map(([subjectId, questionCount]) => ({ subjectId, questionCount }));
}

export async function getAvailableTopics(examId: string, subjectId: string): Promise<AvailableTopic[]> {
  const pool = (await getQuestionsByExam(examId)).filter((q) => q.subjectId === subjectId && q.topicId);
  const counts = new Map<string, number>();
  for (const q of pool) counts.set(q.topicId!, (counts.get(q.topicId!) ?? 0) + 1);
  return Array.from(counts.entries()).map(([topicId, questionCount]) => ({
    topicId,
    questionCount,
    topicName: getTopicDisplayName(subjectId, topicId),
  }));
}

export async function getQuestionCount(examId: string, subjectId: string): Promise<number> {
  const pool = await getQuestionsByExam(examId);
  return pool.filter((q) => q.subjectId === subjectId).length;
}

export async function getQuestionCountByTopic(examId: string, subjectId: string, topicId: string): Promise<number> {
  const pool = await getQuestionsByExam(examId);
  return pool.filter((q) => q.subjectId === subjectId && q.topicId === topicId).length;
}

/** Everything a dynamic syllabus/content UI needs for one exam, in a single call. */
export async function getContentSummary(examId: string): Promise<ContentSummary> {
  const pool = await getQuestionsByExam(examId);
  const years = Array.from(new Set(pool.map((q) => q.year).filter((y): y is number => typeof y === 'number'))).sort((a, b) => b - a);

  const bySubject = new Map<string, UniversalQuestion[]>();
  for (const q of pool) {
    const arr = bySubject.get(q.subjectId) ?? [];
    arr.push(q);
    bySubject.set(q.subjectId, arr);
  }

  const subjects = Array.from(bySubject.entries()).map(([subjectId, questions]) => {
    const topicCounts = new Map<string, number>();
    for (const q of questions) if (q.topicId) topicCounts.set(q.topicId, (topicCounts.get(q.topicId) ?? 0) + 1);
    const topics = Array.from(topicCounts.entries()).map(([topicId, questionCount]) => ({
      topicId,
      questionCount,
      topicName: getTopicDisplayName(subjectId, topicId),
    }));
    return { subjectId, questionCount: questions.length, topics };
  });

  return { examId, years, subjects };
}

/**
 * Questions in the pool that have never been attempted, per the universal
 * attempt ledger (services/attemptLedgerService.ts). Scoped to an exam since
 * "unattempted" only makes sense relative to a syllabus. Only as complete as
 * the ledger itself — see attemptLedgerService's doc comment for exactly
 * which sessions feed it.
 */
export async function getUnattemptedQuestions(examId: string): Promise<UniversalQuestion[]> {
  const [pool, attemptedIds] = await Promise.all([
    getQuestionsByExam(examId),
    import('./attemptLedgerService').then((m) => m.getAttemptedQuestionIds(examId)),
  ]);
  return pool.filter((q) => !attemptedIds.has(q.id));
}

/** Validates every loaded question and reports problems instead of silently rendering broken content (master prompt §82). */
export async function validateAllQuestions(): Promise<{ total: number; invalid: { questionId: string; reason: string }[] }> {
  const all = await loadAllQuestions();
  const invalid = all.flatMap((q) => validateUniversalQuestion(q));
  return { total: all.length, invalid };
}
