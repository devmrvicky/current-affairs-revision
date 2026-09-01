// ─── Universal Chapter Repository ───────────────────────────────────────────
// The one chapter-discovery layer for the whole app. Every Chapter page —
// Mathematics, Reasoning, English, General Awareness, Current Affairs,
// whatever comes next — reads chapters through this module instead of each
// subject having (or not having) its own bespoke chapter system.
//
// Three content sources feed it, and the UI never needs to know which one a
// given chapter came from:
//
//   1. CANONICAL   src/data/chapters/{subjectId}/{chapterId}/notes.md
//                   src/data/chapters/{subjectId}/{chapterId}/{test}.json
//                   src/data/chapters/{subjectId}/{chapterId}/assets/*
//      The recommended structure for every new chapter, in any subject —
//      including Current Affairs.
//
//   2. LEGACY       src/data/chapters/{Chapter Name}/{Chapter Name}.md
//                   src/data/chapters/{Chapter Name}/{Test}.json
//      The pre-existing flat Current Affairs chapter folders. Normalized
//      here as subjectId "current-affairs" so they show up as just another
//      subject's chapters — never a special case in the UI. Discovery for
//      these files still physically lives in chapterRepository.ts (so the
//      rich standalone Current Affairs reader at /chapter-wise-current-affairs
//      keeps working unchanged); this module only wraps its output.
//
//   3. SYLLABUS     src/data/syllabus/{subjectId}/{chapterId}/notes.md
//      An earlier notes-only convention (e.g. mathematics/percentage).
//      Adapted here rather than migrated wholesale (lower risk) — see
//      syllabusRepository.ts.
//
// A chapter is considered available the moment it has notes.md OR at least
// one test JSON file — never behind a registry entry (master prompt
// "Content should drive discovery").

import { getChapterList, loadChapterParts as loadLegacyChapterParts } from './chapterRepository';
import { getSyllabusSubjectIds, getSyllabusChaptersForSubject, getSyllabusChapter, loadSyllabusNotes } from './syllabusRepository';
import { getTopicDisplayName } from '../data/registry/subjectRegistry';
import { slugify } from '../utils/slug';

export type ChapterSource = 'canonical' | 'legacy' | 'syllabus';

export interface UniversalChapter {
  /** Stable within its subject — the canonical/syllabus folder name, or the slugified legacy folder name. */
  id: string;
  subjectId: string;
  /** Display title — original folder name / registry name, never a re-slugified guess when the real name is known. */
  title: string;
  hasNotes: boolean;
  /** How many test/question JSON files this chapter folder has (canonical/legacy only — 0 for syllabus, whose tests come from the live question pool instead). */
  testFileCount: number;
  source: ChapterSource;
}

// ─── Canonical structure discovery ─────────────────────────────────────────
// Enumeration only (no eager loading) — import.meta.glob's key set is
// available synchronously, so a chapter can appear in a list immediately,
// with actual notes/questions fetched lazily once the chapter is opened.

const canonicalNotesModules = import.meta.glob<string>('../data/chapters/*/*/notes.md', {
  eager: false, query: '?raw', import: 'default',
});
const canonicalTestModules = import.meta.glob('../data/chapters/*/*/*.json', { eager: false });

function parseCanonicalKey(globKey: string): { subjectId: string; chapterId: string } | null {
  const marker = '/data/chapters/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const parts = globKey.slice(idx + marker.length).split('/');
  if (parts.length !== 3) return null; // subjectId/chapterId/file — assets/ and questions/ subfolders are 4 segments and excluded by construction
  const [subjectId, chapterId] = parts;
  if (!subjectId || !chapterId) return null;
  return { subjectId, chapterId };
}

interface CanonicalEntry { hasNotes: boolean; testFileCount: number }

