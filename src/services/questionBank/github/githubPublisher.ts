// ─── Global publishing through GitHub ────────────────────────────────────────
// One atomic commit per publish, using the Git Trees API:
//   read branch head → read its commit + tree → create blobs → create ONE tree → create ONE commit → update the ref.
// The test JSON files and the manifest therefore land together or not at all. Success is reported only after GitHub's ref update
// confirms the new commit; its SHA and URL are returned. If someone else changed the repo meanwhile we re-read and re-check, and we
// never overwrite a file that differs from what the admin reviewed.

import type { PublishAuthProvider } from './authProvider';
import { EMPTY_MANIFEST, type Manifest } from '../types';
import { manifestEntryFor, parseManifest, removeManifestEntry, serializeManifest, upsertManifestEntry } from '../manifest';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  /** Folder of the question bank in the repo, e.g. `public/data/question-bank`. */
  rootPath: string;
  /** The manifest file, inside rootPath. */
  manifestPath: string;
}

export const DEFAULT_ROOT_PATH = 'public/data/question-bank';
export const DEFAULT_GITHUB_CONFIG: GitHubConfig = { owner: '', repo: '', branch: 'main', rootPath: DEFAULT_ROOT_PATH, manifestPath: `${DEFAULT_ROOT_PATH}/manifest.json` };
const API = 'https://api.github.com';

export function validateGitHubConfig(c: GitHubConfig): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(c.owner)) problems.push('Owner must be a GitHub user or organisation name.');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(c.repo)) problems.push('Repository must be a repository name.');
  if (!c.branch.trim() || /\s|\.\./.test(c.branch)) problems.push('Branch must be a branch name.');
  const bad = (p: string) => !p.trim() || p.startsWith('/') || p.includes('..') || p.includes('\\');
  if (bad(c.rootPath)) problems.push('The question-bank folder must be a relative path inside the repository.');
  if (bad(c.manifestPath)) problems.push('The manifest path must be a relative path inside the repository.');
  else if (!bad(c.rootPath) && !c.manifestPath.startsWith(`${c.rootPath.replace(/\/$/, '')}/`)) problems.push('The manifest must live inside the question-bank folder.');
  return problems;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type GitHubErrorKind = 'auth' | 'no-token' | 'not-found' | 'rate-limit' | 'conflict' | 'network' | 'validation' | 'http';

export class GitHubError extends Error {
  constructor(public kind: GitHubErrorKind, message: string, public details: { status?: number; resetAt?: number } = {}) { super(message); this.name = 'GitHubError'; }
}

// ─── Client ──────────────────────────────────────────────────────────────────

interface Res<T> { status: number; data: T }

export class GitHubClient {
  constructor(private auth: PublishAuthProvider, private fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  async request<T>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<Res<T>> {
    const token = await this.auth.getToken();
    if (!token) throw new GitHubError('no-token', 'Enter your GitHub token to publish.');
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Deliberately not including the underlying error: it can echo request details.
      throw new GitHubError('network', 'Could not reach GitHub. Check your connection and try again — nothing was published.');
    }
    if (res.ok || okStatuses.includes(res.status)) return { status: res.status, data: (res.status === 204 ? null : await res.json().catch(() => null)) as T };

    const payload = (await res.json().catch(() => ({}))) as { message?: string };
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    const retryAfter = res.headers.get('retry-after');
    const msg = payload.message ?? `HTTP ${res.status}`;
    if (res.status === 429 || (res.status === 403 && (remaining === '0' || /rate limit/i.test(msg)))) {
      const resetAt = reset ? Number(reset) * 1000 : retryAfter ? Date.now() + Number(retryAfter) * 1000 : undefined;
      throw new GitHubError('rate-limit', `GitHub's rate limit was reached${resetAt ? `; try again after ${new Date(resetAt).toLocaleTimeString()}` : ''}. Nothing was published.`, { status: res.status, resetAt });
    }
    if (res.status === 401) throw new GitHubError('auth', 'GitHub rejected the token (it may be wrong or expired). Enter it again.', { status: 401 });
    if (res.status === 403) throw new GitHubError('auth', 'The token is not allowed to do this. It needs "Contents: Read and write" on this repository.', { status: 403 });
    if (res.status === 404) throw new GitHubError('not-found', 'GitHub could not find that repository, branch or file — or the token cannot see it.', { status: 404 });
    if (res.status === 409 || res.status === 422) throw new GitHubError('conflict', msg, { status: res.status });
    throw new GitHubError('http', `GitHub returned an error (${res.status}): ${msg}`, { status: res.status });
  }
}

