// ─── Mock Source File — the single JSON source of truth for a mock ────────
// Product decision: ONE authored file (src/data/{examId}/mocks/{file}.json)
// must be sufficient to derive a Full Mock, every Sectional Mock for it, and
// every subject/topic/mixed Practice pool that touches its questions — with
// zero additional files and zero question duplication. This type is the
// on-disk shape a content author writes; everything downstream (sections,
// sectional mocks, practice pools) is DERIVED from it at load time, never
// hand-authored separately.
//
// Distinguish this from `types/examMock.ts`'s `FullMockDefinition` /
// `SectionalMockDefinition`: those are the resolved RUNTIME shapes the Mock
// Test UI consumes (with namespaced, ordered questionIds already computed).
// This file's types are the raw, author-facing shape those are derived from.

export interface MockSourceOption {
  id: string; // "A" | "B" | "C" | "D"
  text: string;
  /** Asset filename (resolved via mockAssetRepository, e.g. "asset:q021-option-a.png" or a bare filename) for image-based options — common in reasoning (figure/diagram choices). Text may still be present alongside (e.g. as a caption) or empty. */
  image?: string;
}

export interface MockSourceQuestion {
  /** Unique only within this file — global uniqueness comes from namespacing with the mock's own id (see mockSourceRegistry.ts). */
  id: string;
  subjectId: string;
  topicId: string;
  subTopicId?: string;
  /**
   * Exactly one of `question` / `questionFile` must be set. `question` is
   * inline Markdown text (fine for most questions). `questionFile` points to
   * a sibling Markdown file (e.g. "questions/q001.md", relative to the mock's
   * own folder) for richer content — tables, multi-line PQRS statements,
   * math, images — without bloating mock.json with long text blocks.
   */
  question?: string;
  questionFile?: string;
  options: MockSourceOption[];
  correctAnswer: string;
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: 'en' | 'hi' | 'bilingual';
  image?: string;
  passageId?: string;
  /** Free-form provenance metadata some content carries (e.g. PYQ exam/year/date/shift) — not required, used opportunistically for nicer auto-derived titles when present. */
  sourceMeta?: { pyq?: { exam?: string; year?: number; date?: string; shift?: string }; confidence?: string };
}

export interface MockSourceSection {
  id: string;
  title: string;
  subjectId: string;
  questionCount: number;
  marksPerQuestion: number;
  negativeMarks: number;
  durationSeconds: number;
  /** References `questions[].id` within this same file, in the exact intended exam order. */
  questionIds: string[];
}

export interface MockSourceMeta {
  type: 'pyq' | 'practice' | 'ai-generated' | 'curated' | 'custom';
  year?: number;
  shift?: string;
  date?: string;
}

export interface MockSourceSettings {
  totalQuestions: number;
  totalMarks: number;
  durationSeconds: number;
  /** Fallback negative marking when a section doesn't specify its own. */
  negativeMarks: number;
  timingMode: 'sectional' | 'single-timer';
  canTransferTime: boolean;
  sectionNavigation: 'sequential-locked' | 'free';
  questionNavigation: 'within-section' | 'global';
  randomizeQuestions?: boolean;
  /** Optional, real exam cutoff — only set this when you actually have it. Absent means the result page correctly shows cutoff as unavailable rather than a guessed number. */
  cutoff?: { min?: number; max?: number };
}

export interface MockSourceFile {
  /** Globally unique — this becomes the namespace for every question id and every derived sectional/practice id. */
  id: string;
  examId: string;
  tierId?: string;
  title: string;
  type: 'full-mock';
  source?: MockSourceMeta;
  settings: MockSourceSettings;
  /**
   * Normalized/derived by the time a MockSourceFile reaches this shape —
   * always present here even though authors never write it in mock.json
   * (sections are derived from question subjectId grouping; see
   * mockSourceNormalizer.ts).
   */
  sections: MockSourceSection[];
  questions: MockSourceQuestion[];
  /**
   * Folder-based mocks (mock.json + questions/*.md + assets/*) need to know
   * their own directory to resolve `questionFile` and asset references —
   * flat single-file mocks (author put everything inline) leave this unset.
   */
  baseDir?: string;
}