function scanCanonical(): Map<string, CanonicalEntry> {
  const byKey = new Map<string, CanonicalEntry>(); // "subjectId::chapterId" -> entry
  for (const globKey of Object.keys(canonicalNotesModules)) {
    const parsed = parseCanonicalKey(globKey);
    if (!parsed) continue;
    const key = `${parsed.subjectId}::${parsed.chapterId}`;
    const entry = byKey.get(key) ?? { hasNotes: false, testFileCount: 0 };
    entry.hasNotes = true;
    byKey.set(key, entry);
  }
  for (const globKey of Object.keys(canonicalTestModules)) {
    const parsed = parseCanonicalKey(globKey);
    if (!parsed) continue;
    const key = `${parsed.subjectId}::${parsed.chapterId}`;
    const entry = byKey.get(key) ?? { hasNotes: false, testFileCount: 0 };
    entry.testFileCount += 1;
    byKey.set(key, entry);
  }
  return byKey;
}

// ─── Merge all three sources ────────────────────────────────────────────────

let _allChapters: UniversalChapter[] | null = null;

function buildAll(): UniversalChapter[] {
  const chapters: UniversalChapter[] = [];

  // 1. Canonical
  for (const [key, entry] of scanCanonical()) {
    const [subjectId, chapterId] = key.split('::');
    chapters.push({
      id: chapterId,
      subjectId,
      title: getTopicDisplayName(subjectId, chapterId),
      hasNotes: entry.hasNotes,
      testFileCount: entry.testFileCount,
      source: 'canonical',
    });
  }

  // 2. Legacy Current Affairs (chapterRepository already excludes canonical
  // 3-segment paths from its own discovery — see its isLegacyRelPath guard).
  for (const chapter of getChapterList()) {
    chapters.push({
      id: slugify(chapter.chapterName),
      subjectId: 'current-affairs',
      title: chapter.chapterName, // real folder name — never re-humanized from its own slug
      hasNotes: chapter.parts.length > 0,
      testFileCount: chapter.tests.length,
      source: 'legacy',
    });
  }

  // 3. Syllabus (notes-only convention; tests come from the live question pool)
  for (const subjectId of getSyllabusSubjectIds()) {
    for (const c of getSyllabusChaptersForSubject(subjectId)) {
      const key = `${c.subjectId}::${c.chapterId}`;
      // A canonical chapter at the same address always wins — same rule as
      // "the content filesystem is authoritative", canonical being the
      // recommended/newer convention.
      if (chapters.some((ch) => `${ch.subjectId}::${ch.id}` === key && ch.source === 'canonical')) continue;
      chapters.push({
        id: c.chapterId,
        subjectId: c.subjectId,
        title: getTopicDisplayName(c.subjectId, c.chapterId),
        hasNotes: true,
        testFileCount: 0,
        source: 'syllabus',
      });
    }
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

/** A stable, opaque key for readerStore (favorites/reading-progress/highlights) — namespaced by BOTH subjectId and chapterId so two subjects sharing a chapter name (or a canonical chapter sharing an id with a legacy one) never collide. */
export function chapterReaderKey(subjectId: string, chapterId: string): string {
  return `chapter::${subjectId}::${chapterId}`;
}

/** Loads and joins this chapter's notes content, whichever source it came from. Returns null if this chapter has no notes. */
export async function loadUniversalChapterNotes(chapter: UniversalChapter): Promise<string | null> {
  if (!chapter.hasNotes) return null;

  if (chapter.source === 'canonical') {
    const globKey = Object.keys(canonicalNotesModules).find((k) => {
      const parsed = parseCanonicalKey(k);
      return parsed?.subjectId === chapter.subjectId && parsed?.chapterId === chapter.id;
    });
    if (!globKey) return null;
    const loader = canonicalNotesModules[globKey];
    try {
      return await loader();
    } catch (err) {
      console.error(`[UniversalChapterRepository] Failed to load notes for ${chapter.subjectId}/${chapter.id}:`, err);
      return null;
    }
  }

  if (chapter.source === 'legacy') {
    const parts = await loadLegacyChapterParts(chapter.title);
    if (parts.length === 0) return null;
    return parts.map((p) => p.content).join('\n\n---\n\n');
  }

  // syllabus
  const meta = getSyllabusChapter(chapter.subjectId, chapter.id);
  if (!meta) return null;
  return loadSyllabusNotes(meta);
}
