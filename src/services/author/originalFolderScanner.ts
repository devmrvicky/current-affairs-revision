import type { AuthorSubjectId } from '../../types/authorStudio';

/**
 * Metadata-only discovery of the repository's shipped question folders.
 * Only glob keys are read; original JSON/Markdown content is never imported
 * into Author Studio and remains owned by the normal public data pipeline.
 */
const originalContentModules = import.meta.glob<string>(
  '../../data/chapters/**/*.{json,md}',
  { eager: false, query: '?raw', import: 'default' },
);

const CHAPTERS_MARKER = '/data/chapters/';
const RESERVED_FOLDERS = new Set(['assets', 'questions']);
const SUBJECTS: Readonly<Record<string, AuthorSubjectId>> = {
  mathematics: 'mathematics',
  english: 'english',
  reasoning: 'reasoning',
  'general awareness': 'general-awareness',
};

export interface OriginalFolderPath {
  subjectId: AuthorSubjectId;
  subjectName: string;
  segments: string[];
}

function normalizeFolderName(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function relativeParts(key: string): string[] | null {
  const index = key.indexOf(CHAPTERS_MARKER);
  if (index < 0) return null;
  const parts = key.slice(index + CHAPTERS_MARKER.length).split('/').filter(Boolean);
  if (parts.length < 2) return null;
  // Mirrors the public chapter discovery rules: these are technical content
  // directories, not user-facing Question Bank folders.
  if (parts.slice(0, -1).some((part) => RESERVED_FOLDERS.has(normalizeFolderName(part)))) return null;
  return parts;
}

/** Pure helper for testing source folder discovery, including arbitrary nesting. */
export function buildOriginalFolderPathsFromKeys(keys: string[]): OriginalFolderPath[] {
  const byKey = new Map<string, OriginalFolderPath>();
  for (const key of keys) {
    const parts = relativeParts(key);
    if (!parts) continue;
    const subjectName = parts[0];
    const subjectId = SUBJECTS[normalizeFolderName(subjectName)];
    if (!subjectId) continue;
    const folderSegments = parts.slice(1, -1);
    for (let depth = 1; depth <= folderSegments.length; depth++) {
      const segments = folderSegments.slice(0, depth);
      const identity = `${subjectId}::${segments.map(normalizeFolderName).join('/')}`;
      if (!byKey.has(identity)) byKey.set(identity, { subjectId, subjectName, segments });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const subject = a.subjectId.localeCompare(b.subjectId);
    if (subject) return subject;
    const depth = a.segments.length - b.segments.length;
    if (depth) return depth;
    return a.segments.join('/').localeCompare(b.segments.join('/'), undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function getOriginalFolderPaths(): OriginalFolderPath[] {
  return buildOriginalFolderPathsFromKeys(Object.keys(originalContentModules));
}
