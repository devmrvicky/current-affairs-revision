// ─── ExamVerse question-file validation (for Author Studio) ──────────────────
// Validates against the format the app ACTUALLY loads — not an invented one.
// The real loaders (services/canonicalQuestionNormalizer.ts, types/universalQuestion.ts)
// accept two container shapes and two option shapes, so this does too:
//   • container:  a bare array of questions, or { questions: [...] } (older "quiz" shape)
//   • options:    plain strings (letters A, B, C… assigned in order) or { id, text, image? }
//   • answer:     an option id ("B"), a bare letter, or the option's exact text
//   • id:         a string (native) or a number (legacy)
//
// Severity follows what the app does with the content:
//   error   — the question cannot be presented or scored (the engine drops it from tests)
//   warning — it plays, but something is missing or points at nothing the app knows

import { normalizeOptions, resolveCorrectAnswer, unwrapQuestionFile } from '../canonicalQuestionNormalizer';
import { SUBJECTS, TOPICS } from '../../data/registry/subjectRegistry';
import { EXAMS } from '../../data/registry/examRegistry';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  questionIndex?: number;
  questionId?: string;
  field?: string;
}

export interface QuestionPreview {
  index: number;
  id: string;
  question: string;
  options: { id: string; text: string }[];
  /** Resolved to an option id when it could be matched; otherwise the raw value. */
  correctAnswer: string;
  explanation?: string;
  difficulty?: string;
  subjectId?: string;
  topicId?: string;
  /** False when this question has at least one error. */
  valid: boolean;
}

export interface FileValidation {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  questionCount: number;
  questions: QuestionPreview[];
  shape: 'array' | 'wrapped' | 'invalid';
  meta: { title?: string; subjects: string[]; topics: string[] };
}

export const SUPPORTED_QUESTION_TYPES = ['mcq', 'true_false', 'fill_blank'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const LANGUAGES = ['en', 'hi', 'bilingual'];

const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));
const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const EXAM_IDS = new Set(EXAMS.map((e) => e.id));

function emptyResult(shape: FileValidation['shape'], errors: ValidationIssue[]): FileValidation {
  return { valid: false, errors, warnings: [], questionCount: 0, questions: [], shape, meta: { subjects: [], topics: [] } };
}

/**
 * Finds the first syntax error in a JSON text. JSON.parse's own message differs between engines
 * (Chrome, Firefox, Safari, Node all word it differently and not all give a position), so the
 * location shown to the author comes from this small recursive-descent scan instead.
 */
export function locateJsonError(text: string): { pos: number; message: string } | null {
  let i = 0;
  const fail = (message: string, specific = false): never => {
    // Running off the end is one problem, whatever token was expected next — unless the message already says it better.
    throw { pos: i, message: !specific && i >= text.length ? 'Unexpected end of file — a closing "]" or "}" is missing' : message };
  };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = () => {
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') { i++; return; }
      if (c === '\\') { i += 2; continue; }
      if (c < ' ') fail('Unescaped line break or control character inside a string');
      i++;
    }
    fail('Unterminated string (missing closing quote)', true);
  };
  const num = () => {
    const re = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) fail('Invalid number');
    i += m![0].length;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('Expected a property name in double quotes');
        str(); ws();
        if (text[i] !== ':') fail("Expected ':' after the property name");
        i++; value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return; }
        fail("Expected ',' or '}' (a comma may be missing)");
      }
    } else if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (;;) {
        value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return; }
        fail("Expected ',' or ']' (a comma may be missing)");
      }
    } else if (c === '"') str();
    else if (c === '-' || (c >= '0' && c <= '9')) num();
    else if (text.startsWith('true', i)) i += 4;
    else if (text.startsWith('false', i)) i += 5;
    else if (text.startsWith('null', i)) i += 4;
    else fail(c === undefined ? 'Unexpected end of file' : `Unexpected character '${c}'`);
  };
  try {
    value(); ws();
    if (i < text.length) fail('Unexpected content after the end of the JSON');
    return null;
  } catch (e) {
    if (e && typeof e === 'object' && 'pos' in e) return e as { pos: number; message: string };
    throw e;
  }
}

