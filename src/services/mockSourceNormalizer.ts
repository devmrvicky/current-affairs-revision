// ─── Mock Source Normalizer ─────────────────────────────────────────────────
// "The rest of the application must ONLY work with normalized
// MockSourceFile... Do not make every UI component understand multiple
// schemas." This is the one place that looks at a raw JSON blob (or a
// mock.json + questions/*.md folder) and decides what shape it's in, then
// converts it. Nothing downstream of normalizeMockSource() ever sees
// anything but a fully-resolved MockSourceFile — sections always present,
// every question's `question` field always plain Markdown text ready to
// render, regardless of whether the author wrote it inline or in a
// sibling .md file.
//
// Supported author input shapes, in the order they're tried:
//  A. A plain array of questions — sections AND settings are entirely
//     DERIVED from examRegistry, never fabricated from nothing.
//  B. An object with a `questions` array (inline `question` text and/or
//     `questionFile` pointers) — `sections` are used if the author supplied
//     them, otherwise DERIVED the same way as (A). Duration/marking come
//     from `settings` if present (accepting several reasonable field-name
//     spellings — durationSeconds/durationMinutes, marksPerQuestion/
//     marksPerCorrect — because these have genuinely varied across content
//     batches), falling back to examRegistry for anything the file omits.
//
// Every path returns warnings/errors alongside the (possibly null) result —
// nothing here throws, and nothing here silently drops a mismatch.

import type { MockSourceFile, MockSourceQuestion, MockSourceSection, MockSourceValidationError } from '../types/mockSourceFile';
import { validateMockSourceFile } from '../types/mockSourceFile';
import { examRegistry } from '../data/registry/examRegistry';
import type { Exam } from '../types/exam';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import { resolveQuestionMarkdown } from './mockQuestionContentRepository';

export interface NormalizeContext {
  /** examId as derived from the file's own path (the segment right before /mocks/) — authoritative when the file's internal examId disagrees. */
  examIdFromPath: string;
  /** File/folder name without extension — used to synthesize an id/title for content that doesn't carry its own. */
  fileName: string;
  filePath: string;
  /**
   * Set only for folder-based mocks (mock.json living inside its own
   * mockId/ folder) — the directory `questionFile` and asset references
   * resolve against. Undefined for flat single-file mocks, which have no
   * folder of their own and therefore can't reference external .md/image
   * files.
   */
  baseDir?: string;
}

export interface NormalizeResult {
  file: MockSourceFile | null;
  warnings: string[];
  errors: MockSourceValidationError[];
}

function fail(ctx: NormalizeContext, mockSourceId: string, reason: string): MockSourceValidationError {
  return { mockSourceId, filePath: ctx.filePath, reason };
}

