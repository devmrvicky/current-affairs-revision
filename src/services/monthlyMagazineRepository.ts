import type { DailyQuiz, MonthlyMagazineIssue, MonthlyMagazinePart, MonthlyMagazineTest } from '../types';
import { getMonthlyMagazineMarkdownGlobKeys, loadMarkdownByGlobKey } from './markdownRepository';

// ─── Monthly Magazine glob ─────────────────────────────────────────────────────
// Folder structure (source of truth — never inferred from filenames):
//   data/monthly-magazine/2025/june/june.md
//   data/monthly-magazine/2025/june/june 01.json
//   data/monthly-magazine/2025/june/june 02.json
// The Year is the first folder segment, the Month is the second — folder
// names are typically lowercase ("june"), but ARE case-insensitive: every
// month folder normalizes to its canonical display form ("June") regardless
// of how it's actually cased on disk. Every .md file in the folder becomes a
// Part (in natural sort order); every .json file becomes a Test. Filenames
// themselves are NEVER parsed for meaning ("june.md", "Part 1.md", whatever
// convention is used doesn't matter) — only file TYPE and folder position do.
// Unlike chapterRepository, ALL markdown parts are kept (not just the first)
// — this system was built multi-part-first.

const jsonModules = import.meta.glob<{ default: DailyQuiz }>(
  '../data/monthly-magazine/**/*.json',
  { eager: false }
);

const MAGAZINE_ROOT_MARKER = '/data/monthly-magazine/';

/** "../data/monthly-magazine/2025/june/june.md" → "2025/june/june.md" */
function relativeToMagazineRoot(globKey: string): string {
  const idx = globKey.indexOf(MAGAZINE_ROOT_MARKER);
  if (idx >= 0) return globKey.slice(idx + MAGAZINE_ROOT_MARKER.length);
  return globKey.split('/').pop() ?? globKey;
}

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "june" / "JUNE" / "June" → "June". Falls back to a simple capitalization
 * for anything that isn't a recognized month name, rather than throwing —
 * a typo'd folder name should still show up in the list, just unsorted. */
function normalizeMonthName(raw: string): string {
  const match = MONTH_ORDER.find((m) => m.toLowerCase() === raw.toLowerCase());
  if (match) return match;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** "2025/june/june.md" → { year: 2025, month: "June", issueKey: "2025/june" }
 * Note issueKey preserves the folder's ORIGINAL casing (needed to reconstruct
 * real paths for hints/lookups); month is normalized for display and sorting. */
function issueOf(relPath: string): { year: number; month: string; issueKey: string } | null {
  const parts = relPath.split('/');
  if (parts.length < 2) return null; // malformed — not inside a Year/Month folder
  const year = parseInt(parts[0], 10);
  const rawMonth = parts[1];
  if (!Number.isFinite(year) || !rawMonth) return null;
  return { year, month: normalizeMonthName(rawMonth), issueKey: `${parts[0]}/${parts[1]}` };
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

let _issueList: MonthlyMagazineIssue[] | null = null;

export function getMonthlyMagazineIssues(): MonthlyMagazineIssue[] {
  if (_issueList) return _issueList;

  type Entry = {
    year: number;
    month: string;
    jsonPaths: string[];
    mdPaths: { relPath: string; globKey: string }[];
  };
  const byIssue = new Map<string, Entry>();

  for (const globKey of Object.keys(jsonModules)) {
    const relPath = relativeToMagazineRoot(globKey);
    const info = issueOf(relPath);
    if (!info) continue;
    const entry = byIssue.get(info.issueKey) ?? { year: info.year, month: info.month, jsonPaths: [], mdPaths: [] };
    entry.jsonPaths.push(relPath);
    byIssue.set(info.issueKey, entry);
  }

  for (const globKey of getMonthlyMagazineMarkdownGlobKeys()) {
    const relPath = relativeToMagazineRoot(globKey);
    const info = issueOf(relPath);
    if (!info) continue;
    const entry = byIssue.get(info.issueKey) ?? { year: info.year, month: info.month, jsonPaths: [], mdPaths: [] };
    entry.mdPaths.push({ relPath, globKey });
    byIssue.set(info.issueKey, entry);
  }

  _issueList = Array.from(byIssue.entries())
    .map(([issueKey, { year, month, jsonPaths, mdPaths }]) => {
      const sortedJson = [...jsonPaths].sort(naturalCompare);
      const sortedMd = [...mdPaths].sort((a, b) => naturalCompare(a.relPath, b.relPath));

      const tests: MonthlyMagazineTest[] = sortedJson.map((relPath, i) => ({
        relPath,
        label: `Test ${String(i + 1).padStart(2, '0')}`,
      }));

      const parts: MonthlyMagazinePart[] = sortedMd.map(({ relPath, globKey }, i) => ({
        relPath,
        globKey,
        label: `Part ${i + 1}`,
      }));

      return { year, month, issueKey, parts, tests };
    })
    // Newest year first, then calendar month order within a year (not alphabetical).
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month);
    });

  return _issueList;
}