function describeJsonError(text: string, err: unknown): string {
  const loc = locateJsonError(text);
  if (loc) {
    const before = text.slice(0, loc.pos);
    const line = before.split('\n').length;
    const col = loc.pos - (before.lastIndexOf('\n') + 1) + 1;
    return `Not valid JSON — ${loc.message} (line ${line}, column ${col})`;
  }
  return `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
}

export function validateQuestionFileText(input: string): FileValidation {
  // Editors on Windows often save a byte-order mark; JSON.parse rejects it. Tolerate it, but say so.
  const hadBom = input.charCodeAt(0) === 0xfeff;
  const text = hadBom ? input.slice(1) : input;
  if (!text.trim()) {
    return emptyResult('invalid', [{ severity: 'error', code: 'empty-file', message: 'The file is empty.' }]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return emptyResult('invalid', [{ severity: 'error', code: 'invalid-json', message: describeJsonError(text, err) }]);
  }
  const result = validateQuestionFileData(raw);
  if (hadBom) result.warnings.unshift({ severity: 'warning', code: 'byte-order-mark', message: 'The file starts with a byte-order mark (BOM). It was ignored while checking; consider saving as UTF-8 without BOM.' });
  return result;
}

export function validateQuestionFileData(raw: unknown): FileValidation {
  const list = unwrapQuestionFile(raw);
  if (!list) {
    return emptyResult('invalid', [{
      severity: 'error', code: 'not-a-question-file',
      message: 'Expected a JSON array of questions, or an object with a "questions" array.',
    }]);
  }
  const shape: FileValidation['shape'] = Array.isArray(raw) ? 'array' : 'wrapped';
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const previews: QuestionPreview[] = [];
  const seenIds = new Map<string, number>();
  const subjects = new Set<string>();
  const topics = new Set<string>();

  if (list.length === 0) {
    errors.push({ severity: 'error', code: 'no-questions', message: 'The file contains no questions.' });
  }

  list.forEach((item, index) => {
    const issues: ValidationIssue[] = [];
    const add = (severity: IssueSeverity, code: string, message: string, field?: string, questionId?: string) =>
      issues.push({ severity, code, message, field, questionIndex: index, questionId });

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ severity: 'error', code: 'not-an-object', message: `Question ${index + 1} is not an object.`, questionIndex: index });
      previews.push({ index, id: '', question: '', options: [], correctAnswer: '', valid: false });
      return;
    }
    const q = item as Record<string, unknown>;

    // id — required, unique within the file
    const idRaw = q.id;
    const hasId = (typeof idRaw === 'string' && idRaw.trim() !== '') || (typeof idRaw === 'number' && Number.isFinite(idRaw));
    const id = hasId ? String(idRaw) : '';
    if (!hasId) add('error', 'missing-id', 'Missing "id" (a non-empty string or number).', 'id');
    else if (seenIds.has(id)) add('error', 'duplicate-id', `Duplicate id "${id}" — also used by question ${seenIds.get(id)! + 1}.`, 'id', id);
    else seenIds.set(id, index);

    // question text
    const qText = typeof q.question === 'string' ? q.question : '';
    if (!qText.trim()) add('error', 'missing-question', 'Missing question text.', 'question', id);

    // type
    if (q.questionType !== undefined && !SUPPORTED_QUESTION_TYPES.includes(String(q.questionType))) {
      add('error', 'unsupported-type', `Unsupported questionType "${String(q.questionType)}" (supported: ${SUPPORTED_QUESTION_TYPES.join(', ')}).`, 'questionType', id);
    }

    // options
    let options: { id: string; text: string; image?: string }[] = [];
    if (!Array.isArray(q.options)) {
      add('error', 'missing-options', 'Missing "options" array.', 'options', id);
    } else {
      options = normalizeOptions(q.options);
      if (options.length < 2) add('error', 'too-few-options', `At least 2 options are needed (found ${options.length}).`, 'options', id);
      if (options.length > 6) add('warning', 'many-options', `${options.length} options — the app labels at most A–F.`, 'options', id);
      const seenOpt = new Set<string>();
      for (const o of options) {
        if (seenOpt.has(o.id)) add('error', 'duplicate-option-id', `Option id "${o.id}" is used more than once.`, 'options', id);
        seenOpt.add(o.id);
        if (!o.text.trim() && !o.image) add('warning', 'empty-option', `Option ${o.id} has no text or image.`, 'options', id);
      }
    }

    // answer
    const answerRaw = q.correctAnswer;
    let answer = '';
    if (answerRaw === undefined || answerRaw === null || String(answerRaw).trim() === '') {
      add('error', 'missing-answer', 'Missing "correctAnswer".', 'correctAnswer', id);
    } else {
      answer = resolveCorrectAnswer(options, answerRaw);
      if (options.length > 0 && !options.some((o) => o.id === answer)) {
        add('error', 'answer-not-in-options', `correctAnswer "${String(answerRaw)}" matches no option (expected an option id like "B", or the exact option text).`, 'correctAnswer', id);
      }
    }

    // explanation
    if (q.explanation !== undefined && typeof q.explanation !== 'string') add('error', 'bad-explanation', '"explanation" must be a string.', 'explanation', id);
    else if (typeof q.explanation !== 'string' || !q.explanation.trim()) add('warning', 'missing-explanation', 'No explanation.', 'explanation', id);

    // difficulty / language
    if (q.difficulty === undefined) add('warning', 'missing-difficulty', 'No difficulty (easy, medium or hard).', 'difficulty', id);
    else if (!DIFFICULTIES.includes(String(q.difficulty))) add('error', 'invalid-difficulty', `Invalid difficulty "${String(q.difficulty)}" (use easy, medium or hard).`, 'difficulty', id);
    if (q.language !== undefined && !LANGUAGES.includes(String(q.language))) add('warning', 'invalid-language', `Unknown language "${String(q.language)}" (use en, hi or bilingual).`, 'language', id);

    // references into the app's registries
    const subjectId = typeof q.subjectId === 'string' ? q.subjectId : undefined;
    const topicId = typeof q.topicId === 'string' ? q.topicId : undefined;
    if (subjectId) {
      subjects.add(subjectId);
      if (!SUBJECT_IDS.has(subjectId)) add('warning', 'unknown-subject', `subjectId "${subjectId}" is not a subject the app knows.`, 'subjectId', id);
    }
    if (topicId) {
      topics.add(topicId);
      const known = TOPIC_BY_ID.get(topicId);
      if (!known) add('warning', 'unknown-topic', `topicId "${topicId}" is not a topic the app knows.`, 'topicId', id);
      else if (subjectId && known.subjectId !== subjectId) add('warning', 'topic-subject-mismatch', `topicId "${topicId}" belongs to "${known.subjectId}", not "${subjectId}".`, 'topicId', id);
    }
    if (q.examIds !== undefined) {
      if (!Array.isArray(q.examIds) || q.examIds.some((e) => typeof e !== 'string')) add('error', 'bad-examIds', '"examIds" must be an array of strings.', 'examIds', id);
      else for (const e of q.examIds as string[]) if (!EXAM_IDS.has(e)) add('warning', 'unknown-exam', `examId "${e}" is not an exam the app knows.`, 'examIds', id);
    }
    if (q.tags !== undefined && (!Array.isArray(q.tags) || q.tags.some((t) => typeof t !== 'string'))) add('warning', 'bad-tags', '"tags" should be an array of strings.', 'tags', id);

    for (const i of issues) (i.severity === 'error' ? errors : warnings).push(i);
    previews.push({
      index, id, question: qText, options: options.map((o) => ({ id: o.id, text: o.text })), correctAnswer: answer,
      explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
      difficulty: typeof q.difficulty === 'string' ? q.difficulty : undefined,
      subjectId, topicId, valid: !issues.some((i) => i.severity === 'error'),
    });
  });

  const wrapper = shape === 'wrapped' ? (raw as { title?: unknown; topic?: unknown }) : null;
  const title = wrapper ? (typeof wrapper.title === 'string' ? wrapper.title : typeof wrapper.topic === 'string' ? wrapper.topic : undefined) : undefined;

  return {
    valid: errors.length === 0,
    errors, warnings,
    questionCount: list.length,
    questions: previews,
    shape,
    meta: { title, subjects: [...subjects], topics: [...topics] },
  };
}

/** Compact summary stored on the file record, so lists and the dashboard never re-parse content. */
export function summarizeValidation(v: FileValidation, now: number = Date.now()) {
  return {
    valid: v.valid, errors: v.errors.length, warnings: v.warnings.length, questions: v.questionCount, checkedAt: now,
    title: v.meta.title, subjects: v.meta.subjects, topics: v.meta.topics,
  };
}
