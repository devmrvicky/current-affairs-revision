// ─── Chapter folder paths (shared by every loader) ───────────────────────────
// A question file lives at   data/chapters/<Subject>/[<Category>/]<Chapter>/[<Group>/…/]<file>.json
//
//   [Subject, Chapter, file]                     – as always
//   [Subject, Category, Chapter, file]           – as always
//   [Subject, Category, Chapter, G1, G2, …, file]– NEW: any number of nested groups under the chapter
//
// Paths with 3 or 4 segments are read EXACTLY as before (same chapter, same category, same file name), so no existing
// chapter id, source string or test identity changes. Only paths that used to be skipped as "too deep" are now accepted:
// their chapter is the second folder under the subject, and the folders below it become nested groups, which show up as
// nested levels in Practice by Topic. A group folder is never a chapter of its own, so nesting can't split a chapter.

export interface ParsedChapterPath {
  subjectFolder: string;
  categoryFolder?: string;
  chapterFolder: string;
  /** Folders between the chapter and the file, outermost first. Empty for every pre-existing path. */
  groupPath: string[];
  /** The file's name. */
  file: string;
  /** `groupPath` + file joined with "/" — what a chapter test's source string ends with. */
  fileName: string;
}

/** `segments` is everything after `data/chapters/`, file included. Returns null for a shape that isn't a chapter file. */
export function parseChapterFolderPath(segments: readonly string[]): ParsedChapterPath | null {
  if (segments.length < 3) return null;
  const [subjectFolder, ...rest] = segments; // rest = [..., file]
  const file = rest[rest.length - 1];
  if (!subjectFolder || !file) return null;

  let categoryFolder: string | undefined;
  let chapterFolder: string;
  let groupPath: string[] = [];

  if (rest.length === 2) {
    chapterFolder = rest[0]; // [Subject, Chapter, file]
  } else if (rest.length === 3) {
    categoryFolder = rest[0]; // [Subject, Category, Chapter, file]
    chapterFolder = rest[1];
  } else {
    categoryFolder = rest[0]; // deeper: [Subject, Category, Chapter, G1…, file]
    chapterFolder = rest[1];
    groupPath = rest.slice(2, -1);
  }
  if (!chapterFolder) return null;
  return { subjectFolder, categoryFolder, chapterFolder, groupPath, file, fileName: [...groupPath, file].join('/') };
}
