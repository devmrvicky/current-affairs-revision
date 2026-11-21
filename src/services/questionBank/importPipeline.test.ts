// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../db';
import { commitImports, expandBundles, previewImports, readCandidate, type ImportCandidate } from './importPipeline';
import { getBankQuestions, getBankTest, getBankTests, getImportHistory } from './bankDb';
import { exportBundle } from './backup';
import { onBankChanged } from './bankEvents';
import { MAX_FILE_BYTES } from './testFile';

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, question: `Question ${id}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'B', difficulty: 'easy', ...extra });
const file = (id: string, questions: unknown[], meta: Record<string, unknown> = {}) => JSON.stringify({ id, title: `Test ${id}`, subject: 'mathematics', chapter: 'Average', questions, ...meta });
let n = 0;
const cand = (fileName: string, text: string | null, overrides = {}, readError?: string): ImportCandidate => ({ uid: `u${n++}`, fileName, size: text?.length ?? 0, text, overrides, readError });

beforeEach(async () => {
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata'] as const) await db.clear(s);
});

describe('preview', () => {
  it('shows file name, title, subject, chapter, question count, difficulty mix, duplicates and status for a valid file', async () => {
    const [p] = await previewImports([cand('avg.json', file('avg-1', [q('a'), q('b', { difficulty: 'hard' }), q('c', { difficulty: undefined })]))], 'add');
    expect(p).toMatchObject({ fileName: 'avg.json', valid: true, testExists: false, duplicateQuestionIds: [], newQuestionIds: ['a', 'b', 'c'], removedQuestionIds: [] });
    expect(p.parsed.meta).toMatchObject({ id: 'avg-1', title: 'Test avg-1', subjectId: 'mathematics', chapterId: 'average' });
    expect(p.parsed.questionCount).toBe(3);
    expect(p.parsed.difficulty).toEqual({ easy: 1, medium: 0, hard: 1, unspecified: 1 });
  });
  it('an invalid file is invalid, with exact error positions, and imports nothing', async () => {
    const [p] = await previewImports([cand('bad.json', '{\n "questions": [ {,} ]\n}')], 'add');
    expect(p.valid).toBe(false);
    expect(p.errors[0]).toMatchObject({ code: 'invalid-json', line: 2 });
  });
  it('an unreadable or oversized file becomes an error row, not a crash', async () => {
    const [p] = await previewImports([cand('x.json', null, {}, 'This file could not be read.')], 'add');
    expect(p).toMatchObject({ valid: false, errors: [expect.objectContaining({ code: 'unreadable' })] });
    const big = new File(['{}'], 'big.json');
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 });
    const c = await readCandidate(big);
    expect(c.text).toBeNull();
    expect(c.readError).toMatch(/limit is 5 MB/);
  });
  it('readCandidate reads a normal file', async () => {
    const c = await readCandidate(new File([file('r', [q('a')])], 'r.json'));
    expect(c.fileName).toBe('r.json');
    expect(c.readError).toBeUndefined();
    expect(c.text).toContain('"id":"r"');
  });

  describe('modes', () => {
    beforeEach(async () => {
      const [p] = await previewImports([cand('t.json', file('t1', [q('a'), q('b'), q('c')]))], 'add');
      await commitImports([p], 'add');
    });
    it('Add rejects a test id that already exists (and names the way out)', async () => {
      const [p] = await previewImports([cand('t.json', file('t1', [q('z')]))], 'add');
      expect(p.valid).toBe(false);
      expect(p.errors.map((e) => e.code)).toContain('duplicate-test-id');
      expect(p.errors[0].message).toMatch(/Replace or Merge/);
    });
    it('Replace needs an existing test, and previews what it would add and retire', async () => {
      const [missing] = await previewImports([cand('x.json', file('nope', [q('a')]))], 'replace');
      expect(missing.errors.map((e) => e.code)).toContain('missing-test');
      const [p] = await previewImports([cand('t.json', file('t1', [q('a'), q('d')]))], 'replace');
      expect(p).toMatchObject({ valid: true, testExists: true, duplicateQuestionIds: ['a'], newQuestionIds: ['d'], removedQuestionIds: ['b', 'c'] });
    });
    it('Merge detects duplicate question ids and separates the new ones', async () => {
      const [p] = await previewImports([cand('t.json', file('t1', [q('b'), q('e'), q('f')]))], 'merge');
      expect(p).toMatchObject({ valid: true, duplicateQuestionIds: ['b'], newQuestionIds: ['e', 'f'] });
      const [missing] = await previewImports([cand('x.json', file('nope', [q('a')]))], 'merge');
      expect(missing.errors.map((e) => e.code)).toContain('missing-test');
    });
  });

  it('two files in one batch with the same test id: the second is rejected', async () => {
    const [a, b] = await previewImports([cand('a.json', file('same', [q('1')])), cand('b.json', file('same', [q('2')]))], 'add');
    expect(a.valid).toBe(true);
    expect(b.errors.map((e) => e.code)).toContain('duplicate-test-id-in-batch');
    expect(b.errors[0].message).toMatch(/a\.json/);
  });
  it('a bare array takes its details from the form', async () => {
    const bare = JSON.stringify([q('a')]);
    const [without] = await previewImports([cand('Bare Test.json', bare)], 'add');
    expect(without.valid).toBe(false);
    const [withForm] = await previewImports([cand('Bare Test.json', bare, { subjectId: 'mathematics', chapterTitle: 'Ratio' })], 'add');
    expect(withForm).toMatchObject({ valid: true });
    expect(withForm.parsed.meta).toMatchObject({ id: 'bare-test', chapterId: 'ratio' });
  });
});

describe('commit', () => {
  it('refuses the whole batch — and writes nothing — while any file has an error', async () => {
    const previews = await previewImports([cand('ok.json', file('ok', [q('a')])), cand('bad.json', file('bad', [{ id: 'x', question: 'Q', options: ['a'], correctAnswer: 'A' }]))], 'add');
    await expect(commitImports(previews, 'add')).rejects.toThrow(/Fix the errors in bad\.json first — nothing was imported/);
    expect(await getBankTests()).toEqual([]);
  });
  it('imports several files in one transaction and reports each', async () => {
    const changed = vi.fn();
    const off = onBankChanged(changed);
    const previews = await previewImports([cand('a.json', file('a', [q('1'), q('2')])), cand('b.json', file('b', [q('1')]))], 'add');
    const summaries = await commitImports(previews, 'add');
    off();
    expect(summaries).toEqual([{ testId: 'a', added: 2, updated: 0, skipped: 0 }, { testId: 'b', added: 1, updated: 0, skipped: 0 }]);
    expect((await getBankTests('local')).map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(changed).toHaveBeenCalledTimes(1);
    const hist = await getImportHistory();
    expect(hist.map((h) => [h.fileName, h.testId, h.mode, h.added, h.status]).sort()).toEqual([['a.json', 'a', 'add', 2, 'success'], ['b.json', 'b', 'add', 1, 'success']]);
  });
  it('a forced failure part-way leaves NOTHING behind from any file in the batch', async () => {
    const previews = await previewImports([cand('a.json', file('a', [q('1'), q('2')])), cand('b.json', file('b', [q('1'), q('2')]))], 'add');
    await expect(commitImports(previews, 'add', { afterWrite: (w) => { if (w === 5) throw new Error('storage error'); } })).rejects.toThrow(/Nothing was changed/);
    expect(await getBankTests()).toEqual([]);
    expect((await (await getDB()).getAll('questions')).length).toBe(0);
    expect((await getImportHistory()).every((h) => h.status === 'failed')).toBe(true); // the failure is recorded, inspectable
  });
  it('Merge: skip vs update, as the person chooses', async () => {
    await commitImports(await previewImports([cand('t.json', file('t', [q('a'), q('b')]))], 'add'), 'add');
    const edit = file('t', [q('b', { question: 'EDITED' }), q('c')]);
    const skip = await commitImports(await previewImports([cand('t.json', edit)], 'merge'), 'merge', { mergeConflict: 'skip' });
    expect(skip[0]).toEqual({ testId: 't', added: 1, updated: 0, skipped: 1 });
    expect((await getBankQuestions('local:t')).find((r) => r.questionId === 'b')!.data.question).toBe('Question b?');
    const update = await commitImports(await previewImports([cand('t.json', edit)], 'merge'), 'merge', { mergeConflict: 'update' });
    expect(update[0]).toMatchObject({ added: 0, updated: 1 });
    expect((await getBankQuestions('local:t')).find((r) => r.questionId === 'b')!.data.question).toBe('EDITED');
  });
  it('Replace swaps only that test\'s questions', async () => {
    await commitImports(await previewImports([cand('x.json', file('x', [q('1')])), cand('y.json', file('y', [q('1')]))], 'add'), 'add');
    await commitImports(await previewImports([cand('x.json', file('x', [q('2'), q('3')]))], 'replace'), 'replace');
    expect((await getBankQuestions('local:x')).map((r) => r.questionId)).toEqual(['2', '3']);
    expect((await getBankQuestions('local:y')).map((r) => r.questionId)).toEqual(['1']);
    expect((await getBankTest('local:x'))!.version).toBe(2);
    expect((await getBankTest('local:y'))!.version).toBe(1);
  });
  it('refuses an empty batch', async () => { await expect(commitImports([], 'add')).rejects.toThrow(/nothing to import/); });
});

describe('export bundles', () => {
  it('a bundle exports every selected test and re-imports as a batch', async () => {
    await commitImports(await previewImports([cand('a.json', file('a', [q('1'), q('2')])), cand('b.json', file('b', [q('9')]))], 'add'), 'add');
    const bundle = await exportBundle('all', new Date('2026-11-01T00:00:00Z'));
    expect(bundle.fileName).toBe('question-bank-export-2026-11-01.json');
    const db = await getDB();
    for (const s of ['tests', 'questions'] as const) await db.clear(s);
    const expanded = expandBundles([cand(bundle.fileName, bundle.text)]);
    expect(expanded).toHaveLength(2);
    const previews = await previewImports(expanded, 'add');
    expect(previews.every((p) => p.valid)).toBe(true);
    await commitImports(previews, 'add');
    expect((await getBankQuestions('local:a')).map((r) => r.questionId)).toEqual(['1', '2']);
    expect((await getBankQuestions('local:b')).map((r) => r.questionId)).toEqual(['9']);
  });
  it('a non-bundle file passes through expandBundles unchanged', () => {
    const c = cand('plain.json', file('p', [q('a')]));
    expect(expandBundles([c])).toEqual([c]);
    expect(expandBundles([cand('x.json', 'not json')]).length).toBe(1);
  });
});