function humanizeSubject(subjectId: string): string {
  return subjectRegistry.getSubject(subjectId)?.name ?? subjectId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── questionFile resolution (folder-based mocks) ──────────────────────────
// Runs on EVERY object-shaped input, regardless of whether sections ended up
// derived or author-supplied — this is an orthogonal concern.

function resolveQuestionFiles(questions: MockSourceQuestion[], ctx: NormalizeContext): { errors: MockSourceValidationError[] } {
  const errors: MockSourceValidationError[] = [];
  for (const q of questions) {
    if (!q.questionFile) continue;
    const content = resolveQuestionMarkdown(ctx.baseDir, q.questionFile);
    if (content === null) {
      errors.push(fail(ctx, ctx.fileName, `question "${q.id}" references questionFile "${q.questionFile}" which could not be found${ctx.baseDir ? '' : ' (this mock has no folder to resolve external files against — questionFile only works for folder-based mocks: mock.json inside its own mockId/ directory)'}`));
      continue;
    }
    q.question = content;
  }
  return { errors };
}

// ─── Section range resolution (legacy questionRange field) ────────────────

function resolveQuestionRange(range: unknown, allQuestions: MockSourceQuestion[]): string[] | null {
  // Supports {start,end} (1-indexed, inclusive) or [start,end] or "12-36" — all referring to POSITION within the file's overall `questions` array.
  let start: number | undefined;
  let end: number | undefined;
  if (Array.isArray(range) && range.length === 2) [start, end] = range as [number, number];
  else if (range && typeof range === 'object') { const r = range as Record<string, unknown>; start = r.start as number; end = r.end as number; }
  else if (typeof range === 'string') { const m = range.match(/^(\d+)\s*-\s*(\d+)$/); if (m) { start = Number(m[1]); end = Number(m[2]); } }
  if (start === undefined || end === undefined || Number.isNaN(start) || Number.isNaN(end)) return null;
  const slice = allQuestions.slice(start - 1, end);
  if (slice.length !== end - start + 1) return null;
  return slice.map((q) => q.id);
}

// ─── Section derivation (the core new capability) ──────────────────────────
// Shared by the plain-array format and by any object-shaped mock that omits
// `sections` — grouping by subjectId, ordered by the exam's registered
// subject order, with proportional duration split. A subject present in the
// content but absent from examRegistry still gets a section (content never
// silently disappears), just appended after the registered ones, with a
// warning.

interface DerivedMarking {
  marksPerQuestion: number;
  negativeMarks: number;
  totalDurationSeconds: number;
}

function deriveSections(questions: MockSourceQuestion[], exam: Exam, marking: DerivedMarking, warnings: string[]): MockSourceSection[] {
  const bySubject = new Map<string, MockSourceQuestion[]>();
  for (const q of questions) {
    if (!q.subjectId) { warnings.push(`question "${q.id}" has no subjectId — excluded from every section`); continue; }
    (bySubject.get(q.subjectId) ?? bySubject.set(q.subjectId, []).get(q.subjectId)!).push(q);
  }

  const registeredOrder = exam.subjects.map((s) => s.subjectId);
  const presentSubjects = Array.from(bySubject.keys());
  const orderedSubjectIds = [
    ...registeredOrder.filter((id) => bySubject.has(id)),
    ...presentSubjects.filter((id) => !registeredOrder.includes(id)),
  ];
  const unregistered = presentSubjects.filter((id) => !registeredOrder.includes(id));
  if (unregistered.length > 0) {
    warnings.push(`subject(s) ${unregistered.join(', ')} are not in ${exam.name}'s registered subject list — appended after the registered sections rather than dropped`);
  }

  const totalQuestions = questions.length;
  return orderedSubjectIds.map((subjectId) => {
    const qs = bySubject.get(subjectId)!;
    const durationSeconds = totalQuestions > 0 ? Math.round((qs.length / totalQuestions) * marking.totalDurationSeconds / 60) * 60 : 0;
    return {
      id: subjectId,
      title: humanizeSubject(subjectId),
      subjectId,
      questionCount: qs.length,
      marksPerQuestion: marking.marksPerQuestion,
      negativeMarks: marking.negativeMarks,
      durationSeconds,
      questionIds: qs.map((q) => q.id),
    };
  });
}

/** Resolves per-question marking + total duration from (in priority order) the mock's own settings, then examRegistry — several reasonable field-name spellings accepted since these have varied across content batches. Never fabricates a number neither source provides; falls back to 0 with a warning in that case. */
function resolveMarking(settings: Record<string, unknown> | undefined, exam: Exam | undefined, warnings: string[]): DerivedMarking {
  const marksPerQuestion =
    (settings?.marksPerQuestion as number) ?? (settings?.marksPerCorrect as number) ?? exam?.mockConfig.marking.marksPerCorrect;
  const negativeMarks =
    (settings?.negativeMarks as number) ?? exam?.mockConfig.marking.negativeMarks;
  const totalDurationSeconds =
    (settings?.durationSeconds as number) ??
    (typeof settings?.durationMinutes === 'number' ? (settings.durationMinutes as number) * 60 : undefined) ??
    (exam ? exam.mockConfig.durationMinutes * 60 : undefined);

  if (marksPerQuestion === undefined || negativeMarks === undefined || totalDurationSeconds === undefined) {
    warnings.push('marking/duration not fully specified by the mock and no matching exam configuration was found — using 0 for whatever is missing rather than guessing');
  }
  return { marksPerQuestion: marksPerQuestion ?? 0, negativeMarks: negativeMarks ?? 0, totalDurationSeconds: totalDurationSeconds ?? 0 };
}

// ─── Format: object with a `questions` array ───────────────────────────────
// Covers the canonical single-file format, the folder-based mock.json
// format (questionFile pointers, sections omitted), and legacy field-name
// variants (mockId/durationMinutes/questionRange) — all funneled through one
// flexible path rather than three separate ones, since the differences
// between them are just "which field names are present", not different
// structural shapes.

function normalizeMockObject(raw: Record<string, unknown>, ctx: NormalizeContext): NormalizeResult {
  const warnings: string[] = [];
  const rawId = (raw.id ?? raw.mockId) as string | undefined;
  const mockSourceId = rawId ?? `${ctx.examIdFromPath}-${ctx.fileName}`;
  if (!rawId) warnings.push(`no "id"/"mockId" field — synthesized "${mockSourceId}" from the file path`);

  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw)) {
    return { file: null, warnings, errors: [fail(ctx, mockSourceId, 'no "questions" array found')] };
  }
  const questions = questionsRaw as MockSourceQuestion[];

  // examId: the path is authoritative; a mismatch is surfaced, never silent.
  let examId = (raw.examId as string) ?? ctx.examIdFromPath;
  if (raw.examId && raw.examId !== ctx.examIdFromPath) {
    warnings.push(`file declares examId "${raw.examId}" but lives under "${ctx.examIdFromPath}/mocks/" — using "${ctx.examIdFromPath}" (the path) as authoritative`);
    examId = ctx.examIdFromPath;
  }
  const exam = examRegistry.getExam(examId);
  if (!exam) {
    return { file: null, warnings, errors: [fail(ctx, mockSourceId, `examId "${examId}" is not registered in examRegistry`)] };
  }

  const errors: MockSourceValidationError[] = [];

  // questionFile resolution happens before section derivation so section
  // question counts/order are computed against fully-resolved content.
  errors.push(...resolveQuestionFiles(questions, ctx).errors);

  const settingsRaw = (raw.settings && typeof raw.settings === 'object' ? raw.settings : raw) as Record<string, unknown>;
  const marking = resolveMarking(settingsRaw, exam, warnings);

  let sections: MockSourceSection[];
  const sectionsRaw = raw.sections;
  if (Array.isArray(sectionsRaw) && sectionsRaw.length > 0) {
    // Author supplied sections explicitly — map field-name variants (questionRange -> questionIds) but otherwise respect them as authoritative.
    sections = (sectionsRaw as Record<string, unknown>[]).map((s, i) => {
      let questionIds = Array.isArray(s.questionIds) ? (s.questionIds as string[]) : undefined;
      if (!questionIds && s.questionRange !== undefined) {
        const resolved = resolveQuestionRange(s.questionRange, questions);
        if (!resolved) errors.push(fail(ctx, mockSourceId, `section "${s.id ?? i}" has a questionRange that could not be resolved against the question list`));
        questionIds = resolved ?? [];
      }
      questionIds ??= [];
      const sectionDuration = typeof s.durationSeconds === 'number' ? s.durationSeconds
        : typeof s.durationMinutes === 'number' ? (s.durationMinutes as number) * 60
        : Math.round((questionIds.length / Math.max(questions.length, 1)) * marking.totalDurationSeconds / 60) * 60;
      return {
        id: (s.id as string) ?? `section-${i}`,
        title: (s.title as string) ?? (s.id as string) ?? `Section ${i + 1}`,
        subjectId: (s.subjectId as string) ?? (s.id as string) ?? 'unknown',
        questionCount: typeof s.questionCount === 'number' ? s.questionCount : questionIds.length,
        marksPerQuestion: (s.marksPerQuestion as number) ?? marking.marksPerQuestion,
        negativeMarks: (s.negativeMarks as number) ?? marking.negativeMarks,
        durationSeconds: sectionDuration,
        questionIds,
      };
    });
  } else {
    // THE core new capability: no manual section configuration at all — derive entirely from question subjectId grouping.
    sections = deriveSections(questions, exam, marking, warnings);
  }

  const totalQuestions = sections.reduce((s, sec) => s + sec.questionCount, 0);
  const totalMarks = sections.reduce((s, sec) => s + sec.questionCount * sec.marksPerQuestion, 0);
  const totalDuration = sections.reduce((s, sec) => s + sec.durationSeconds, 0);

  if (totalQuestions !== exam.mockConfig.questions) {
    warnings.push(`this mock has ${totalQuestions} questions, but ${exam.name}'s configured full-mock pattern is ${exam.mockConfig.questions} — using the actual ${totalQuestions} rather than fabricating the difference`);
  }

  const file: MockSourceFile = {
    id: mockSourceId,
    examId,
    tierId: raw.tierId as string | undefined,
    title: (raw.title as string) ?? mockSourceId,
    type: 'full-mock',
    source: raw.source as MockSourceFile['source'],
    settings: {
      totalQuestions,
      totalMarks,
      durationSeconds: totalDuration,
      negativeMarks: marking.negativeMarks,
      timingMode: (settingsRaw.timingMode as MockSourceFile['settings']['timingMode']) ?? 'sectional',
      canTransferTime: (settingsRaw.canTransferTime as boolean) ?? false,
      sectionNavigation: (settingsRaw.sectionNavigation as MockSourceFile['settings']['sectionNavigation']) ?? 'sequential-locked',
      questionNavigation: (settingsRaw.questionNavigation as MockSourceFile['settings']['questionNavigation']) ?? 'within-section',
      randomizeQuestions: (settingsRaw.randomizeQuestions as boolean) ?? false,
      cutoff: settingsRaw.cutoff as MockSourceFile['settings']['cutoff'],
    },
    sections,
    questions,
    baseDir: ctx.baseDir,
  };

  return { file, warnings, errors };
}

