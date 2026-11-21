// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient, GitHubError, DEFAULT_GITHUB_CONFIG, planPublish, publishToGitHub, testRepoPath, validateGitHubConfig, type GitHubConfig, type PublishTest } from './githubPublisher';
import { SessionTokenAuthProvider, sessionAuth, TOKEN_IDLE_MS } from './authProvider';
import { sha256Hex } from '../sha256';
import { fakeGitHub } from '../../../test/fakeGitHub';
import { manifestEntryFor, parseManifest, serializeManifest } from '../manifest';

const TOKEN = 'github_pat_SECRET_TOKEN_VALUE_123';
const CONFIG: GitHubConfig = { ...DEFAULT_GITHUB_CONFIG, owner: 'acme', repo: 'exam-app', branch: 'main' };
const MANIFEST_PATH = CONFIG.manifestPath;

const auth = () => { const a = new SessionTokenAuthProvider(); a.setToken(TOKEN); return a; };
const test = (id: string, over: Partial<PublishTest> = {}): PublishTest => ({ id, title: `Test ${id}`, subjectId: 'mathematics', chapterId: 'average', version: 1, questionCount: 2, text: `{"id":"${id}"}\n`, ...over });
const existingManifest = (...ids: string[]) => serializeManifest({ version: 1, updatedAt: '2026-01-01T00:00:00.000Z', tests: ids.map((id) => manifestEntryFor({ id, title: id, subjectId: 'mathematics', chapterId: 'c', version: 1 }, `{"id":"${id}"}\n`, 1, '2026-01-01T00:00:00.000Z')) });
const names = (calls: { method: string; path: string }[]) => calls.map((c) => `${c.method} ${c.path.replace(/\/contents\/.*/, '/contents/…')}`);

