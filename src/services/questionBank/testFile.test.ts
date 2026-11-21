import { describe, expect, it } from 'vitest';
import { contentHash, examIdsForSubject, parseTestFile, questionStartOffsets, serializeTestFile } from './testFile';

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, question: `Question ${id}?`, options: ['one', 'two', 'three', 'four'], correctAnswer: 'B', explanation: `Because ${id}`, difficulty: 'easy', ...extra });
const wrapper = (questions: unknown[], meta: Record<string, unknown> = {}) => JSON.stringify({ id: 'avg-1', title: 'Average 1', subject: 'mathematics', chapter: 'Average', questions, ...meta }, null, 2);

describe('parseTestFile — a valid test', () => {
  it('reads the test details from a wrapper and normalizes every question', () => {
    const r = parseTestFile(wrapper([q('a'), q('b', { difficulty: 'hard' }), q('c', { difficulty: undefined })]), 'avg.json');
    expect(r.ok).toBe(true);
    expect(r.meta).toMatchObject({ id: 'avg-1', title: 'Average 1', subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average' });
    expect(r.questionCount).toBe(3);
    expect(r.difficulty).toEqual({ easy: 1, medium: 0, hard: 1, unspecified: 1 });
    expect(r.questions[0]).toMatchObject({ id: 'a', correctAnswer: 'B', questionType: 'mcq' });
    expect(r.questions[0].options.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('accepts every existing option / answer / id shape (string or {id,text} options; answer as id, letter or text; numeric ids)', () => {
    const items = [
      { id: 1, question: 'n', options: [{ id: 'A', text: 'x' }, { id: 'B', text: 'y' }], correctAnswer: 'A' },
      { id: 'two', question: 't', options: ['x', 'y'], correctAnswer: 'y' },
    ];
    const r = parseTestFile(JSON.stringify({ title: 't', subject: 'mathematics', chapter: 'c', id: 'x', questions: items }), 'f.json');
    expect(r.ok).toBe(true);
    expect(r.questions.map((x) => [x.id, x.correctAnswer])).toEqual([['1', 'A'], ['two', 'B']]);
  });
  it('a bare array has no details: they come from the form (overrides), and the title/id default from the file name', () => {
    const bare = JSON.stringify([q('a')]);
    const without = parseTestFile(bare, 'My Test.json');
    expect(without.ok).toBe(false);
    expect(without.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['missing-subject', 'missing-chapter']));
    const withForm = parseTestFile(bare, 'My Test.json', { subjectId: 'mathematics', chapterTitle: 'Simple Interest' });
    expect(withForm.ok).toBe(true);
    expect(withForm.meta).toMatchObject({ id: 'my-test', title: 'My Test', chapterId: 'simple-interest', chapterTitle: 'Simple Interest' });
  });
  it('resolves a friendly subject name and derives exams from the subject', () => {
    expect(parseTestFile(wrapper([q('a')], { subject: 'Mathematics' }), 'f.json').meta?.subjectId).toBe('mathematics');
    expect(examIdsForSubject('mathematics').length).toBeGreaterThan(0);
  });
  it('tolerates a UTF-8 byte-order mark', () => {
    expect(parseTestFile('\uFEFF' + wrapper([q('a')]), 'f.json').ok).toBe(true);
  });
});

describe('parseTestFile — errors with exact locations, never a silent drop', () => {
  it('syntax error: exact line and column', () => {
    const r = parseTestFile('{\n  "title": "T",\n  "questions": [ {"id": 1,, } ]\n}', 'bad.json');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ code: 'invalid-json', line: 3 });
    expect(r.errors[0].column).toBeGreaterThan(1);
    expect(r.questions).toEqual([]);
  });
  it('a bad question reports its index, id, field AND the line it starts on', () => {
    const text = wrapper([q('good'), { id: 'bad', question: 'Q?', options: ['x', 'y'], correctAnswer: 'Z' }, q('also-good')]);
    const r = parseTestFile(text, 'f.json');
    expect(r.ok).toBe(false);
    const e = r.errors.find((x) => x.code === 'answer-not-in-options')!;
    expect(e).toMatchObject({ questionIndex: 1, questionId: 'bad' });
    const expectedLine = text.split('\n').findIndex((l) => l.includes('"id": "bad"')) + 1;
    expect(e.line).toBe(expectedLine - 1); // the "{" that opens that question is on the line above its first field
    expect(r.questions).toEqual([]); // an invalid file imports nothing — questions are never quietly dropped or fixed
  });
  it.each([
    ['missing correctAnswer', { id: 'x', question: 'Q?', options: ['a', 'b'] }, 'missing-answer'],
    ['empty question text', { id: 'x', question: '  ', options: ['a', 'b'], correctAnswer: 'A' }, 'missing-question'],
    ['too few options', { id: 'x', question: 'Q?', options: ['a'], correctAnswer: 'A' }, 'too-few-options'],
    ['unsupported type', { id: 'x', question: 'Q?', options: ['a', 'b'], correctAnswer: 'A', questionType: 'essay' }, 'unsupported-type'],
    ['missing id', { question: 'Q?', options: ['a', 'b'], correctAnswer: 'A' }, 'missing-id'],
  ])('%s', (_name, bad, code) => {
    const r = parseTestFile(wrapper([bad]), 'f.json');
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain(code);
  });
  it('duplicate question ids inside the file are an error, and are listed', () => {
    const r = parseTestFile(wrapper([q('a'), q('b'), q('a')]), 'f.json');
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain('duplicate-id');
    expect(r.duplicateIdsInFile).toEqual(['a']);
  });
  it('an empty file, a file with no questions, and a non-question JSON are each reported', () => {
    expect(parseTestFile('', 'f.json').errors[0].code).toBe('empty-file');
    expect(parseTestFile(wrapper([]), 'f.json').errors.map((e) => e.code)).toContain('no-questions');
    expect(parseTestFile('{"hello": 1}', 'f.json').errors[0].code).toBe('not-a-question-file');
  });
  it('test-level problems: bad id, unknown subject, missing chapter', () => {
    expect(parseTestFile(wrapper([q('a')], { id: 'has space' }), 'f.json').errors.map((e) => e.code)).toContain('bad-test-id');
    expect(parseTestFile(wrapper([q('a')], { subject: 'underwater-basket-weaving' }), 'f.json').errors.map((e) => e.code)).toContain('unknown-subject');
    expect(parseTestFile(wrapper([q('a')], { chapter: undefined }), 'f.json').errors.map((e) => e.code)).toContain('missing-chapter');
  });
  it('an unknown exam is only a warning', () => {
    const r = parseTestFile(wrapper([q('a')], { examIds: ['ssc-chsl', 'not-an-exam'] }), 'f.json');
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('unknown-exam');
  });
  it('rejects a file over the size limit before parsing it', () => {
    const r = parseTestFile('[' + '"x",'.repeat(2_000_000) + '"x"]', 'huge.json');
    expect(r.errors[0].code).toBe('file-too-large');
  });
});

describe('questionStartOffsets', () => {
  it('finds each question in a bare array and in a wrapper, even with strings containing brackets and quotes', () => {
    const text = '[ {"id":"a","question":"has ] and \\" quote"}, {"id":"b"} ]';
    const offs = questionStartOffsets(text)!;
    expect(offs.map((o) => text.slice(o, o + 10))).toEqual(['{"id":"a",', '{"id":"b"}']);
    expect(questionStartOffsets('{"title":"t","tags":[1,2],"questions":[{"id":1},{"id":2}]}')).toHaveLength(2);
    expect(questionStartOffsets('{"nothing":1}')).toBeNull();
  });
});

describe('serializeTestFile', () => {
  it('round-trips through the parser and gives a stable content hash', () => {
    const parsed = parseTestFile(wrapper([q('a'), q('b')]), 'f.json');
    const meta = { ...parsed.meta!, version: 3 };
    const text = serializeTestFile(meta, parsed.questions);
    const again = parseTestFile(text, 'f.json');
    expect(again.ok).toBe(true);
    expect(again.meta).toMatchObject({ id: 'avg-1', version: 3, subjectId: 'mathematics', chapterId: 'average' });
    expect(again.questions).toEqual(parsed.questions);
    expect(serializeTestFile(again.meta!, again.questions)).toBe(text);
    expect(contentHash(text)).toBe(contentHash(serializeTestFile(again.meta!, again.questions)));
    expect(contentHash(text)).toMatch(/^[0-9a-f]{64}$/);
  });
});
