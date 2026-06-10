import type { DailyQuiz } from '../types';

// ─── Chapter glob ─────────────────────────────────────────────────────────────
// Separate glob from the date-based quiz files.
// All files in src/data/chapters/*.json are chapter quizzes.

const chapterModules = import.meta.glob<{ default: DailyQuiz }>(
  '../data/chapters/*.json',
  { eager: false }
);

function pathToChapterName(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.json$/i, '');
}

function pathToFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

// ─── Chapter info ─────────────────────────────────────────────────────────────

export interface ChapterInfo {
  fileName: string;      // e.g. "Sports.json"
  chapterName: string;   // e.g. "Sports"
}

let _chapterList: ChapterInfo[] | null = null;

export function getChapterList(): ChapterInfo[] {
  if (_chapterList) return _chapterList;
  _chapterList = Object.keys(chapterModules).map((path) => ({
    fileName: pathToFileName(path),
    chapterName: pathToChapterName(path),
  }));
  return _chapterList;
}

// ─── Loading ──────────────────────────────────────────────────────────────────

const _cache = new Map<string, DailyQuiz | null>();

export async function loadChapterByFileName(fileName: string): Promise<DailyQuiz | null> {
  if (_cache.has(fileName)) return _cache.get(fileName)!;

  // Find matching path in glob map
  const entry = Object.entries(chapterModules).find(([path]) => pathToFileName(path) === fileName);
  if (!entry) {
    _cache.set(fileName, null);
    return null;
  }

  try {
    const mod = await entry[1]();
    if (!mod.default?.questions?.length) {
      _cache.set(fileName, null);
      return null;
    }
    // Inject chapter name as the date field so the quiz header shows something meaningful
    const quiz: DailyQuiz = {
      ...mod.default,
      date: pathToChapterName(entry[0]),
    };
    _cache.set(fileName, quiz);
    return quiz;
  } catch (err) {
    console.error(`[ChapterRepository] Failed to load ${fileName}:`, err);
    _cache.set(fileName, null);
    return null;
  }
}

/** Load multiple chapters and merge into one combined quiz (for mixed revision). */
export async function loadMixedChapters(fileNames: string[]): Promise<DailyQuiz | null> {
  if (fileNames.length === 0) return null;

  const results = await Promise.all(fileNames.map(loadChapterByFileName));
  const valid = results.filter((q): q is DailyQuiz => q !== null);
  if (valid.length === 0) return null;

  // Merge all questions, re-assign sequential IDs to avoid collisions
  let idCounter = 1;
  const allQuestions = valid.flatMap((q) =>
    q.questions.map((question) => ({ ...question, id: idCounter++ }))
  );

  const chapterNames = fileNames
    .map((f) => f.replace(/\.json$/i, ''))
    .join(', ');

  return {
    date: `Mixed: ${chapterNames}`,
    questions: allQuestions,
  };
}
