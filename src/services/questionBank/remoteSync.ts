// ─── Remote sync: published tests → this device ──────────────────────────────
// On app start: the cached bank is already usable (it is in IndexedDB) → check the remote manifest in the background when online →
// compare version + hash → download only what changed → VALIDATE before storing → store → update the cached manifest only after success.
//
// Hard rules, each covered by a test:
//  • A failed sync (offline, HTTP error, bad manifest, bad file, hash mismatch) never blocks the test UI and never deletes anything.
//  • Local-only imports are never overwritten or removed — remote tests live under their own origin-qualified key.
//  • A test an unfinished attempt is using is NOT updated or removed now; it is deferred to a later sync, and a running attempt keeps
//    the questions it started with (anything a later update removes stays resolvable as a retired snapshot).

import { BankError, commitTests, deleteBankTest, getBankTests, getMetadata, setMetadata, type PreparedTest } from './bankDb';
import { diffManifest, parseManifest, MANIFEST_FILE } from './manifest';
import { emitBankChanged } from './bankEvents';
import { examIdsForSubject, parseTestFile, contentHash } from './testFile';
import { EMPTY_MANIFEST, testKeyOf, type Manifest, type ManifestEntry } from './types';

export const META_MANIFEST = 'remoteManifest';
export const META_LAST_SYNC = 'lastSyncAt';
const FETCH_TIMEOUT_MS = 15_000;

/** Where published files are served from: the app's own origin by default (the repo's public/ folder, once deployed). Override with VITE_QUESTION_BANK_BASE_URL (e.g. a raw.githubusercontent.com folder) for instant propagation. */
export function getRemoteBaseUrl(): string {
  const env = (import.meta.env?.VITE_QUESTION_BANK_BASE_URL as string | undefined)?.trim();
  const base = env || `${import.meta.env?.BASE_URL ?? '/'}data/question-bank/`;
  return base.endsWith('/') ? base : `${base}/`;
}

export interface SyncDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** True while an unfinished attempt uses the test (see bankUsage.isBankTestInUse). */
  isTestInUse?: (testKey: string) => Promise<boolean>;
}

export type SyncStatus = 'ok' | 'unchanged' | 'offline' | 'error';

export interface SyncResult {
  status: SyncStatus;
  checkedAt: number;
  added: string[];
  updated: string[];
  removed: string[];
  /** Updates postponed because an unfinished attempt is using the test. */
  deferred: string[];
  failed: { id: string; reason: string }[];
  message?: string;
}

