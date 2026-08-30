// ─── Mock Source Normalizer ─────────────────────────────────────────────────
// "The rest of the application must ONLY work with normalized
// MockSourceFile... Do not make every UI component understand multiple
// schemas." This is the one place that looks at a raw JSON blob and decides
// what shape it's in, then converts it. Nothing downstream of
// normalizeMockSource() ever sees anything but a MockSourceFile.
//
// Three input shapes are supported:
//  A. Canonical MockSourceFile object (id/examId/settings/sections/questions)
//  B. A plain array of questions — sections/settings are DERIVED from
//     examRegistry, never fabricated from nothing.
//  C. A "legacy-ish" object using different field names (mockId instead of
//     id, durationMinutes instead of durationSeconds, questionRange instead
//     of questionIds, etc.) — mapped onto the canonical shape field-by-field.
//
// Every path returns warnings/errors alongside the (possibly null) result —
// nothing here throws, and nothing here silently drops a mismatch.

import type { MockSourceFile, MockSourceQuestion, MockSourceSection, MockSourceValidationError } from '../types/mockSourceFile';
import { validateMockSourceFile } from '../types/mockSourceFile';
import { examRegistry } from '../data/registry/examRegistry';
import { subjectRegistry } from '../data/registry/subjectRegistry';

export interface NormalizeContext {
  /** examId as derived from the file's own path (the segment right before /mocks/) — authoritative when the file's internal examId disagrees. */
  examIdFromPath: string;
  /** File name without extension — used to synthesize an id/title for content that doesn't carry its own (Format B). */
  fileName: string;
  filePath: string;
}

export interface NormalizeResult {
  file: MockSourceFile | null;
  warnings: string[];
  errors: MockSourceValidationError[];
}

function fail(ctx: NormalizeContext, mockSourceId: string, reason: string): MockSourceValidationError {
  return { mockSourceId, filePath: ctx.filePath, reason };
}

// ─── Format detection ───────────────────────────────────────────────────────

function looksCanonical(raw: unknown): raw is Record<string, unknown> & { sections: unknown[]; questions: unknown[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  // Strictly require a real `settings` object — a legacy file also has
  // top-level `sections`/`questions` arrays plus a bare `durationMinutes`,
  // and must NOT be misdetected as canonical on that basis alone (it would
  // then skip legacy field mapping entirely and fail validation with
  // confusing "missing settings" errors instead of being normalized).
  return Array.isArray(r.sections) && Array.isArray(r.questions) && typeof r.settings === 'object' && r.settings !== null;
}

// ─── Format C: legacy-ish object (different field names) ──────────────────

function resolveQuestionRange(range: unknown, allQuestions: MockSourceQuestion[]): string[] | null {
  // Supports {start,end} (1-indexed, inclusive) or [start,end] or "12-36" — all referring to POSITION within the file's overall `questions` array, the only interpretation that doesn't depend on guessing an id scheme.
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

function normalizeLegacyObject(raw: Record<string, unknown>, ctx: NormalizeContext): NormalizeResult {
  const warnings: string[] = [];
  const rawId = (raw.id ?? raw.mockId) as string | undefined;
  const mockSourceId = rawId ?? `${ctx.examIdFromPath}-${ctx.fileName}`;
  if (!rawId) warnings.push(`no "id"/"mockId" field — synthesized "${mockSourceId}" from the file path`);

  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw)) {
    return { file: null, warnings, errors: [fail(ctx, mockSourceId, 'no "questions" array found (checked canonical and legacy shapes)')] };
  }
  const questions = questionsRaw as MockSourceQuestion[];

  const sectionsRaw = raw.sections;
  if (!Array.isArray(sectionsRaw)) {
    return { file: null, warnings, errors: [fail(ctx, mockSourceId, 'no "sections" array found')] };
  }

  const durationSecondsFallback = typeof raw.durationMinutes === 'number' ? raw.durationMinutes * 60 : undefined;
  const errors: MockSourceValidationError[] = [];

  const sections: MockSourceSection[] = (sectionsRaw as Record<string, unknown>[]).map((s, i) => {
    let questionIds = Array.isArray(s.questionIds) ? (s.questionIds as string[]) : undefined;
    if (!questionIds && s.questionRange !== undefined) {
      const resolved = resolveQuestionRange(s.questionRange, questions);
      if (!resolved) errors.push(fail(ctx, mockSourceId, `section "${s.id ?? i}" has a questionRange that could not be resolved against the question list`));
      questionIds = resolved ?? [];
    }
    questionIds ??= [];
    const durationSeconds = typeof s.durationSeconds === 'number' ? s.durationSeconds
      : typeof s.durationMinutes === 'number' ? (s.durationMinutes as number) * 60
      : durationSecondsFallback ?? 0;
    return {
      id: (s.id as string) ?? `section-${i}`,
      title: (s.title as string) ?? (s.id as string) ?? `Section ${i + 1}`,
      subjectId: (s.subjectId as string) ?? (s.id as string) ?? 'unknown',
      questionCount: typeof s.questionCount === 'number' ? s.questionCount : questionIds.length,
      marksPerQuestion: (s.marksPerQuestion as number) ?? (raw.marksPerQuestion as number) ?? 1,
      negativeMarks: (s.negativeMarks as number) ?? (raw.negativeMarks as number) ?? 0,
      durationSeconds,
      questionIds,
    };
  });

  const totalQuestions = typeof raw.totalQuestions === 'number' ? raw.totalQuestions : sections.reduce((s, sec) => s + sec.questionCount, 0);
  const totalMarks = typeof raw.totalMarks === 'number' ? raw.totalMarks : sections.reduce((s, sec) => s + sec.questionCount * sec.marksPerQuestion, 0);
  const totalDuration = durationSecondsFallback ?? sections.reduce((s, sec) => s + sec.durationSeconds, 0);

  const file: MockSourceFile = {
    id: mockSourceId,
    examId: (raw.examId as string) ?? ctx.examIdFromPath,
    tierId: raw.tierId as string | undefined,
    title: (raw.title as string) ?? mockSourceId,
    type: 'full-mock',
    source: raw.source as MockSourceFile['source'],
    settings: {
      totalQuestions,
      totalMarks,
      durationSeconds: totalDuration,
      negativeMarks: (raw.negativeMarks as number) ?? 0,
      timingMode: 'sectional',
      canTransferTime: false,
      sectionNavigation: 'sequential-locked',
      questionNavigation: 'within-section',
      randomizeQuestions: false,
    },
    sections,
    questions,
  };

  return { file, warnings, errors };
}