// ─── Format A: plain question array ────────────────────────────────────────

function normalizeQuestionArray(questions: MockSourceQuestion[], ctx: NormalizeContext): NormalizeResult {
  const warnings: string[] = [];
  const mockSourceId = `${ctx.examIdFromPath}-${ctx.fileName}`;

  const exam = examRegistry.getExam(ctx.examIdFromPath);
  if (!exam) {
    return { file: null, warnings, errors: [fail(ctx, mockSourceId, `examId "${ctx.examIdFromPath}" (derived from the file's path) is not registered in examRegistry`)] };
  }

  const errors = resolveQuestionFiles(questions, ctx).errors;
  const marking = resolveMarking(undefined, exam, warnings);
  const sections = deriveSections(questions, exam, marking, warnings);
  const totalQuestions = sections.reduce((s, sec) => s + sec.questionCount, 0);

  if (totalQuestions !== exam.mockConfig.questions) {
    warnings.push(`this mock has ${totalQuestions} questions, but ${exam.name}'s configured full-mock pattern is ${exam.mockConfig.questions} — using the actual ${totalQuestions} rather than fabricating the difference`);
  }

  const withPyq = questions.find((q) => q.sourceMeta?.pyq);
  const pyq = withPyq?.sourceMeta?.pyq;
  const title = pyq
    ? `${pyq.exam ?? exam.name} — ${pyq.date ?? ''}${pyq.shift ? ` (${pyq.shift})` : ''}`.trim()
    : `${exam.name} — ${ctx.fileName}`;

  const file: MockSourceFile = {
    id: mockSourceId,
    examId: exam.id,
    title,
    type: 'full-mock',
    source: pyq ? { type: 'pyq', date: pyq.date, shift: pyq.shift } : undefined,
    settings: {
      totalQuestions,
      totalMarks: sections.reduce((s, sec) => s + sec.questionCount * sec.marksPerQuestion, 0),
      durationSeconds: sections.reduce((s, sec) => s + sec.durationSeconds, 0),
      negativeMarks: marking.negativeMarks,
      timingMode: 'sectional',
      canTransferTime: false,
      sectionNavigation: 'sequential-locked',
      questionNavigation: 'within-section',
      randomizeQuestions: false,
    },
    sections,
    questions,
    baseDir: ctx.baseDir,
  };

  return { file, warnings, errors };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function normalizeMockSource(raw: unknown, ctx: NormalizeContext): NormalizeResult {
  if (Array.isArray(raw)) {
    return normalizeQuestionArray(raw as MockSourceQuestion[], ctx);
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).questions)) {
    return normalizeMockObject(raw as Record<string, unknown>, ctx);
  }
  return { file: null, warnings: [], errors: [fail(ctx, ctx.fileName, 'file is neither a question array nor an object with a "questions" array')] };
}

/** Runs the shared structural validation (option counts, id resolution, count reconciliation) after normalization, regardless of which input format produced the MockSourceFile. */
export function validateNormalized(file: MockSourceFile, filePath: string): MockSourceValidationError[] {
  return validateMockSourceFile(file, filePath);
}