const blank = (status: SyncStatus, checkedAt: number, message?: string): SyncResult => ({ status, checkedAt, added: [], updated: [], removed: [], deferred: [], failed: [], message });

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    // `no-cache`: always revalidate with the server, so a stale manifest can never be served from the HTTP cache.
    const res = await fetchImpl(url, { cache: 'no-cache', headers: { Accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

export async function loadCachedManifest(): Promise<Manifest | null> {
  return (await getMetadata<Manifest>(META_MANIFEST)) ?? null;
}

export async function getLastSyncAt(): Promise<number | null> {
  return (await getMetadata<number>(META_LAST_SYNC)) ?? null;
}

/** Downloads one published test, verifies it, and stores it. Throws (and stores nothing) on any problem. */
async function installEntry(entry: ManifestEntry, deps: Required<Pick<SyncDeps, 'baseUrl' | 'fetchImpl'>>, replace: boolean, now: number): Promise<void> {
  const text = await fetchText(`${deps.baseUrl}${entry.file}`, deps.fetchImpl);
  if (contentHash(text) !== entry.hash) throw new Error('The downloaded file does not match its published hash.');
  const parsed = parseTestFile(text, entry.file.split('/').pop() ?? entry.file);
  if (!parsed.ok || !parsed.meta) throw new Error(`The published test is invalid: ${parsed.errors[0]?.message ?? 'unknown problem'}`);
  if (parsed.meta.id !== entry.id) throw new Error(`The file's id "${parsed.meta.id}" does not match the manifest id "${entry.id}".`);
  if (parsed.questionCount !== entry.questionCount) throw new Error(`The file has ${parsed.questionCount} questions; the manifest says ${entry.questionCount}.`);
  const m = parsed.meta;
  const prepared: PreparedTest = {
    id: m.id, title: m.title, subjectId: m.subjectId, chapterId: m.chapterId, chapterTitle: m.chapterTitle,
    examIds: m.examIds.length > 0 ? m.examIds : examIdsForSubject(m.subjectId), questions: parsed.questions, sourceFile: entry.file,
    version: entry.version, hash: entry.hash, file: entry.file,
  };
  await commitTests([prepared], { mode: replace ? 'replace' : 'add', origin: 'remote', now });
}

export async function syncRemote(deps: SyncDeps = {}): Promise<SyncResult> {
  const now = (deps.now ?? Date.now)();
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const baseUrl = deps.baseUrl ?? getRemoteBaseUrl();
  const inUse = deps.isTestInUse ?? (async () => false);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return blank('offline', now, 'You are offline — using the tests already on this device.');

  let remote: Manifest;
  try {
    const parsed = parseManifest(JSON.parse(await fetchText(`${baseUrl}${MANIFEST_FILE}`, fetchImpl)));
    if (!parsed.manifest) return blank('error', now, `The published manifest is invalid: ${parsed.problems[0]?.message}`);
    remote = parsed.manifest;
  } catch (err) {
    const offline = err instanceof TypeError; // fetch rejects with TypeError when the network is unreachable
    return blank(offline ? 'offline' : 'error', now, offline ? 'Could not reach the server — using the tests already on this device.' : `Could not read the published manifest: ${err instanceof Error ? err.message : String(err)}`);
  }

  const installed = (await getBankTests('remote')).map((t) => ({ id: t.id, version: t.version, hash: t.hash }));
  const diff = diffManifest(remote, installed);
  const result = blank('unchanged', now);
  const cachedBefore = (await loadCachedManifest()) ?? EMPTY_MANIFEST;
  const holdBack = new Set<string>(); // ids whose cached manifest entry must NOT advance (failed or deferred)

  for (const entry of [...diff.added, ...diff.changed]) {
    const isUpdate = diff.changed.includes(entry);
    try {
      if (isUpdate && (await inUse(testKeyOf('remote', entry.id)))) { result.deferred.push(entry.id); holdBack.add(entry.id); continue; }
      await installEntry(entry, { baseUrl, fetchImpl }, isUpdate, now);
      (isUpdate ? result.updated : result.added).push(entry.id);
    } catch (err) {
      holdBack.add(entry.id);
      result.failed.push({ id: entry.id, reason: err instanceof BankError ? err.message : err instanceof Error ? err.message : String(err) });
    }
  }
  for (const gone of diff.removed) {
    try {
      if (await inUse(testKeyOf('remote', gone.id))) { result.deferred.push(gone.id); holdBack.add(gone.id); continue; }
      await deleteBankTest(testKeyOf('remote', gone.id), now);
      result.removed.push(gone.id);
    } catch (err) { result.failed.push({ id: gone.id, reason: err instanceof Error ? err.message : String(err) }); holdBack.add(gone.id); }
  }

  // The cached manifest advances only for what actually succeeded.
  const previous = new Map(cachedBefore.tests.map((t) => [t.id, t]));
  const advanced: Manifest = { ...remote, tests: remote.tests.filter((t) => !holdBack.has(t.id)).concat(Array.from(holdBack).map((id) => previous.get(id)).filter((t): t is ManifestEntry => !!t && remote.tests.some((r) => r.id === t.id))) };
  await setMetadata(META_MANIFEST, advanced);
  if (result.failed.length === 0) await setMetadata(META_LAST_SYNC, now);

  const changed = result.added.length + result.updated.length + result.removed.length > 0;
  if (changed) emitBankChanged();
  result.status = result.failed.length > 0 ? 'error' : changed ? 'ok' : 'unchanged';
  if (result.failed.length > 0) result.message = `${result.failed.length} test${result.failed.length === 1 ? '' : 's'} could not be updated; the copies already on this device were kept.`;
  return result;
}

/** Manual download of one published test (from the cached/current manifest). */
export async function downloadRemoteTest(testId: string, deps: SyncDeps = {}): Promise<{ ok: boolean; message: string }> {
  const now = (deps.now ?? Date.now)();
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const baseUrl = deps.baseUrl ?? getRemoteBaseUrl();
  try {
    const parsed = parseManifest(JSON.parse(await fetchText(`${baseUrl}${MANIFEST_FILE}`, fetchImpl)));
    const entry = parsed.manifest?.tests.find((t) => t.id === testId);
    if (!entry) return { ok: false, message: `"${testId}" is not in the published manifest.` };
    const have = (await getBankTests('remote')).find((t) => t.id === testId);
    if (have && (await (deps.isTestInUse ?? (async () => false))(have.key))) return { ok: false, message: 'This test is in use by an unfinished attempt; it will update after you finish it.' };
    await installEntry(entry, { baseUrl, fetchImpl }, !!have, now);
    emitBankChanged();
    return { ok: true, message: `Downloaded "${entry.title}".` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
