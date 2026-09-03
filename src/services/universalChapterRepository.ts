// ─── Universal Chapter Repository ───────────────────────────────────────────
// The one chapter-discovery layer for the whole app. Every Chapter page —
// Mathematics, Reasoning, English, General Awareness, Current Affairs,
// whatever comes next — reads chapters through this module instead of each
// subject having (or not having) its own bespoke chapter system.
//
// src/data/chapters/ is a SINGLE common repository, entirely independent of
// any exam — a chapter is never duplicated into an exam's own data folder
// (data-architecture migration §3). Two shapes are discovered underneath it,
// and the UI never needs to know which one a given chapter came from:
//
//   1. DIRECT      src/data/chapters/{Subject}/{Chapter}/notes.md
//                   src/data/chapters/{Subject}/{Chapter}/{test}.json
//                   src/data/chapters/{Subject}/{Chapter}/assets/*
//      e.g. Mathematics/Percentage, English/Noun.
//
//   2. GROUPED      src/data/chapters/{Subject}/{Category}/{Chapter}/notes.md
//                   src/data/chapters/{Subject}/{Category}/{Chapter}/{test}.json
//      A subject can optionally group related chapters under a category
//      folder — e.g. General Awareness/Polity/Parliament. The category is
//      purely organizational: it plays no part in the chapter's identity
//      (subjectId + chapterId), only in how it reads on disk.
//
// Any .md file directly in a chapter folder is a Notes Part (not just one
// literally named "notes.md") — natural-sort ordered, joined for display.
// Any .json file directly in a chapter folder is a Test — see
// questionRepository.ts's canonical chapter loader for the question-pool side.
//
// Folder names are human-readable ("General Awareness"); subjectId/chapterId
// are always derived via resolveSubjectId()/slugify() so a folder never has
// to already be a slug (data-architecture migration §19).
//
// "General Awareness/Current Affairs/**" is a reserved subtree, entirely
// excluded from the generic discovery above. Current Affairs keeps its own
// pre-existing, richer reader (topic-wise chapters via chapterRepository.ts,
// Daily via quizRepository.ts, Monthly via monthlyMagazineRepository.ts) for
// backward compatibility with existing user progress/highlights/attempt-
// ledger keys (data-architecture migration §32) — this module still surfaces
// its topic-wise chapters (source: 'current-affairs') so they're reachable
// through the same universal chapter UI, but Daily/Monthly stay CA-only
// extensions, never generic chapters (data-architecture migration §11).
//
// A chapter is considered available the moment it has at least one .md OR
// .json file — never behind a registry entry (master prompt "Content should
// drive discovery").

import { getChapterList, loadChapterParts as loadCurrentAffairsChapterParts } from './chapterRepository';
import { resolveTopicId } from './questionRepository';
import { getRawMarkdownGlobKeys, loadMarkdownByGlobKey } from './markdownRepository';
import { getTopicDisplayName, resolveSubjectId, TOPICS } from '../data/registry/subjectRegistry';
import { slugify } from '../utils/slug';

export type ChapterSource = 'canonical' | 'current-affairs';

export interface UniversalChapter {
  /** Stable within its subject — slugified chapter folder name (canonical), or slugified topic folder name (current-affairs). */
  id: string;
  subjectId: string;
  /** Display title — registry name where one exists, else the real folder name (never a re-humanized guess when the real name is known). */
  title: string;
  hasNotes: boolean;
  /** How many test/question JSON files this chapter folder has. */
  testFileCount: number;
  source: ChapterSource;
}

const CHAPTERS_ROOT_MARKER = '/data/chapters/';
const RESERVED_SEGMENTS = new Set(['assets', 'questions']);

// ─── Canonical structure discovery (direct + grouped) ──────────────────────
// Enumeration only (no eager loading) — import.meta.glob's key set is
// available synchronously, so a chapter can appear in a list immediately,
// with actual notes/questions fetched lazily once the chapter is opened.

const canonicalMarkdownGlobKeys = () =>
  getRawMarkdownGlobKeys().filter((k) => k.includes(CHAPTERS_ROOT_MARKER));

const canonicalTestModules = import.meta.glob(
  ['../data/chapters/*/*/*.json', '../data/chapters/*/*/*/*.json'],
  { eager: false }
);

/** [Subject, Chapter] or [Subject, Category, Chapter] → identity + display info. Returns null for anything under the reserved "General Awareness/Current Affairs/" subtree, or a reserved segment (assets/questions). */
function parseCanonicalPath(globKey: string): { subjectId: string; chapterId: string; subjectFolder: string; chapterFolder: string } | null {
  const idx = globKey.indexOf(CHAPTERS_ROOT_MARKER);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + CHAPTERS_ROOT_MARKER.length).split('/'); // [Subject, ...rest, file] — 3 or 4 segments total
  if (parts.length !== 3 && parts.length !== 4) return null;
  if (parts.some((p) => RESERVED_SEGMENTS.has(p))) return null;

  const [subjectFolder, ...rest] = parts;
  if (rest[0] === 'Current Affairs') return null; // owned by the current-affairs branch below
  const chapterFolder = rest[rest.length - 2];
  if (!subjectFolder || !chapterFolder) return null;

  return {
    subjectId: resolveSubjectId(subjectFolder),
    chapterId: slugify(chapterFolder),
    subjectFolder,
    chapterFolder,
  };
}

interface CanonicalEntry {
  subjectFolder: string;
  chapterFolder: string;
  mdGlobKeys: string[];
  testFileCount: number;
}

