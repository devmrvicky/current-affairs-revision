// ─── The published manifest (public/data/question-bank/manifest.json) ────────
// { version, updatedAt, tests: [{ id, title, subject, chapter, file, questionCount, version, updatedAt, hash }] }
// Pure functions: parse/validate, diff against what is installed, and the two edits a publish makes (upsert on publish, remove on delete).
// Stable test ids, independent per-test versions, a content hash, no duplicate ids, and an edit never drops an unrelated entry.

import { EMPTY_MANIFEST, type Manifest, type ManifestEntry } from './types';
import { sha256Hex } from './sha256';

export const MANIFEST_FILE = 'manifest.json';
export const TESTS_DIR = 'tests';
export const testFilePath = (id: string) => `${TESTS_DIR}/${id}.json`;

export interface ManifestProblem { message: string }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Validates a parsed manifest. A manifest that fails is never used — sync keeps what it has. */
export function parseManifest(input: unknown): { manifest: Manifest | null; problems: ManifestProblem[] } {
  const problems: ManifestProblem[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { manifest: null, problems: [{ message: 'The manifest is not a JSON object.' }] };
  const m = input as Record<string, unknown>;
  if (typeof m.version !== 'number') problems.push({ message: 'The manifest has no numeric "version".' });
  if (!Array.isArray(m.tests)) return { manifest: null, problems: [...problems, { message: 'The manifest has no "tests" array.' }] };

  const seen = new Set<string>();
  const tests: ManifestEntry[] = [];
  m.tests.forEach((raw, i) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const label = `Manifest entry ${i + 1}${isStr(e.id) ? ` ("${e.id}")` : ''}`;
    for (const f of ['id', 'title', 'subject', 'chapter', 'file', 'updatedAt', 'hash'] as const) if (!isStr(e[f])) problems.push({ message: `${label} is missing "${f}".` });
    if (!isCount(e.questionCount)) problems.push({ message: `${label} has no valid "questionCount".` });
    if (typeof e.version !== 'number' || !Number.isInteger(e.version) || e.version < 1) problems.push({ message: `${label} has no valid "version".` });
    if (isStr(e.hash) && !/^[0-9a-f]{64}$/.test(e.hash)) problems.push({ message: `${label} has a malformed "hash" (expected SHA-256 hex).` });
    if (isStr(e.file) && (e.file.startsWith('/') || e.file.includes('..') || /^[a-z]+:/i.test(e.file))) problems.push({ message: `${label} has an unsafe "file" path.` });
    if (isStr(e.id)) { if (seen.has(e.id)) problems.push({ message: `Duplicate test id "${e.id}" in the manifest.` }); seen.add(e.id); }
    tests.push(e as unknown as ManifestEntry);
  });
  return problems.length > 0 ? { manifest: null, problems } : { manifest: { version: m.version as number, updatedAt: isStr(m.updatedAt) ? m.updatedAt : EMPTY_MANIFEST.updatedAt, tests }, problems };
}

export function manifestEntryFor(
  meta: { id: string; title: string; subjectId: string; chapterId: string; version: number },
  fileText: string, questionCount: number, nowIso: string,
): ManifestEntry {
  return { id: meta.id, title: meta.title, subject: meta.subjectId, chapter: meta.chapterId, file: testFilePath(meta.id), questionCount, version: meta.version, updatedAt: nowIso, hash: sha256Hex(fileText) };
}

/** Add or replace one entry; every other entry is kept exactly as it was. */
export function upsertManifestEntry(manifest: Manifest, entry: ManifestEntry, nowIso: string): Manifest {
  const exists = manifest.tests.some((t) => t.id === entry.id);
  return { version: manifest.version, updatedAt: nowIso, tests: exists ? manifest.tests.map((t) => (t.id === entry.id ? entry : t)) : [...manifest.tests, entry] };
}

export function removeManifestEntry(manifest: Manifest, id: string, nowIso: string): Manifest {
  return { version: manifest.version, updatedAt: nowIso, tests: manifest.tests.filter((t) => t.id !== id) };
}

export interface InstalledRemote { id: string; version: number; hash: string }

export interface ManifestDiff {
  /** Not installed yet. */
  added: ManifestEntry[];
  /** Installed, but the published hash or version differs. */
  changed: ManifestEntry[];
  /** Installed but no longer in the manifest. */
  removed: InstalledRemote[];
  unchanged: ManifestEntry[];
}

export function diffManifest(remote: Manifest, installed: readonly InstalledRemote[]): ManifestDiff {
  const have = new Map(installed.map((t) => [t.id, t]));
  const diff: ManifestDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const e of remote.tests) {
    const mine = have.get(e.id);
    if (!mine) diff.added.push(e);
    else if (mine.hash !== e.hash || mine.version !== e.version) diff.changed.push(e);
    else diff.unchanged.push(e);
  }
  const published = new Set(remote.tests.map((t) => t.id));
  diff.removed = installed.filter((t) => !published.has(t.id));
  return diff;
}

export const serializeManifest = (m: Manifest) => JSON.stringify(m, null, 2) + '\n';
