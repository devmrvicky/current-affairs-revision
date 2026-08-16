// ─── Syllabus Repository ────────────────────────────────────────────────────
// Discovers generic study notes at src/data/syllabus/{subjectId}/{chapterId}/
// notes.md — a subject/chapter structure that isn't tied to any one exam
// (product-refactor §32-35: the same Percentage notes can back SSC CHSL and
// RRB Group D alike). "Related Tests" for a chapter are NOT sourced from a
// third content convention here — they're pulled from the ALREADY-universal
// question repository, filtered by subjectId+topicId+examId. This reuses
// 100% of the existing native-content pipeline (Phase 7.5) instead of
// inventing a second one, and it's why a chapter's available tests can
// legitimately differ per exam even though its notes are shared.

const notesModules = import.meta.glob<string>(
  '../data/syllabus/*/*/notes.md',
  { eager: false, query: '?raw', import: 'default' }
);

export interface SyllabusChapterMeta {
  subjectId: string;
  chapterId: string;
  /** Human-readable name generated from the folder name — no registry entry required (same philosophy as topic display names, Phase 7.5 §7). */
  chapterName: string;
  globKey: string;
}

function humanize(id: string): string {
  return id
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function parseNotesPath(globKey: string): { subjectId: string; chapterId: string } | null {
  const marker = '/syllabus/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  const rel = globKey.slice(idx + marker.length); // "mathematics/percentage/notes.md"
  const parts = rel.split('/');
  if (parts.length !== 3 || parts[2] !== 'notes.md') return null;
  const [subjectId, chapterId] = parts;
  if (!subjectId || !chapterId) return null;
  return { subjectId, chapterId };
}

let _metaCache: SyllabusChapterMeta[] | null = null;

function getAllSyllabusChapters(): SyllabusChapterMeta[] {
  if (_metaCache) return _metaCache;
  const rows: SyllabusChapterMeta[] = [];
  for (const globKey of Object.keys(notesModules)) {
    const parsed = parseNotesPath(globKey);
    if (!parsed) continue;
    rows.push({ ...parsed, chapterName: humanize(parsed.chapterId), globKey });
  }
  _metaCache = rows;
  return rows;
}

export function getSyllabusSubjectIds(): string[] {
  return Array.from(new Set(getAllSyllabusChapters().map((c) => c.subjectId)));
}

export function getSyllabusChaptersForSubject(subjectId: string): SyllabusChapterMeta[] {
  return getAllSyllabusChapters().filter((c) => c.subjectId === subjectId);
}

export function getSyllabusChapter(subjectId: string, chapterId: string): SyllabusChapterMeta | undefined {
  return getAllSyllabusChapters().find((c) => c.subjectId === subjectId && c.chapterId === chapterId);
}

const _notesCache = new Map<string, string | null>();

export async function loadSyllabusNotes(chapter: SyllabusChapterMeta): Promise<string | null> {
  if (_notesCache.has(chapter.globKey)) return _notesCache.get(chapter.globKey)!;
  const loader = notesModules[chapter.globKey];
  if (!loader) {
    _notesCache.set(chapter.globKey, null);
    return null;
  }
  try {
    const content = await loader();
    _notesCache.set(chapter.globKey, content);
    return content;
  } catch (err) {
    console.error(`[SyllabusRepository] Failed to load ${chapter.globKey}:`, err);
    _notesCache.set(chapter.globKey, null);
    return null;
  }
}

/** A stable, opaque key for readerStore (favorites/reading-progress) — composite so it never collides with a legacy Current Affairs chapterId, which are bare chapter names in the same flat namespace. */
export function syllabusReaderKey(subjectId: string, chapterId: string): string {
  return `syllabus::${subjectId}::${chapterId}`;
}
