import type { DailyQuiz } from '../types';
import { getRawMarkdownGlobKeys, loadMarkdownByGlobKey } from './markdownRepository';

// ─── Chapter glob ─────────────────────────────────────────────────────────────
// `**` recurses into per-chapter subfolders, e.g.
//   data/chapters/Budget/Budget 01.json
//   data/chapters/Budget/Budget 02.json
//   data/chapters/Budget/Budget.md
// A chapter is a FOLDER. The folder name is always the chapter title —
// never derived from the file names inside it. Every .json file inside the
// folder is a separate Test; the first .md file found is the Revision
// content. Names never need to match each other.

const jsonModules = import.meta.glob<{ default: DailyQuiz }>(
  '../data/chapters/**/*.json',
  { eager: false }
);

const CHAPTERS_ROOT_MARKER = '/data/chapters/';

/** "../data/chapters/Budget/Budget 02.json" → "Budget/Budget 02.json" */
function relativeToChaptersRoot(globKey: string): string {
  const idx = globKey.indexOf(CHAPTERS_ROOT_MARKER);
  if (idx >= 0) return globKey.slice(idx + CHAPTERS_ROOT_MARKER.length);
  return globKey.split('/').pop() ?? globKey;
}

/**
 * The chapter name is the immediate parent folder.
 * Legacy fallback: a file placed directly under data/chapters/ with no
 * subfolder uses its own base name as the chapter name, so any old flat
 * files keep working unchanged.
 */
function folderNameOf(relPath: string): string {
  const parts = relPath.split('/');
  if (parts.length === 1) return parts[0].replace(/\.(json|md)$/i, '');
  return parts[0];
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ─── Chapter info ─────────────────────────────────────────────────────────────

export interface ChapterTest {
  relPath: string;   // unique key, e.g. "Budget/Budget 02.json"
  label: string;      // "Test 01", "Test 02", ... — assigned by stable order, not filename
}

export interface ChapterInfo {
  chapterName: string;       // folder name = chapter title (also the unique key)
  tests: ChapterTest[];       // every JSON file inside the folder
  mdRelPath: string | null;   // first markdown file found in the folder, or null
  mdGlobKey: string | null;   // the original glob key needed to actually load it
}

let _chapterList: ChapterInfo[] | null = null;

export function getChapterList(): ChapterInfo[] {
  if (_chapterList) return _chapterList;

  type Entry = { jsonPaths: string[]; mdPaths: { relPath: string; globKey: string }[] };
  const byChapter = new Map<string, Entry>();

  for (const globKey of Object.keys(jsonModules)) {
    const relPath = relativeToChaptersRoot(globKey);
    const chapter = folderNameOf(relPath);
    const entry = byChapter.get(chapter) ?? { jsonPaths: [], mdPaths: [] };
    entry.jsonPaths.push(relPath);
    byChapter.set(chapter, entry);
  }

  for (const globKey of getRawMarkdownGlobKeys()) {
    const relPath = relativeToChaptersRoot(globKey);
    const chapter = folderNameOf(relPath);
    const entry = byChapter.get(chapter) ?? { jsonPaths: [], mdPaths: [] };
    entry.mdPaths.push({ relPath, globKey });
    byChapter.set(chapter, entry);
  }

  _chapterList = Array.from(byChapter.entries())
    .map(([chapterName, { jsonPaths, mdPaths }]) => {
      const sortedJson = [...jsonPaths].sort(naturalCompare);
      const sortedMd = [...mdPaths].sort((a, b) => naturalCompare(a.relPath, b.relPath));
      const firstMd = sortedMd[0] ?? null;
      return {
        chapterName,
        tests: sortedJson.map((relPath, i) => ({
          relPath,
          label: `Test ${String(i + 1).padStart(2, '0')}`,
        })),
        mdRelPath: firstMd?.relPath ?? null,
        mdGlobKey: firstMd?.globKey ?? null,
      };
    })
    .sort((a, b) => a.chapterName.localeCompare(b.chapterName));

  return _chapterList;
}

export function getChapterByName(chapterName: string): ChapterInfo | undefined {
  return getChapterList().find((c) => c.chapterName === chapterName);
}

/** Derive the owning chapter (folder) name from a test's relPath. */
export function getChapterNameForTestPath(relPath: string): string {
  return folderNameOf(relPath);
}

/** Every test relPath across every chapter — used to detect "is this fileName a chapter quiz?" */
export function getAllChapterTestPaths(): Set<string> {
  const set = new Set<string>();
  getChapterList().forEach((c) => c.tests.forEach((t) => set.add(t.relPath)));
  return set;
}

// ─── Revision (markdown) loading ──────────────────────────────────────────────

export async function loadChapterMarkdown(chapterName: string): Promise<string | null> {
  const chapter = getChapterByName(chapterName);
  if (!chapter || !chapter.mdGlobKey) return null;
  return loadMarkdownByGlobKey(chapter.mdGlobKey);
}

export function chapterHasMarkdown(chapterName: string): boolean {
  return getChapterByName(chapterName)?.mdRelPath != null;
}

// ─── Test (JSON quiz) loading ─────────────────────────────────────────────────

const _quizCache = new Map<string, DailyQuiz | null>();

/** Load a single test by its relPath, e.g. "Budget/Budget 02.json". */
export async function loadChapterTest(relPath: string): Promise<DailyQuiz | null> {
  if (_quizCache.has(relPath)) return _quizCache.get(relPath)!;

  const globKey = Object.keys(jsonModules).find((k) => relativeToChaptersRoot(k) === relPath);
  if (!globKey) {
    _quizCache.set(relPath, null);
    return null;
  }

  try {
    const mod = await jsonModules[globKey]();
    if (!mod.default?.questions?.length) {
      _quizCache.set(relPath, null);
      return null;
    }
    const chapterName = folderNameOf(relPath);
    const test = getChapterByName(chapterName)?.tests.find((t) => t.relPath === relPath);
    const quiz: DailyQuiz = {
      ...mod.default,
      date: test ? `${chapterName} — ${test.label}` : chapterName,
    };
    _quizCache.set(relPath, quiz);
    return quiz;
  } catch (err) {
    console.error(`[ChapterRepository] Failed to load ${relPath}:`, err);
    _quizCache.set(relPath, null);
    return null;
  }
}

/** Total question count across every test in a chapter (lazy, cached per test). */
export async function getChapterTotalQuestions(chapterName: string): Promise<number> {
  const chapter = getChapterByName(chapterName);
  if (!chapter) return 0;
  const quizzes = await Promise.all(chapter.tests.map((t) => loadChapterTest(t.relPath)));
  return quizzes.reduce((sum, q) => sum + (q?.questions.length ?? 0), 0);
}

/** Load and merge ALL tests within the given chapters into one combined quiz (for mixed revision). */
export async function loadMixedChapters(chapterNames: string[]): Promise<DailyQuiz | null> {
  if (chapterNames.length === 0) return null;

  const relPaths = chapterNames.flatMap(
    (name) => getChapterByName(name)?.tests.map((t) => t.relPath) ?? []
  );
  if (relPaths.length === 0) return null;

  const results = await Promise.all(relPaths.map(loadChapterTest));
  const valid = results.filter((q): q is DailyQuiz => q !== null);
  if (valid.length === 0) return null;

  // Merge all questions, re-assign sequential IDs to avoid collisions
  let idCounter = 1;
  const allQuestions = valid.flatMap((q) =>
    q.questions.map((question) => ({ ...question, id: idCounter++ }))
  );

  return {
    date: `Mixed: ${chapterNames.join(', ')}`,
    questions: allQuestions,
  };
}