// ─── Format B: plain question array ────────────────────────────────────────

function humanizeSubject(subjectId: string): string {
  return subjectRegistry.getSubject(subjectId)?.name ?? subjectId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeQuestionArray(questions: MockSourceQuestion[], ctx: NormalizeContext): NormalizeResult {
  const warnings: string[] = [];
  const mockSourceId = `${ctx.examIdFromPath}-${ctx.fileName}`;

  const exam = examRegistry.getExam(ctx.examIdFromPath);
  if (!exam) {
    return { file: null, warnings, errors: [fail(ctx, mockSourceId, `examId "${ctx.examIdFromPath}" (derived from the file's path) is not registered in examRegistry`)] };
  }

  // Group by subjectId, preserving each subject's original question order.
  const bySubject = new Map<string, MockSourceQuestion[]>();
  for (const q of questions) {
    if (!q.subjectId) { warnings.push(`question "${q.id}" has no subjectId — excluded from every section`); continue; }
    (bySubject.get(q.subjectId) ?? bySubject.set(q.subjectId, []).get(q.subjectId)!).push(q);
  }

  // Order sections by the exam's registered subject order; any subject present
  // in the content but NOT in the exam's registry still gets a section
  // (real content should never silently disappear), just appended after the
  // registered ones.
  const registeredOrder = exam.subjects.map((s) => s.subjectId);
  const presentSubjects = Array.from(bySubject.keys());
  const orderedSubjectIds = [
    ...registeredOrder.filter((id) => bySubject.has(id)),
    ...presentSubjects.filter((id) => !registeredOrder.includes(id)),
  ];

  const totalQuestions = questions.length;
  const totalDurationSeconds = exam.mockConfig.durationMinutes * 60;
  const marksPerQuestion = exam.mockConfig.marking.marksPerCorrect;
  const negativeMarks = exam.mockConfig.marking.negativeMarks;

  const sections: MockSourceSection[] = orderedSubjectIds.map((subjectId) => {
    const qs = bySubject.get(subjectId)!;
    // Proportional split of the exam's total configured duration — never a
    // fabricated per-section number, just the whole divided by each
    // section's real share of the questions.
    const durationSeconds = totalQuestions > 0 ? Math.round((qs.length / totalQuestions) * totalDurationSeconds / 60) * 60 : 0;
    return {
      id: subjectId,
      title: humanizeSubject(subjectId),
      subjectId,
      questionCount: qs.length,
      marksPerQuestion,
      negativeMarks,
      durationSeconds,
      questionIds: qs.map((q) => q.id),
    };
  });

  if (totalQuestions !== exam.mockConfig.questions) {
    warnings.push(`this mock has ${totalQuestions} questions, but ${exam.name}'s configured full-mock pattern is ${exam.mockConfig.questions} — using the actual ${totalQuestions} rather than fabricating the difference`);
  }

  // Title: prefer real PYQ metadata carried on the questions themselves (Format B's own convention) over a bare filename.
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
      totalMarks: totalQuestions * marksPerQuestion,
      durationSeconds: sections.reduce((s, sec) => s + sec.durationSeconds, 0),
      negativeMarks,
      timingMode: 'sectional',
      canTransferTime: false,
      sectionNavigation: 'sequential-locked',
      questionNavigation: 'within-section',
      randomizeQuestions: false,
    },
    sections,
    questions,
  };

  return { file, warnings, errors: [] };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function normalizeMockSource(raw: unknown, ctx: NormalizeContext): NormalizeResult {
  if (Array.isArray(raw)) {
    return normalizeQuestionArray(raw as MockSourceQuestion[], ctx);
  }
  if (looksCanonical(raw)) {
    const r = raw as unknown as MockSourceFile;
    const warnings: string[] = [];
    // examId mismatch between the file's own field and its path: the path is
    // authoritative (it's where the loader will look it up from), but this
    // is a warning, not a silent rewrite the author never finds out about.
    let examId = r.examId;
    if (examId && examId !== ctx.examIdFromPath) {
      warnings.push(`file declares examId "${examId}" but lives under "${ctx.examIdFromPath}/mocks/" — using "${ctx.examIdFromPath}" (the path) as authoritative`);
      examId = ctx.examIdFromPath;
    }
    return { file: { ...r, examId: examId || ctx.examIdFromPath }, warnings, errors: [] };
  }
  if (raw && typeof raw === 'object') {
    return normalizeLegacyObject(raw as Record<string, unknown>, ctx);
  }
  return { file: null, warnings: [], errors: [fail(ctx, ctx.fileName, 'file is neither a question array nor a recognizable mock object')] };
}

/** Runs the shared structural validation (option counts, id resolution, count reconciliation) after normalization, regardless of which input format produced the MockSourceFile. */
export function validateNormalized(file: MockSourceFile, filePath: string): MockSourceValidationError[] {
  return validateMockSourceFile(file, filePath);
}
