import type { DailyQuiz } from '../types';
import { getRawMarkdownGlobKeys, loadMarkdownByGlobKey } from './markdownRepository';

// ─── Chapter glob ─────────────────────────────────────────────────────────────
// `**` recurses into per-chapter subfolders, e.g.
//   data/chapters/Budget/Budget 01.json
//   data/chapters/Budget/Budget 02.json
//   data/chapters/Budget/Budget.md
// A chapter is a FOLDER. The folder name is always the chapter title —
// never derived from the file names inside it. Every .json file inside the
// folder is a separate Test; every .md file becomes a Part, in natural sort
// order (a folder with just one .md file is the common case and displays as
// plain "Revision" rather than "Part 1" — see ChapterDetailPage). Names never
// need to match each other or the folder.

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

/**
 * Legacy chapters are exactly ONE folder deep: data/chapters/<Name>/<file>.
 * The newer canonical structure nests a subject folder above the chapter
 * folder — data/chapters/<subjectId>/<chapterId>/<file> — one level deeper.
 * Without this guard, a canonical file would flow through folderNameOf()
 * above (which only ever looks at parts[0]) and get silently merged into a
 * bogus "chapter" named after its subject folder. universalChapterRepository
 * owns discovery of the canonical structure; this repository only ever
 * touches genuinely flat, legacy paths.
 */
function isLegacyRelPath(relPath: string): boolean {
  return relPath.split('/').length <= 2;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ─── Chapter info ─────────────────────────────────────────────────────────────

export interface ChapterTest {
  relPath: string;   // unique key, e.g. "Budget/Budget 02.json"
  label: string;      // "Test 01", "Test 02", ... — assigned by stable order, not filename
}

export interface ChapterPart {
  relPath: string;    // e.g. "Budget/Part 2.md" — unique key
  globKey: string;    // needed to actually load it via markdownRepository
  label: string;       // "Part 1", "Part 2", ... assigned by stable order
}

export interface ChapterInfo {
  chapterName: string;       // folder name = chapter title (also the unique key)
  tests: ChapterTest[];       // every JSON file inside the folder
  parts: ChapterPart[];        // every markdown file inside the folder, in order (often just one)
}

let _chapterList: ChapterInfo[] | null = null;

export function getChapterList(): ChapterInfo[] {
  if (_chapterList) return _chapterList;

  type Entry = { jsonPaths: string[]; mdPaths: { relPath: string; globKey: string }[] };
  const byChapter = new Map<string, Entry>();

  for (const globKey of Object.keys(jsonModules)) {
    const relPath = relativeToChaptersRoot(globKey);
    if (!isLegacyRelPath(relPath)) continue; // canonical subjectId/chapterId/file.json — not this repository's concern
    const chapter = folderNameOf(relPath);
    const entry = byChapter.get(chapter) ?? { jsonPaths: [], mdPaths: [] };
    entry.jsonPaths.push(relPath);
    byChapter.set(chapter, entry);
  }

  for (const globKey of getRawMarkdownGlobKeys()) {
    const relPath = relativeToChaptersRoot(globKey);
    if (!isLegacyRelPath(relPath)) continue; // canonical subjectId/chapterId/notes.md — not this repository's concern
    const chapter = folderNameOf(relPath);
    const entry = byChapter.get(chapter) ?? { jsonPaths: [], mdPaths: [] };
    entry.mdPaths.push({ relPath, globKey });
    byChapter.set(chapter, entry);
  }

  _chapterList = Array.from(byChapter.entries())
    .map(([chapterName, { jsonPaths, mdPaths }]) => {
      const sortedJson = [...jsonPaths].sort(naturalCompare);
      const sortedMd = [...mdPaths].sort((a, b) => naturalCompare(a.relPath, b.relPath));
      return {
        chapterName,
        tests: sortedJson.map((relPath, i) => ({
          relPath,
          label: `Test ${String(i + 1).padStart(2, '0')}`,
        })),
        parts: sortedMd.map(({ relPath, globKey }, i) => ({
          relPath,
          globKey,
          label: `Part ${i + 1}`,
        })),
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

// ─── Revision (markdown) loading — ALL parts, not just the first ─────────────

export async function loadChapterParts(chapterName: string): Promise<{ label: string; content: string }[]> {
  const chapter = getChapterByName(chapterName);
  if (!chapter || chapter.parts.length === 0) return [];

  const loaded = await Promise.all(
    chapter.parts.map(async (p) => ({
      label: p.label,
      content: await loadMarkdownByGlobKey(p.globKey),
    }))
  );

  return loaded.filter((p): p is { label: string; content: string } => p.content !== null);
}

export function chapterHasMarkdown(chapterName: string): boolean {
  return (getChapterByName(chapterName)?.parts.length ?? 0) > 0;
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
