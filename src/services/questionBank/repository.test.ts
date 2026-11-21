// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDB } from '../db';
import { questionBankRepository as repo } from './repository';
import { parseTestFile } from './testFile';
import { emitBankChanged } from './bankEvents';
import { isBankTestInUse } from './bankUsage';
import { manifestEntryFor, serializeManifest } from './manifest';
import { serializeTestFile } from './testFile';
import { usePracticeSessionStore } from '../../store/practiceSessionStore';
import type { PracticeSession } from '../../types/practiceSession';
import type { BankQuestionData } from './types';

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, question: `Question ${id}?`, options: ['a', 'b', 'c'], correctAnswer: 'B', ...extra });
const parsed = (id: string, questions: unknown[]) => parseTestFile(JSON.stringify({ id, title: `Test ${id}`, subject: 'mathematics', chapter: 'Average', questions }), `${id}.json`);

beforeEach(async () => {
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata'] as const) await db.clear(s);
  emitBankChanged();
});
afterEach(() => usePracticeSessionStore.getState().clearSession());

describe('QuestionBankRepository', () => {
  it('lists bundled, local and remote tests together with unique keys; bundled is unchanged by local/remote data', async () => {
    const before = await repo.getQuestionBankMetadata();
    await repo.importLocalTest(parsed('mine', [q('1'), q('2')]));
    const all = await repo.getAllTests();
    expect(new Set(all.map((t) => t.key)).size).toBe(all.length);
    expect(all.filter((t) => t.source === 'local').map((t) => [t.key, t.questionCount])).toEqual([['local:mine', 2]]);
    expect((await repo.getQuestionBankMetadata()).bundledTests).toBe(before.bundledTests);
    expect(all.filter((t) => t.source === 'bundled').length).toBe(before.bundledTests);
  });

  it('getTestById / getQuestions work by key or bare id and return questions as the engines see them', async () => {
    await repo.importLocalTest(parsed('mine', [q('1'), q('2')]));
    expect((await repo.getTestById('local:mine'))).toMatchObject({ source: 'local', id: 'mine', title: 'Test mine' });
    expect((await repo.getTestById('mine'))?.key).toBe('local:mine');
    expect(await repo.getTestById('local:nope')).toBeUndefined();
    expect((await repo.getQuestions('mine')).map((x) => x.id)).toEqual(['qb:local:mine:1', 'qb:local:mine:2']);
    expect(await repo.getQuestions('does-not-exist')).toEqual([]);
  });

  it('import (add) rejects a duplicate id; replace keeps the id and bumps the version; merge adds new questions; delete removes the test', async () => {
    await repo.importLocalTest(parsed('t', [q('1'), q('2')]));
    await expect(repo.importLocalTest(parsed('t', [q('9')]))).rejects.toMatchObject({ code: 'duplicate-test' });
    await expect(repo.replaceLocalTest('other', parsed('t', [q('9')]))).rejects.toThrow(/not "other"/);
    expect(await repo.replaceLocalTest('t', parsed('t', [q('1'), q('3')]))).toMatchObject({ added: 1, skipped: 1 });
    expect((await repo.getTestById('t'))!.version).toBe(2);
    const extra: BankQuestionData[] = [{ id: '4', questionType: 'mcq', question: 'Q4?', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A' }];
    expect(await repo.mergeLocalQuestions('t', extra)).toMatchObject({ added: 1 });
    expect((await repo.getQuestions('t')).map((x) => x.id)).toEqual(['qb:local:t:1', 'qb:local:t:3', 'qb:local:t:4']);
    await expect(repo.mergeLocalQuestions('nope', extra)).rejects.toThrow(/no local test/);
    expect(await repo.deleteLocalTest('t')).toBe(true);
    expect(await repo.deleteLocalTest('t')).toBe(false);
    expect(await repo.getLocalTests()).toEqual([]);
  });

  it('metadata: counts and the last successful sync', async () => {
    await repo.importLocalTest(parsed('a', [q('1'), q('2')]));
    await repo.importLocalTest(parsed('b', [q('1')]));
    const m = await repo.getQuestionBankMetadata();
    expect(m).toMatchObject({ localTests: 2, localQuestions: 3, remoteInstalled: 0, remoteAvailable: 0, remoteQuestions: 0, lastSyncAt: null });
    expect(await repo.getRemoteManifest()).toBeNull();
  });

  it('sync through the repository protects a test an unfinished attempt is using (default in-use check)', async () => {
    const BASE = 'https://app.example/qb/';
    const publish = (version: number, question: string) => {
      const meta = { id: 'pub', title: 'Pub', subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], version };
      const text = serializeTestFile(meta, [{ id: '1', questionType: 'mcq', question, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A' }]);
      return { text, manifest: serializeManifest({ version: 1, updatedAt: '2026-11-01T00:00:00.000Z', tests: [manifestEntryFor(meta, text, 1, '2026-11-01T00:00:00.000Z')] }) };
    };
    let site = publish(1, 'first?');
    const fetchImpl = (async (url: string) => new Response(String(url).endsWith('manifest.json') ? site.manifest : site.text)) as unknown as typeof fetch;
    expect((await repo.syncRemoteManifest({ baseUrl: BASE, fetchImpl })).added).toEqual(['pub']);

    // The learner starts a practice session on that published test…
    usePracticeSessionStore.setState({ session: { id: 's', questionIds: ['qb:remote:pub:1'], isCompleted: false, config: { examId: 'e', subjectIds: [], questionCount: 1, mode: 'practice' }, states: [] } as unknown as PracticeSession });
    expect(await isBankTestInUse('remote:pub')).toBe(true);
    // …and the test is updated on the server while they are in it:
    site = publish(2, 'changed under you?');
    const r = await repo.syncRemoteManifest({ baseUrl: BASE, fetchImpl });
    expect(r.deferred).toEqual(['pub']);
    expect((await repo.getQuestions('remote:pub'))[0].question).toBe('first?'); // their attempt keeps its original question

    usePracticeSessionStore.getState().clearSession();
    expect(await isBankTestInUse('remote:pub')).toBe(false);
    expect((await repo.syncRemoteManifest({ baseUrl: BASE, fetchImpl })).updated).toEqual(['pub']);
    expect((await repo.getQuestions('remote:pub'))[0].question).toBe('changed under you?');
  });

  it('a completed session does not hold a test back', async () => {
    usePracticeSessionStore.setState({ session: { id: 's', questionIds: ['qb:remote:pub:1'], isCompleted: true, config: {}, states: [] } as unknown as PracticeSession });
    expect(await isBankTestInUse('remote:pub')).toBe(false);
  });
});
