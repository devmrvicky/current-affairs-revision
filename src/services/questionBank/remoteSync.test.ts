// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { commitTests, getBankQuestions, getBankTest, getBankTests, getMetadata, type PreparedTest } from './bankDb';
import { downloadRemoteTest, getLastSyncAt, loadCachedManifest, syncRemote, META_MANIFEST } from './remoteSync';
import { manifestEntryFor, serializeManifest, testFilePath } from './manifest';
import { serializeTestFile } from './testFile';
import { emitBankChanged } from './bankEvents';
import { getQuestions } from '../questionRepository';
import { sha256Hex } from './sha256';
import type { BankQuestionData, Manifest } from './types';

const BASE = 'https://app.example/data/question-bank/';
const q = (id: string, over: Partial<BankQuestionData> = {}): BankQuestionData => ({ id, questionType: 'mcq', question: `Q ${id}?`, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', explanation: 'e', difficulty: 'easy', ...over });

/** A fake published site: files by url, a manifest built from the tests, and a log of every request. */
function site() {
  const files = new Map<string, string>();
  const tests: { id: string; version: number; questions: BankQuestionData[]; title?: string }[] = [];
  const log: { url: string; init?: RequestInit }[] = [];
  const failing = new Set<string>();
  const publish = (id: string, questions: BankQuestionData[], version = 1, title = `Test ${id}`) => {
    const i = tests.findIndex((t) => t.id === id);
    if (i >= 0) tests[i] = { id, version, questions, title }; else tests.push({ id, version, questions, title });
  };
  const build = (): Manifest => {
    const entries = tests.map((t) => {
      const meta = { id: t.id, title: t.title ?? t.id, subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], version: t.version };
      const text = serializeTestFile(meta, t.questions);
      files.set(BASE + testFilePath(t.id), text);
      return manifestEntryFor(meta, text, t.questions.length, '2026-11-10T00:00:00.000Z');
    });
    return { version: 1, updatedAt: '2026-11-10T00:00:00.000Z', tests: entries };
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    log.push({ url: u, init });
    if (failing.has(u)) throw new TypeError('Failed to fetch');
    if (u === BASE + 'manifest.json') return new Response(serializeManifest(build()), { status: 200 });
    const body = files.get(u);
    return body === undefined ? new Response('nope', { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { publish, remove: (id: string) => { const i = tests.findIndex((t) => t.id === id); if (i >= 0) tests.splice(i, 1); }, fetchImpl, log, files, failing, build };
}

beforeEach(async () => {
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata'] as const) await db.clear(s);
  emitBankChanged();
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});
afterEach(() => vi.restoreAllMocks());

const run = (s: ReturnType<typeof site>, extra = {}) => syncRemote({ baseUrl: BASE, fetchImpl: s.fetchImpl, now: () => 5000, ...extra });
const downloads = (s: ReturnType<typeof site>) => s.log.filter((l) => !l.url.endsWith('manifest.json')).map((l) => l.url.replace(BASE, ''));

describe('first sync', () => {
  it('downloads every published test, stores it validated with the published version/hash, caches the manifest and records the sync time', async () => {
    const s = site(); s.publish('a', [q('1'), q('2')], 3); s.publish('b', [q('1')]);
    const r = await run(s);
    expect(r).toMatchObject({ status: 'ok', added: ['a', 'b'], updated: [], removed: [], deferred: [], failed: [] });
    const a = await getBankTest('remote:a');
    expect(a).toMatchObject({ origin: 'remote', version: 3, questionCount: 2, hash: s.build().tests[0].hash, file: 'tests/a.json' });
    expect((await getBankQuestions('remote:a')).map((x) => x.questionId)).toEqual(['1', '2']);
    expect((await loadCachedManifest())!.tests.map((t) => t.id)).toEqual(['a', 'b']);
    expect(await getLastSyncAt()).toBe(5000);
    emitBankChanged();
    expect((await getQuestions()).filter((x) => x.id.startsWith('qb:remote:')).map((x) => x.id)).toEqual(['qb:remote:a:1', 'qb:remote:a:2', 'qb:remote:b:1']);
  });
  it('always revalidates the manifest (no stale HTTP cache)', async () => {
    const s = site(); s.publish('a', [q('1')]);
    await run(s);
    const manifestCall = s.log.find((l) => l.url.endsWith('manifest.json'))!;
    expect(manifestCall.init?.cache).toBe('no-cache');
  });
});

describe('later syncs download only what changed', () => {
  it('nothing changed → only the manifest is fetched', async () => {
    const s = site(); s.publish('a', [q('1')]); s.publish('b', [q('1')]);
    await run(s);
    s.log.length = 0;
    const r = await run(s);
    expect(r.status).toBe('unchanged');
    expect(downloads(s)).toEqual([]);
  });
  it('one test changed → only that file is downloaded and replaced; version comes from the manifest', async () => {
    const s = site(); s.publish('a', [q('1')]); s.publish('b', [q('1')]);
    await run(s);
    s.publish('b', [q('1', { question: 'edited?' }), q('2')], 2);
    s.log.length = 0;
    const r = await run(s);
    expect(r).toMatchObject({ status: 'ok', updated: ['b'], added: [] });
    expect(downloads(s)).toEqual(['tests/b.json']);
    expect(await getBankTest('remote:b')).toMatchObject({ version: 2, questionCount: 2 });
    expect((await getBankQuestions('remote:b')).map((x) => x.data.question)).toEqual(['edited?', 'Q 2?']);
  });
  it('a test removed from the manifest is removed (kept as retired snapshots)', async () => {
    const s = site(); s.publish('a', [q('1')]); s.publish('b', [q('1')]);
    await run(s);
    s.remove('b');
    const r = await run(s);
    expect(r.removed).toEqual(['b']);
    expect(await getBankTest('remote:b')).toBeUndefined();
    expect((await getBankTests('remote')).map((t) => t.id)).toEqual(['a']);
  });
});

describe('offline and failures never block, never delete', () => {
  it('offline: no requests, tests already cached keep working', async () => {
    const s = site(); s.publish('a', [q('1')]);
    await run(s);
    s.log.length = 0;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const r = await run(s);
    expect(r.status).toBe('offline');
    expect(s.log).toEqual([]);
    expect((await getBankTests('remote')).map((t) => t.id)).toEqual(['a']);
    emitBankChanged();
    expect((await getQuestions()).some((x) => x.id === 'qb:remote:a:1')).toBe(true); // the cached bank is used immediately
  });
  it('network error on the manifest → reported as offline; nothing changes; no throw', async () => {
    const s = site(); s.publish('a', [q('1')]);
    await run(s);
    s.failing.add(BASE + 'manifest.json');
    const r = await run(s);
    expect(r.status).toBe('offline');
    expect((await getBankTests('remote')).map((t) => t.id)).toEqual(['a']);
  });
  it('HTTP error on the manifest → error; nothing changes', async () => {
    const s = site();
    const fetchImpl = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    const r = await syncRemote({ baseUrl: BASE, fetchImpl });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/503/);
    void s;
  });
  it('an invalid manifest is ignored: nothing is stored and the cached manifest is untouched', async () => {
    const s = site(); s.publish('a', [q('1')]);
    await run(s);
    const cached = await getMetadata(META_MANIFEST);
    const bad = (async (url: string) => (url.endsWith('manifest.json') ? new Response(JSON.stringify({ version: 1, tests: [{ id: 'x' }, { id: 'x' }] })) : new Response('no', { status: 404 }))) as unknown as typeof fetch;
    const r = await syncRemote({ baseUrl: BASE, fetchImpl: bad });
    expect(r.status).toBe('error');
    expect(await getMetadata(META_MANIFEST)).toEqual(cached);
    expect((await getBankTests('remote')).map((t) => t.id)).toEqual(['a']);
  });
});

describe('validate before storing', () => {
  it('a published file with an invalid question is NOT stored; other tests still install; the manifest cache and last-sync time do not advance for it', async () => {
    const s = site(); s.publish('good', [q('1')]); s.publish('bad', [q('1')]);
    s.build();
    // Corrupt the published file but keep its manifest hash honest, so only validation can catch it.
    const original = s.fetchImpl;
    const corrupt = JSON.stringify({ id: 'bad', title: 'bad', subject: 'mathematics', chapter: 'average', questions: [{ id: 'x', question: 'Q?', options: ['a', 'b'], correctAnswer: 'ZZ' }] });
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (String(url) === BASE + 'tests/bad.json') return new Response(corrupt, { status: 200 });
      return (original as unknown as typeof fetch)(url, init);
    }) as unknown as typeof fetch;
    const manifest = s.build();
    manifest.tests.find((t) => t.id === 'bad')!.hash = sha256Hex(corrupt);
    const patched = (async (url: string, init?: RequestInit) => (String(url) === BASE + 'manifest.json' ? new Response(serializeManifest(manifest)) : fetchImpl(url, init))) as unknown as typeof fetch;
    const r = await syncRemote({ baseUrl: BASE, fetchImpl: patched, now: () => 9 });
    expect(r.status).toBe('error');
    expect(r.added).toEqual(['good']);
    expect(r.failed).toEqual([{ id: 'bad', reason: expect.stringMatching(/invalid/i) }]);
    expect(await getBankTest('remote:bad')).toBeUndefined();
    expect((await getBankTest('remote:good'))).toBeTruthy();
    expect((await loadCachedManifest())!.tests.map((t) => t.id)).toEqual(['good']);
    expect(await getLastSyncAt()).toBeNull(); // not a successful sync
  });
  it('a hash mismatch is rejected', async () => {
    const s = site(); s.publish('a', [q('1')]);
    s.files.set(BASE + 'tests/a.json', 'tampered');
    const manifest = s.build();
    s.files.set(BASE + 'tests/a.json', 'tampered');
    const fetchImpl = (async (url: string) => (String(url) === BASE + 'manifest.json' ? new Response(serializeManifest(manifest)) : new Response('tampered'))) as unknown as typeof fetch;
    const r = await syncRemote({ baseUrl: BASE, fetchImpl });
    expect(r.failed[0].reason).toMatch(/hash/);
    expect(await getBankTest('remote:a')).toBeUndefined();
  });
  it('an update that fails validation leaves the installed copy exactly as it was', async () => {
    const s = site(); s.publish('a', [q('1')], 1);
    await run(s);
    const before = JSON.stringify(await getBankQuestions('remote:a'));
    s.publish('a', [q('1')], 2);
    const manifest = s.build();
    const bad = JSON.stringify({ id: 'a', title: 'a', subject: 'mathematics', chapter: 'average', questions: [] });
    manifest.tests[0].hash = sha256Hex(bad); manifest.tests[0].questionCount = 0;
    const fetchImpl = (async (url: string) => (String(url) === BASE + 'manifest.json' ? new Response(serializeManifest(manifest)) : new Response(bad))) as unknown as typeof fetch;
    const r = await syncRemote({ baseUrl: BASE, fetchImpl });
    expect(r.failed).toHaveLength(1);
    expect(JSON.stringify(await getBankQuestions('remote:a'))).toBe(before);
    expect((await getBankTest('remote:a'))!.version).toBe(1);
  });
});

describe('local imports are never touched by sync', () => {
  const localTest: PreparedTest = { id: 'a', title: 'My own', subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: [], questions: [q('mine')], sourceFile: 'a.json' };
  it('a local test with the same id as a published one is not overwritten — nor removed when the published one is', async () => {
    await commitTests([localTest], { mode: 'add', origin: 'local' });
    const s = site(); s.publish('a', [q('remote-1')]);
    await run(s);
    expect((await getBankQuestions('local:a')).map((x) => x.questionId)).toEqual(['mine']);
    expect((await getBankQuestions('remote:a')).map((x) => x.questionId)).toEqual(['remote-1']);
    s.remove('a');
    await run(s);
    expect(await getBankTest('remote:a')).toBeUndefined();
    expect((await getBankTest('local:a'))!.title).toBe('My own');
    expect((await getBankQuestions('local:a')).map((x) => x.questionId)).toEqual(['mine']);
  });
});

describe('a running attempt is protected', () => {
  it('an update to a test that an unfinished attempt is using is deferred (content and cached manifest unchanged), then applied once it is free', async () => {
    const s = site(); s.publish('a', [q('1')], 1);
    await run(s);
    const before = JSON.stringify(await getBankQuestions('remote:a'));
    const cachedBefore = (await loadCachedManifest())!.tests[0];
    s.publish('a', [q('1', { question: 'changed under you' })], 2);
    const busy = await run(s, { isTestInUse: async (key: string) => key === 'remote:a' });
    expect(busy).toMatchObject({ status: 'unchanged', deferred: ['a'], updated: [] });
    expect(JSON.stringify(await getBankQuestions('remote:a'))).toBe(before);
    expect((await loadCachedManifest())!.tests[0]).toEqual(cachedBefore); // not advanced, so the next sync tries again
    const free = await run(s, { isTestInUse: async () => false });
    expect(free.updated).toEqual(['a']);
    expect((await getBankQuestions('remote:a'))[0].data.question).toBe('changed under you');
  });
  it('a removal is deferred while the test is in use', async () => {
    const s = site(); s.publish('a', [q('1')]);
    await run(s);
    s.remove('a');
    const r = await run(s, { isTestInUse: async () => true });
    expect(r.deferred).toEqual(['a']);
    expect(await getBankTest('remote:a')).toBeTruthy();
  });
});

describe('manual download', () => {
  it('downloads and installs one published test', async () => {
    const s = site(); s.publish('a', [q('1')]); s.publish('b', [q('1')]);
    const r = await downloadRemoteTest('b', { baseUrl: BASE, fetchImpl: s.fetchImpl });
    expect(r.ok).toBe(true);
    expect((await getBankTests('remote')).map((t) => t.id)).toEqual(['b']);
    expect((await downloadRemoteTest('nope', { baseUrl: BASE, fetchImpl: s.fetchImpl })).ok).toBe(false);
  });
});