async function publish(gh: ReturnType<typeof fakeGitHub>, tests: PublishTest[], deleteIds: string[] = [], a = auth()) {
  const client = new GitHubClient(a, gh.fetchImpl);
  const plan = await planPublish(client, CONFIG, tests, deleteIds);
  return publishToGitHub(client, CONFIG, { tests, deleteIds, message: 'Publish tests', plan, now: () => new Date('2026-11-10T00:00:00.000Z') });
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('atomic Git Trees publish', () => {
  it('reads the head, creates blobs, ONE tree, ONE commit, updates the ref once — in that order', async () => {
    const gh2 = fakeGitHub();
    const client = new GitHubClient(auth(), gh2.fetchImpl);
    const plan = await planPublish(client, CONFIG, [test('a'), test('b')], []);
    gh2.calls.length = 0;
    await publishToGitHub(client, CONFIG, { tests: [test('a'), test('b')], deleteIds: [], message: 'm', plan });
    const seq = names(gh2.calls);
    expect(seq[0]).toBe('GET /git/ref/heads/main'); // 1. the branch head
    expect(seq[1]).toMatch(/^GET \/git\/commits\//); // 2. its commit (for the tree)
    const posts = seq.filter((c) => c.startsWith('POST'));
    expect(posts).toEqual(['POST /git/blobs', 'POST /git/blobs', 'POST /git/blobs', 'POST /git/trees', 'POST /git/commits']); // a, b, manifest → one tree → one commit
    expect(seq.filter((c) => c.startsWith('PATCH'))).toEqual(['PATCH /git/refs/heads/main']);
    expect(seq.indexOf('POST /git/trees')).toBeGreaterThan(seq.lastIndexOf('POST /git/blobs'));
    expect(seq.indexOf('POST /git/commits')).toBeGreaterThan(seq.indexOf('POST /git/trees'));
    expect(seq.indexOf('PATCH /git/refs/heads/main')).toBeGreaterThan(seq.indexOf('POST /git/commits'));
  });

  it('the test files and the manifest land together in ONE commit, and the result carries its SHA and URL', async () => {
    const gh = fakeGitHub({ 'README.md': 'hi' });
    const r = await publish(gh, [test('a'), test('b', { version: 4 })]);
    expect(r.commitSha).toBe(gh.head());
    expect(r.commitUrl).toBe(`https://github.com/acme/exam-app/commit/${r.commitSha}`);
    expect(gh.commits.get(gh.head())!.parents).toHaveLength(1);
    expect(gh.fileAtHead(testRepoPath(CONFIG, 'a'))).toBe('{"id":"a"}\n');
    expect(gh.fileAtHead(testRepoPath(CONFIG, 'b'))).toBe('{"id":"b"}\n');
    const manifest = parseManifest(JSON.parse(gh.fileAtHead(MANIFEST_PATH)!)).manifest!;
    expect(manifest.tests.map((t) => [t.id, t.version, t.file, t.hash])).toEqual([['a', 1, 'tests/a.json', sha256Hex('{"id":"a"}\n')], ['b', 4, 'tests/b.json', sha256Hex('{"id":"b"}\n')]]);
    expect(gh.fileAtHead('README.md')).toBe('hi'); // unrelated files untouched
    expect(r.published).toEqual(['a', 'b']);
  });

  it('keeps every unrelated manifest entry, replaces the one being republished, and bumps updatedAt', async () => {
    const gh = fakeGitHub({ [MANIFEST_PATH]: existingManifest('keep-1', 'a', 'keep-2') });
    await publish(gh, [test('a', { version: 2 })]);
    const m = parseManifest(JSON.parse(gh.fileAtHead(MANIFEST_PATH)!)).manifest!;
    expect(m.tests.map((t) => t.id)).toEqual(['keep-1', 'a', 'keep-2']);
    expect(m.tests[1].version).toBe(2);
    expect(m.updatedAt).toBe('2026-11-10T00:00:00.000Z');
  });

  it('delete removes the file AND its manifest entry in the same commit, leaving other tests alone', async () => {
    const gh = fakeGitHub({ [MANIFEST_PATH]: existingManifest('a', 'b'), [testRepoPath(CONFIG, 'a')]: '{"id":"a"}\n', [testRepoPath(CONFIG, 'b')]: '{"id":"b"}\n' });
    const r = await publish(gh, [], ['a']);
    expect(gh.fileAtHead(testRepoPath(CONFIG, 'a'))).toBeUndefined();
    expect(gh.fileAtHead(testRepoPath(CONFIG, 'b'))).toBe('{"id":"b"}\n');
    expect(parseManifest(JSON.parse(gh.fileAtHead(MANIFEST_PATH)!)).manifest!.tests.map((t) => t.id)).toEqual(['b']);
    expect(r.deleted).toEqual(['a']);
    expect(gh.calls.filter((c) => c.method === 'POST' && c.path === '/git/commits')).toHaveLength(1);
  });

  it('the plan says which files are new, existing or unchanged, with their target paths', async () => {
    const gh = fakeGitHub({ [testRepoPath(CONFIG, 'old')]: 'different\n', [testRepoPath(CONFIG, 'same')]: '{"id":"same"}\n' });
    const plan = await planPublish(new GitHubClient(auth(), gh.fetchImpl), CONFIG, [test('fresh'), test('old'), test('same')], []);
    expect(plan.files.map((f) => [f.id, f.status, f.path, f.expectedSha === null])).toEqual([
      ['fresh', 'new', 'public/data/question-bank/tests/fresh.json', true],
      ['old', 'existing', 'public/data/question-bank/tests/old.json', false],
      ['same', 'unchanged', 'public/data/question-bank/tests/same.json', false],
    ]);
    expect(plan.manifestPath).toBe('public/data/question-bank/manifest.json');
  });
});

describe('conflicts: never silently overwrite someone else\'s change', () => {
  it('the branch moves while publishing → re-reads, rebuilds on top of it, keeps their change, then succeeds', async () => {
    const gh = fakeGitHub({ [MANIFEST_PATH]: existingManifest('a') });
    gh.hooks.beforeRefUpdate = () => gh.pushAsSomeoneElse({ 'docs.md': 'theirs', [MANIFEST_PATH]: existingManifest('a', 'theirs') });
    const r = await publish(gh, [test('mine')]);
    expect(gh.fileAtHead('docs.md')).toBe('theirs');
    expect(parseManifest(JSON.parse(gh.fileAtHead(MANIFEST_PATH)!)).manifest!.tests.map((t) => t.id)).toEqual(['a', 'theirs', 'mine']); // their entry survived
    expect(gh.calls.filter((c) => c.method === 'PATCH')).toHaveLength(2); // first rejected (not a fast-forward), second accepted
    expect(r.commitSha).toBe(gh.head());
    expect(gh.commits.get(gh.head())!.parents[0]).not.toBe(r.commitSha);
  });
  it('a file the admin reviewed was changed by someone else → aborts, publishes nothing', async () => {
    const gh = fakeGitHub({ [testRepoPath(CONFIG, 'a')]: 'original\n' });
    const client = new GitHubClient(auth(), gh.fetchImpl);
    const plan = await planPublish(client, CONFIG, [test('a')], []);
    gh.pushAsSomeoneElse({ [testRepoPath(CONFIG, 'a')]: 'edited by a colleague\n' });
    const before = gh.head();
    await expect(publishToGitHub(client, CONFIG, { tests: [test('a')], deleteIds: [], message: 'm', plan })).rejects.toMatchObject({ kind: 'conflict', message: expect.stringMatching(/changed by someone else/) });
    expect(gh.head()).toBe(before);
    expect(gh.fileAtHead(testRepoPath(CONFIG, 'a'))).toBe('edited by a colleague\n');
    expect(gh.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
  it('a new file that someone else created meanwhile is also not overwritten', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(auth(), gh.fetchImpl);
    const plan = await planPublish(client, CONFIG, [test('a')], []);
    gh.pushAsSomeoneElse({ [testRepoPath(CONFIG, 'a')]: 'surprise\n' });
    await expect(publishToGitHub(client, CONFIG, { tests: [test('a')], deleteIds: [], message: 'm', plan })).rejects.toMatchObject({ kind: 'conflict' });
    expect(gh.fileAtHead(testRepoPath(CONFIG, 'a'))).toBe('surprise\n');
  });
  it('gives up after repeated races and reports nothing published', async () => {
    const gh = fakeGitHub();
    gh.hooks.fail = (m) => (m === 'PATCH' ? new Response(JSON.stringify({ message: 'Update is not a fast forward' }), { status: 422 }) : undefined);
    await expect(publish(gh, [test('a')])).rejects.toMatchObject({ kind: 'conflict', message: expect.stringMatching(/Nothing was published/) });
    expect(gh.calls.filter((c) => c.method === 'PATCH')).toHaveLength(3);
  });
  it('an invalid manifest in the repository is reported, not overwritten', async () => {
    const gh = fakeGitHub({ [MANIFEST_PATH]: '{"version":1,"tests":[{"id":"x"},{"id":"x"}]}' });
    const before = gh.head();
    await expect(publish(gh, [test('a')])).rejects.toMatchObject({ kind: 'validation', message: expect.stringMatching(/manifest in the repository is invalid/) });
    expect(gh.head()).toBe(before);
  });
});

describe('failures are explicit — and never reported as success', () => {
  it('rate limit: a clear message with the reset time; nothing published', async () => {
    const gh = fakeGitHub();
    const reset = Math.floor(Date.now() / 1000) + 600;
    gh.hooks.fail = (m, p) => (p === '/git/ref/heads/main' ? new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } }) : undefined);
    const err = await publish(gh, [test('a')]).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err).toMatchObject({ kind: 'rate-limit', details: { resetAt: reset * 1000 } });
    expect(err.message).toMatch(/rate limit/i);
    expect(gh.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
  it('429 with retry-after is also a rate limit', async () => {
    const gh = fakeGitHub();
    gh.hooks.fail = () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } });
    await expect(publish(gh, [test('a')])).rejects.toMatchObject({ kind: 'rate-limit' });
  });
  it('network error: reported, ref never updated, and the message does not echo request details', async () => {
    const gh = fakeGitHub();
    gh.hooks.fail = (m) => (m === 'POST' ? new TypeError(`Failed to fetch with ${TOKEN}`) : undefined);
    const err = await publish(gh, [test('a')]).catch((e) => e);
    expect(err).toMatchObject({ kind: 'network' });
    expect(err.message).not.toContain(TOKEN);
    expect(gh.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
  it.each([
    [401, 'auth', /rejected the token/],
    [403, 'auth', /Contents: Read and write/],
    [404, 'not-found', /could not find/],
    [500, 'http', /500/],
  ])('HTTP %i → %s', async (status, kind, re) => {
    const gh = fakeGitHub();
    gh.hooks.fail = (m, p) => (p === '/git/ref/heads/main' ? new Response(JSON.stringify({ message: 'x' }), { status }) : undefined);
    const err = await publish(gh, [test('a')]).catch((e) => e);
    expect(err).toMatchObject({ kind });
    expect(err.message).toMatch(re);
  });
  it('NO false success: if GitHub\'s ref update does not confirm our commit, it throws', async () => {
    const gh = fakeGitHub();
    gh.hooks.refResponseSha = 'f'.repeat(40);
    await expect(publish(gh, [test('a')])).rejects.toMatchObject({ kind: 'http', message: expect.stringMatching(/did not confirm/) });
  });
  it('no token → asks for one before any request is made', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(new SessionTokenAuthProvider(), gh.fetchImpl);
    await expect(planPublish(client, CONFIG, [test('a')], [])).rejects.toMatchObject({ kind: 'no-token' });
    expect(gh.calls).toEqual([]);
  });
  it('a bad configuration is rejected before any request', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(auth(), gh.fetchImpl);
    await expect(publishToGitHub(client, { ...CONFIG, rootPath: '../escape' }, { tests: [test('a')], deleteIds: [], message: 'm', plan: { headSha: 'x', files: [], deletes: [], manifestPath: 'x' } })).rejects.toMatchObject({ kind: 'validation' });
    expect(gh.calls).toEqual([]);
  });
});

describe('the token', () => {
  it('is sent only to api.github.com as a Bearer header, and never stored, logged or returned', async () => {
    const log = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')].map((s) => s.mockImplementation(() => {}));
    const gh = fakeGitHub();
    const r = await publish(gh, [test('a')]);
    expect(gh.calls.length).toBeGreaterThan(0);
    for (const c of gh.calls) expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(gh.calls.map((c) => c.body))).not.toContain(TOKEN); // never in a request body
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    for (const key of Object.keys(localStorage)) expect(localStorage.getItem(key)).not.toContain(TOKEN);
    for (const key of Object.keys(sessionStorage)) expect(sessionStorage.getItem(key)).not.toContain(TOKEN);
    expect(JSON.stringify([...Object.keys(localStorage), ...Object.keys(sessionStorage)])).not.toContain('token');
    for (const spy of log) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(TOKEN);
    // …and not in any IndexedDB store either
    const { getDB } = await import('../../db');
    const db = await getDB();
    for (const store of Array.from(db.objectStoreNames)) expect(JSON.stringify(await db.getAll(store as never))).not.toContain(TOKEN);
  });
  it('failure messages never contain it', async () => {
    for (const status of [401, 403, 404, 422, 500]) {
      const gh = fakeGitHub();
      gh.hooks.fail = () => new Response(JSON.stringify({ message: 'nope' }), { status });
      const err = await publish(gh, [test('a')]).catch((e) => e);
      expect(String(err.message)).not.toContain(TOKEN);
    }
  });
  it('is held in memory, dropped on clear, and dropped after 15 idle minutes; activity keeps it alive', async () => {
    vi.useFakeTimers();
    try {
      const a = new SessionTokenAuthProvider();
      expect(a.isAuthenticated()).toBe(false);
      a.setToken(`  ${TOKEN}  `);
      expect(await a.getToken()).toBe(TOKEN); // trimmed
      vi.advanceTimersByTime(TOKEN_IDLE_MS - 1000);
      expect(a.isAuthenticated()).toBe(true);
      await a.getToken(); // activity resets the clock
      vi.advanceTimersByTime(TOKEN_IDLE_MS - 1000);
      expect(a.isAuthenticated()).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(a.isAuthenticated()).toBe(false);
      expect(await a.getToken()).toBeNull();
      a.setToken(TOKEN); a.clear();
      expect(a.isAuthenticated()).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('rejects an empty or whitespace-containing value without echoing it, and listeners are told THAT it changed, never what', () => {
    const a = new SessionTokenAuthProvider();
    expect(() => a.setToken('   ')).toThrow(/does not look like/);
    expect(() => a.setToken('has space in it')).toThrow(/does not look like/);
    try { a.setToken('has space in it'); } catch (e) { expect(String((e as Error).message)).not.toContain('has space'); }
    const seen: unknown[] = [];
    a.subscribe((...args) => seen.push(args));
    a.setToken(TOKEN); a.clear();
    expect(seen).toEqual([[], []]);
  });
  it('the shared session provider starts empty', () => { expect(sessionAuth.isAuthenticated()).toBe(false); });
});

describe('configuration validation', () => {
  it('accepts a sensible config and names each problem otherwise', () => {
    expect(validateGitHubConfig(CONFIG)).toEqual([]);
    expect(validateGitHubConfig({ ...CONFIG, owner: '' })[0]).toMatch(/Owner/);
    expect(validateGitHubConfig({ ...CONFIG, repo: 'bad repo' })[0]).toMatch(/Repository/);
    expect(validateGitHubConfig({ ...CONFIG, branch: 'a b' })[0]).toMatch(/Branch/);
    expect(validateGitHubConfig({ ...CONFIG, rootPath: '/abs' })[0]).toMatch(/folder/);
    expect(validateGitHubConfig({ ...CONFIG, manifestPath: 'elsewhere/manifest.json' })[0]).toMatch(/inside the question-bank folder/);
  });
});