// ─── Plan: what a publish would do ───────────────────────────────────────────

export interface PublishTest {
  id: string;
  title: string;
  subjectId: string;
  chapterId: string;
  version: number;
  questionCount: number;
  /** The exact file text to publish (its SHA-256 goes in the manifest). */
  text: string;
}

export interface PlannedFile {
  id: string;
  /** Full path in the repository. */
  path: string;
  status: 'new' | 'existing' | 'unchanged';
  /** The blob sha seen at review time (null = didn't exist). Publishing aborts if it changed. */
  expectedSha: string | null;
}

export interface PlannedDelete { id: string; path: string; existed: boolean; expectedSha: string | null }

export interface PublishPlan { headSha: string; files: PlannedFile[]; deletes: PlannedDelete[]; manifestPath: string }

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const repoPath = (c: GitHubConfig) => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`;
const joinPath = (root: string, rel: string) => `${root.replace(/\/$/, '')}/${rel}`;
export const testRepoPath = (c: GitHubConfig, id: string) => joinPath(c.rootPath, `tests/${id}.json`);

interface ContentsFile { sha: string; content?: string; encoding?: string }

async function readFile(client: GitHubClient, c: GitHubConfig, path: string, ref: string): Promise<{ sha: string; text: string | null } | null> {
  try {
    const { data } = await client.request<ContentsFile>('GET', `${repoPath(c)}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`);
    const text = data.content && data.encoding === 'base64' ? new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, '')), (ch) => ch.charCodeAt(0))) : null;
    return { sha: data.sha, text };
  } catch (err) {
    if (err instanceof GitHubError && err.kind === 'not-found') return null; // a missing FILE is normal; a missing repo/branch shows up on the ref call
    throw err;
  }
}

async function headOf(client: GitHubClient, c: GitHubConfig): Promise<{ commitSha: string; treeSha: string }> {
  const ref = await client.request<{ object: { sha: string } }>('GET', `${repoPath(c)}/git/ref/heads/${enc(c.branch)}`);
  const commit = await client.request<{ tree: { sha: string } }>('GET', `${repoPath(c)}/git/commits/${ref.data.object.sha}`);
  return { commitSha: ref.data.object.sha, treeSha: commit.data.tree.sha };
}

/** The manifest as it is on the branch right now (an empty one if none is published yet). Also proves the token, repository and branch work. */
export async function readRemoteManifest(client: GitHubClient, config: GitHubConfig): Promise<{ manifest: Manifest; headSha: string }> {
  const problems = validateGitHubConfig(config);
  if (problems.length > 0) throw new GitHubError('validation', problems[0]);
  const { commitSha } = await headOf(client, config);
  const file = await readFile(client, config, config.manifestPath, commitSha);
  if (!file) return { manifest: EMPTY_MANIFEST, headSha: commitSha };
  const parsed = parseManifest(file.text ? JSON.parse(file.text) : null);
  if (!parsed.manifest) throw new GitHubError('validation', `The manifest in the repository is invalid (${parsed.problems[0]?.message}). Fix it before publishing.`);
  return { manifest: parsed.manifest, headSha: commitSha };
}

export async function planPublish(client: GitHubClient, config: GitHubConfig, tests: readonly PublishTest[], deleteIds: readonly string[]): Promise<PublishPlan> {
  const { commitSha } = await headOf(client, config);
  const files: PlannedFile[] = [];
  for (const t of tests) {
    const path = testRepoPath(config, t.id);
    const there = await readFile(client, config, path, commitSha);
    files.push({ id: t.id, path, status: !there ? 'new' : there.text === t.text ? 'unchanged' : 'existing', expectedSha: there?.sha ?? null });
  }
  const deletes: PlannedDelete[] = [];
  for (const id of deleteIds) {
    const path = testRepoPath(config, id);
    const there = await readFile(client, config, path, commitSha);
    deletes.push({ id, path, existed: !!there, expectedSha: there?.sha ?? null });
  }
  return { headSha: commitSha, files, deletes, manifestPath: config.manifestPath };
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface PublishRequest {
  tests: readonly PublishTest[];
  deleteIds: readonly string[];
  message: string;
  plan: PublishPlan;
  /** Attempts when the branch moves underneath us (default 3). */
  maxAttempts?: number;
  now?: () => Date;
}

export interface PublishResult {
  commitSha: string;
  commitUrl: string;
  manifest: Manifest;
  published: string[];
  deleted: string[];
}

export async function publishToGitHub(client: GitHubClient, config: GitHubConfig, req: PublishRequest): Promise<PublishResult> {
  const problems = validateGitHubConfig(config);
  if (problems.length > 0) throw new GitHubError('validation', problems[0]);
  const maxAttempts = req.maxAttempts ?? 3;
  const nowIso = (req.now?.() ?? new Date()).toISOString();
  const expected = new Map<string, string | null>([...req.plan.files.map((f) => [f.path, f.expectedSha] as const), ...req.plan.deletes.map((d) => [d.path, d.expectedSha] as const)]);
  const base = repoPath(config);

  for (let attempt = 1; ; attempt++) {
    const head = await headOf(client, config);

    // Re-check against what the admin reviewed: never overwrite or delete a file someone else changed since.
    for (const [path, sha] of expected) {
      const now = await readFile(client, config, path, head.commitSha);
      if ((now?.sha ?? null) !== sha) throw new GitHubError('conflict', `"${path}" was changed by someone else since you reviewed it. Nothing was published — review it again.`);
    }

    // Start from the manifest as it is NOW, so entries added by others in the meantime are kept.
    const mf = await readFile(client, config, config.manifestPath, head.commitSha);
    let manifest: Manifest = EMPTY_MANIFEST;
    if (mf) {
      const parsed = parseManifest(mf.text ? JSON.parse(mf.text) : null);
      if (!parsed.manifest) throw new GitHubError('validation', `The manifest in the repository is invalid (${parsed.problems[0]?.message}). It was not changed.`);
      manifest = parsed.manifest;
    }
    for (const id of req.deleteIds) manifest = removeManifestEntry(manifest, id, nowIso);
    for (const t of req.tests) manifest = upsertManifestEntry(manifest, manifestEntryFor(t, t.text, t.questionCount, nowIso), nowIso);

    const blob = async (content: string) => (await client.request<{ sha: string }>('POST', `${base}/git/blobs`, { content, encoding: 'utf-8' })).data.sha;
    const entries: { path: string; mode: '100644'; type: 'blob'; sha: string | null }[] = [];
    for (const t of req.tests) entries.push({ path: testRepoPath(config, t.id), mode: '100644', type: 'blob', sha: await blob(t.text) });
    for (const id of req.deleteIds) if (req.plan.deletes.find((d) => d.id === id)?.existed) entries.push({ path: testRepoPath(config, id), mode: '100644', type: 'blob', sha: null });
    entries.push({ path: config.manifestPath, mode: '100644', type: 'blob', sha: await blob(serializeManifest(manifest)) });

    const tree = await client.request<{ sha: string }>('POST', `${base}/git/trees`, { base_tree: head.treeSha, tree: entries });
    const commit = await client.request<{ sha: string }>('POST', `${base}/git/commits`, { message: req.message, tree: tree.data.sha, parents: [head.commitSha] });

    try {
      const updated = await client.request<{ object: { sha: string } }>('PATCH', `${base}/git/refs/heads/${enc(config.branch)}`, { sha: commit.data.sha, force: false });
      // Success is only what GitHub confirms: the ref now points at OUR commit.
      if (updated.data?.object?.sha !== commit.data.sha) throw new GitHubError('http', 'GitHub did not confirm the commit. Nothing is known to be published — check the repository before retrying.');
      return { commitSha: commit.data.sha, commitUrl: `https://github.com/${config.owner}/${config.repo}/commit/${commit.data.sha}`, manifest, published: req.tests.map((t) => t.id), deleted: req.deleteIds.filter((id) => req.plan.deletes.find((d) => d.id === id)?.existed) };
    } catch (err) {
      const moved = err instanceof GitHubError && err.kind === 'conflict';
      if (moved && attempt < maxAttempts) continue; // someone pushed first: re-read the head, re-check, rebuild on top of it
      if (moved) throw new GitHubError('conflict', 'The repository kept changing while publishing. Nothing was published — try again.');
      throw err;
    }
  }
}
