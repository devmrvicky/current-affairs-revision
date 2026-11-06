import { describe, it, expect } from 'vitest';
import { validateQuestionFileText, validateQuestionFileData } from './authorValidation';

const native = (over: Record<string, unknown> = {}) => ({
  id: 'avg01', question: '89, 92, 78, 56, 85 का औसत?', correctAnswer: 'B', difficulty: 'medium', language: 'hi',
  options: [{ id: 'A', text: '78' }, { id: 'B', text: '80' }, { id: 'C', text: '85' }, { id: 'D', text: '89' }], explanation: 'योग / 5', ...over,
});

const codes = (r: ReturnType<typeof validateQuestionFileData>, k: 'errors' | 'warnings') => r[k].map((i) => i.code);

describe('accepts every shape the real app loads', () => {
  it('native array with object options', () => {
    const r = validateQuestionFileData([native()]);
    expect(r).toMatchObject({ valid: true, shape: 'array', questionCount: 1 });
    expect(r.errors).toEqual([]);
  });
  it('legacy wrapped file: numeric ids, string options, answer given as option TEXT', () => {
    const r = validateQuestionFileData({ date: '2026-01-01', questions: [{ id: 1, question: 'Capital of India?', options: ['Mumbai', 'New Delhi', 'Pune', 'Agra'], correctAnswer: 'New Delhi', explanation: 'x' }] });
    expect(r.shape).toBe('wrapped');
    expect(r.valid).toBe(true);
    expect(r.questions[0].correctAnswer).toBe('B'); // resolved to the option id
    expect(codes(r, 'warnings')).toContain('missing-difficulty');
  });
  it('a real shipped file validates (the Average chapter from the bank)', () => {
    const files = import.meta.glob('../../data/chapters/Mathematics/Average/Average 01.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const text = Object.values(files)[0];
    expect(typeof text).toBe('string');
    const r = validateQuestionFileText(text);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.questionCount).toBeGreaterThan(5);
  });
});

describe('reports what the app would reject', () => {
  it('invalid JSON gets a line and column', () => {
    const r = validateQuestionFileText('[\n  { "id": 1,\n  "question": }\n]');
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('invalid-json');
    expect(r.errors[0].message).toMatch(/line 3/);
  });
  it('locates common mistakes the same way in every engine', () => {
    const where = (txt: string) => validateQuestionFileText(txt).errors[0].message;
    expect(where('[{"id":1 "q":2}]')).toMatch(/comma may be missing.*line 1, column 10/);
    expect(where('[{"id":1,}]')).toMatch(/property name in double quotes/);
    expect(where('[{"a":"unterminated}]')).toMatch(/Unterminated string/);
    expect(where('[1,2')).toMatch(/Unexpected end of file/);
    expect(where('[1] extra')).toMatch(/after the end/);
  });
  it('tolerates a byte-order mark but warns about it', () => {
    const r = validateQuestionFileText('\uFEFF' + JSON.stringify([native()]));
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('byte-order-mark');
  });
  it('empty file, non-question JSON, empty list', () => {
    expect(validateQuestionFileText('  ').errors[0].code).toBe('empty-file');
    expect(validateQuestionFileText('{"a":1}').errors[0].code).toBe('not-a-question-file');
    expect(codes(validateQuestionFileData([]), 'errors')).toContain('no-questions');
  });
  it('missing and duplicate ids, missing text/options/answer', () => {
    const r = validateQuestionFileData([native({ id: undefined }), native({ id: 'dup' }), native({ id: 'dup' }), native({ id: 'x', question: ' ' }), native({ id: 'y', options: undefined }), native({ id: 'z', correctAnswer: undefined })]);
    expect(codes(r, 'errors')).toEqual(expect.arrayContaining(['missing-id', 'duplicate-id', 'missing-question', 'missing-options', 'missing-answer']));
    expect(r.questions.filter((q) => !q.valid).length).toBe(5);
    expect(r.valid).toBe(false);
  });
  it('answer that matches no option; too few options; duplicate option ids', () => {
    const r = validateQuestionFileData([native({ id: 'a', correctAnswer: 'Z' }), native({ id: 'b', options: [{ id: 'A', text: 'only' }], correctAnswer: 'A' }), native({ id: 'c', options: [{ id: 'A', text: '1' }, { id: 'A', text: '2' }], correctAnswer: 'A' })]);
    expect(codes(r, 'errors')).toEqual(expect.arrayContaining(['answer-not-in-options', 'too-few-options', 'duplicate-option-id']));
  });
  it('unsupported question type and invalid difficulty are errors', () => {
    const r = validateQuestionFileData([native({ id: 'a', questionType: 'essay' }), native({ id: 'b', difficulty: 'impossible' })]);
    expect(codes(r, 'errors')).toEqual(expect.arrayContaining(['unsupported-type', 'invalid-difficulty']));
  });
});

describe('invalid references are warnings, never silent', () => {
  it('unknown subject/topic/exam, and a topic under the wrong subject', () => {
    const r = validateQuestionFileData([
      native({ id: 'a', subjectId: 'astrology' }),
      native({ id: 'b', topicId: 'no-such-topic' }),
      native({ id: 'c', examIds: ['not-an-exam'] }),
      native({ id: 'd', subjectId: 'mathematics', topicId: 'budget' }), // 'budget' is a current-affairs topic
    ]);
    expect(r.valid).toBe(true);
    expect(codes(r, 'warnings')).toEqual(expect.arrayContaining(['unknown-subject', 'unknown-topic', 'unknown-exam', 'topic-subject-mismatch']));
    expect(r.meta.subjects).toEqual(expect.arrayContaining(['astrology', 'mathematics']));
  });
  it('missing explanation is a warning only', () => {
    const r = validateQuestionFileData([native({ explanation: undefined })]);
    expect(r.valid).toBe(true);
    expect(codes(r, 'warnings')).toContain('missing-explanation');
  });
});
