// Pure naming and tree helpers for Author Studio — no storage, fully unit-tested.

export const MAX_NAME_LENGTH = 120;

/** Case-insensitive comparison key: "Maths.json" and "maths.JSON" are the same name in one folder. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Trimmed name, or null when it can't be used (empty, a path, a dot-name, control characters, too long). */
export function cleanName(raw: string): string | null {
  const name = raw.normalize('NFC').trim();
  if (!name || name === '.' || name === '..' || name.length > MAX_NAME_LENGTH) return null;
  if (/[\\/]/.test(name) || Array.from(name).some((ch) => ch.charCodeAt(0) < 32)) return null; // path separators and control characters
  return name;
}

export function ensureJsonName(name: string): string {
  return /\.json$/i.test(name) ? name : `${name}.json`;
}

function splitExt(name: string, hasExt: boolean): [string, string] {
  if (!hasExt) return [name, ''];
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/**
 * A name not present in `taken` (compared case-insensitively). Returns `desired` itself when free,
 * otherwise "name (2).json", "name (3).json"… or, with style 'copy', "name copy.json", "name copy 2.json".
 */
export function uniqueName(taken: Iterable<string>, desired: string, opts: { hasExt?: boolean; style?: 'number' | 'copy' } = {}): string {
  const used = new Set<string>();
  for (const t of taken) used.add(nameKey(t));
  if (!used.has(nameKey(desired))) return desired;
  const [base, ext] = splitExt(desired, opts.hasExt ?? false);
  for (let n = opts.style === 'copy' ? 1 : 2; ; n++) {
    const candidate = opts.style === 'copy' ? (n === 1 ? `${base} copy${ext}` : `${base} copy ${n}${ext}`) : `${base} (${n})${ext}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}

export interface FolderLike {
  id: string;
  parentId: string | null;
}

/** True when `candidateId` is `ancestorId` itself or lies anywhere beneath it. Guards against corrupt parent loops. */
export function isSameOrDescendant(folders: ReadonlyMap<string, FolderLike>, candidateId: string | null, ancestorId: string): boolean {
  const seen = new Set<string>();
  let cursor: string | null = candidateId;
  while (cursor !== null) {
    if (cursor === ancestorId) return true;
    if (seen.has(cursor)) return false; // an existing loop elsewhere — don't spin
    seen.add(cursor);
    cursor = folders.get(cursor)?.parentId ?? null;
  }
  return false;
}

/** Moving a folder into itself or any of its own descendants would orphan the whole subtree. */
export function wouldCreateCycle(folders: ReadonlyMap<string, FolderLike>, movingId: string, newParentId: string | null): boolean {
  return newParentId !== null && isSameOrDescendant(folders, newParentId, movingId);
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}