export function getMonthlyMagazineIssue(issueKey: string): MonthlyMagazineIssue | undefined {
  return getMonthlyMagazineIssues().find((i) => i.issueKey === issueKey);
}

/** Every test relPath across every issue — used to detect "is this fileName a magazine quiz?" */
export function getAllMonthlyMagazineTestPaths(): Set<string> {
  const set = new Set<string>();
  getMonthlyMagazineIssues().forEach((i) => i.tests.forEach((t) => set.add(t.relPath)));
  return set;
}

// ─── Revision (markdown) loading — ALL parts, not just the first ─────────────

export async function loadMonthlyMagazineParts(issueKey: string): Promise<{ label: string; content: string }[]> {
  const issue = getMonthlyMagazineIssue(issueKey);
  if (!issue || issue.parts.length === 0) return [];

  const loaded = await Promise.all(
    issue.parts.map(async (p) => ({
      label: p.label,
      content: await loadMarkdownByGlobKey(p.globKey),
    }))
  );

  return loaded.filter((p): p is { label: string; content: string } => p.content !== null);
}

export function issueHasMarkdown(issueKey: string): boolean {
  return (getMonthlyMagazineIssue(issueKey)?.parts.length ?? 0) > 0;
}

// ─── Test (JSON quiz) loading — same shape/behavior as chapterRepository ─────

const _quizCache = new Map<string, DailyQuiz | null>();

/** Load a single test by its relPath, e.g. "2025/July/Test 01.json". */
export async function loadMonthlyMagazineTest(relPath: string): Promise<DailyQuiz | null> {
  if (_quizCache.has(relPath)) return _quizCache.get(relPath)!;

  const globKey = Object.keys(jsonModules).find((k) => relativeToMagazineRoot(k) === relPath);
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
    const info = issueOf(relPath);
    const test = info ? getMonthlyMagazineIssue(info.issueKey)?.tests.find((t) => t.relPath === relPath) : undefined;
    const quiz: DailyQuiz = {
      ...mod.default,
      date: info && test ? `${info.month} ${info.year} — ${test.label}` : relPath,
    };
    _quizCache.set(relPath, quiz);
    return quiz;
  } catch (err) {
    console.error(`[MonthlyMagazineRepository] Failed to load ${relPath}:`, err);
    _quizCache.set(relPath, null);
    return null;
  }
}

/** Total question count across every test in an issue (lazy, cached per test). */
export async function getMonthlyMagazineTotalQuestions(issueKey: string): Promise<number> {
  const issue = getMonthlyMagazineIssue(issueKey);
  if (!issue) return 0;
  const quizzes = await Promise.all(issue.tests.map((t) => loadMonthlyMagazineTest(t.relPath)));
  return quizzes.reduce((sum, q) => sum + (q?.questions.length ?? 0), 0);
}