function scanCanonical(): Map<string, CanonicalEntry> {
  const byKey = new Map<string, CanonicalEntry>(); // "subjectId::chapterId" -> entry

  for (const globKey of canonicalMarkdownGlobKeys()) {
    const parsed = parseCanonicalPath(globKey);
    if (!parsed) continue;
    const key = `${parsed.subjectId}::${parsed.chapterId}`;
    const entry = byKey.get(key) ?? { subjectFolder: parsed.subjectFolder, chapterFolder: parsed.chapterFolder, mdGlobKeys: [], testFileCount: 0 };
    entry.mdGlobKeys.push(globKey);
    byKey.set(key, entry);
  }
  for (const globKey of Object.keys(canonicalTestModules)) {
    const parsed = parseCanonicalPath(globKey);
    if (!parsed) continue;
    const key = `${parsed.subjectId}::${parsed.chapterId}`;
    const entry = byKey.get(key) ?? { subjectFolder: parsed.subjectFolder, chapterFolder: parsed.chapterFolder, mdGlobKeys: [], testFileCount: 0 };
    entry.testFileCount += 1;
    byKey.set(key, entry);
  }

  return byKey;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ─── Merge both sources ─────────────────────────────────────────────────────

let _allChapters: UniversalChapter[] | null = null;

function buildAll(): UniversalChapter[] {
  const chapters: UniversalChapter[] = [];

  // 1. Canonical (direct + grouped)
  for (const [key, entry] of scanCanonical()) {
    const [subjectId, chapterId] = key.split('::');
    chapters.push({
      id: chapterId,
      subjectId,
      // Prefer the real, human-authored folder name — only fall back to a
      // re-humanized slug when there's no folder name to fall back to,
      // which never happens here (kept for parity with getTopicDisplayName's
      // own fallback shape). A registry entry, when one exists, always wins
      // — it's the curated display name.
      title: TOPICS.some((t) => t.subjectId === subjectId && t.id === chapterId)
        ? getTopicDisplayName(subjectId, chapterId)
        : entry.chapterFolder,
      hasNotes: entry.mdGlobKeys.length > 0,
      testFileCount: entry.testFileCount,
      source: 'canonical',
    });
  }

  // 2. Current Affairs topic-wise chapters (General Awareness/Current Affairs/{Topic}/) —
  // still discovered by chapterRepository.ts for backward compatibility (see
  // module comment), listed here under subjectId 'current-affairs' so its
  // own reader/progress/attempt-ledger keys keep resolving exactly as before.
  for (const chapter of getChapterList()) {
    chapters.push({
      // Use the SAME resolution questionRepository uses to tag these
      // chapters' questions with a topicId — a few legacy folder names are
      // longer than their curated registry id (e.g. "Aayushman series
      // practice sets" registers as "aayushman-series"); slugifying the
      // folder name directly here would silently disagree with
      // resolveTopicId() and this chapter's Practice panel would show zero
      // questions despite the test files existing.
      id: resolveTopicId(chapter.chapterName),
      subjectId: 'current-affairs',
      title: chapter.chapterName, // real folder name — never re-humanized from its own slug
      hasNotes: chapter.parts.length > 0,
      testFileCount: chapter.tests.length,
      source: 'current-affairs',
    });
  }

  return chapters;
}

function getAllChapters(): UniversalChapter[] {
  if (!_allChapters) _allChapters = buildAll();
  return _allChapters;
}

/** Clears the in-memory discovery cache — call after content is added/removed at runtime (dev hot-reload safety net). */
export function clearUniversalChapterCache(): void {
  _allChapters = null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getChaptersForSubject(subjectId: string): UniversalChapter[] {
  return getAllChapters()
    .filter((c) => c.subjectId === subjectId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getChapter(subjectId: string, chapterId: string): UniversalChapter | undefined {
  return getAllChapters().find((c) => c.subjectId === subjectId && c.id === chapterId);
}

/** Every subjectId that has at least one discoverable chapter (any source) — for "Coming soon" vs real content on the Chapters/subjects screen. */
export function getSubjectIdsWithChapterContent(): Set<string> {
  return new Set(getAllChapters().map((c) => c.subjectId));
}

/** A stable, opaque key for readerStore (favorites/reading-progress/highlights) — namespaced by BOTH subjectId and chapterId so two subjects sharing a chapter name never collide. */
export function chapterReaderKey(subjectId: string, chapterId: string): string {
  return `chapter::${subjectId}::${chapterId}`;
}

/** Loads and joins this chapter's notes content (every .md part, in natural sort order), whichever source it came from. Returns null if this chapter has no notes. */
export async function loadUniversalChapterNotes(chapter: UniversalChapter): Promise<string | null> {
  if (!chapter.hasNotes) return null;

  if (chapter.source === 'current-affairs') {
    const parts = await loadCurrentAffairsChapterParts(chapter.title);
    if (parts.length === 0) return null;
    return parts.map((p) => p.content).join('\n\n---\n\n');
  }

  // canonical
  const globKeys = canonicalMarkdownGlobKeys()
    .filter((k) => {
      const parsed = parseCanonicalPath(k);
      return parsed?.subjectId === chapter.subjectId && parsed?.chapterId === chapter.id;
    })
    .sort(naturalCompare);
  if (globKeys.length === 0) return null;

  const contents = await Promise.all(
    globKeys.map(async (k) => {
      try {
        return await loadMarkdownByGlobKey(k);
      } catch (err) {
        console.error(`[UniversalChapterRepository] Failed to load ${k}:`, err);
        return null;
      }
    })
  );
  const valid = contents.filter((c): c is string => c !== null);
  if (valid.length === 0) return null;
  return valid.join('\n\n---\n\n');
}