// ─── Validation (product spec §79-83) ──────────────────────────────────────
// A malformed mock file must be reported precisely and must never corrupt or
// silently exclude OTHER mocks (product spec §87) — so this returns errors
// rather than throwing, and the registry that calls it decides per-file
// whether to include/exclude.

export interface MockSourceValidationError {
  mockSourceId: string;
  filePath: string;
  reason: string;
}

export function validateMockSourceFile(file: MockSourceFile, filePath: string): MockSourceValidationError[] {
  const errors: MockSourceValidationError[] = [];
  const fail = (reason: string) => errors.push({ mockSourceId: file.id ?? '(missing id)', filePath, reason });

  if (!file.id) fail('missing "id"');
  if (!file.examId) fail('missing "examId"');
  if (!file.title) fail('missing "title"');
  if (!file.settings) { fail('missing "settings"'); return errors; }
  if (!file.sections || file.sections.length === 0) { fail('mock has no sections'); return errors; }
  if (!file.questions || file.questions.length === 0) { fail('mock has no questions'); return errors; }

  const questionById = new Map(file.questions.map((q) => [q.id, q]));

  // Every question: exactly 4 options (A-D), correctAnswer must match one, subjectId+topicId required (§82/§83), and exactly one of question/questionFile.
  for (const q of file.questions) {
    if (!q.subjectId) fail(`question "${q.id}" is missing subjectId`);
    if (!q.topicId) fail(`question "${q.id}" is missing topicId`);
    const hasInline = !!q.question;
    const hasFile = !!q.questionFile;
    if (hasInline === hasFile) {
      fail(`question "${q.id}" must have exactly one of "question" (inline text) or "questionFile" (path to a Markdown file), found ${hasInline && hasFile ? 'both' : 'neither'}`);
    }
    if (!q.options || q.options.length !== 4) fail(`question "${q.id}" must have exactly 4 options, found ${q.options?.length ?? 0}`);
    if (q.options && !q.options.some((o) => o.id === q.correctAnswer)) {
      fail(`question "${q.id}" correctAnswer "${q.correctAnswer}" does not match any option id`);
    }
  }

  // Every section: questionIds resolve to real questions, count matches, subjectId is consistent (§80).
  let sumQuestions = 0;
  let sumMarks = 0;
  let sumDuration = 0;
  for (const s of file.sections) {
    if (s.questionIds.length !== s.questionCount) {
      fail(`section "${s.title}" declares questionCount ${s.questionCount} but lists ${s.questionIds.length} questionIds`);
    }
    for (const qid of s.questionIds) {
      const q = questionById.get(qid);
      if (!q) fail(`section "${s.title}" references unknown question id "${qid}"`);
      else if (q.subjectId !== s.subjectId) fail(`question "${qid}" has subjectId "${q.subjectId}" but is listed under section "${s.title}" (subjectId "${s.subjectId}")`);
    }
    sumQuestions += s.questionCount;
    sumMarks += s.questionCount * s.marksPerQuestion;
    sumDuration += s.durationSeconds;
  }

  if (sumQuestions !== file.settings.totalQuestions) {
    fail(`settings.totalQuestions (${file.settings.totalQuestions}) does not match the sum of section question counts (${sumQuestions})`);
  }
  if (sumMarks !== file.settings.totalMarks) {
    fail(`settings.totalMarks (${file.settings.totalMarks}) does not match the sum of section marks (${sumMarks})`);
  }
  if (file.settings.timingMode === 'sectional' && sumDuration !== file.settings.durationSeconds) {
    fail(`settings.durationSeconds (${file.settings.durationSeconds}) does not match the sum of section durations (${sumDuration})`);
  }

  return errors;
}
