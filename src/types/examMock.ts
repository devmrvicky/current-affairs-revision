// ─── Exam Mock Configuration (runtime shapes for the Mock/Sectional engine) ────
// These are the RESOLVED, RUNTIME shapes the Mock Test UI consumes — the
// question ids on FullMockDefinition/SectionalMockDefinition are already
// namespaced and ordered by the time a page sees them. They are DERIVED
// (never hand-authored) from a single-source-of-truth Mock Source File —
// see types/mockSourceFile.ts for the on-disk schema a content author
// writes, and services/mockDefinitionRepository.ts for the derivation
// (one Full Mock + N virtual Sectional Mocks per source file, no separate
// config files, no question duplication — product spec §0-3/§10-12).

export type MockMode = 'full-mock' | 'sectional-mock';

export interface MockSectionConfig {
  /** Stable id for this section within the mock, e.g. "reasoning". */
  id: string;
  /** Display title, e.g. "General Intelligence & Reasoning". */
  title: string;
  /** Must match the subjectId used on the underlying UniversalQuestion entries. */
  subjectId: string;
  questionCount: number;
  durationSeconds: number;
  marksPerQuestion: number;
  negativeMarks: number;
}

export interface PyqMeta {
  exam: string;
  year: number;
  date?: string; // ISO date the paper was conducted
  shift?: string;
}

interface MockDefinitionBase {
  id: string;
  examId: string;
  tierId?: string;
  title: string;
  /** Which src/data/{...}/mock/{mockFile}.json this mock's questions are pulled from (source tag `mock:{mockFile}`). */
  mockFile: string;
  /** Official/PYQ mocks keep authored question order; only practice-generated mocks should randomize. */
  randomizeQuestions?: boolean;
  pyq?: PyqMeta;
  /** Only ever set when a content author explicitly supplies real cutoff data for this mock — the result page shows "Cut-off data unavailable" rather than a fabricated number when this is absent. */
  cutoff?: { min?: number; max?: number };
}

export interface FullMockDefinition extends MockDefinitionBase {
  mode: 'full-mock';
  totalQuestions: number;
  totalMarks: number;
  durationSeconds: number;
  sections: MockSectionConfig[];
}

export interface SectionalMockDefinition extends MockDefinitionBase {
  mode: 'sectional-mock';
  section: MockSectionConfig;
}

export type MockDefinition = FullMockDefinition | SectionalMockDefinition;

// ─── Validation (product spec §58/§94/§140-144) ────────────────────────────
// A mock must never start with a half-valid configuration — every section's
// declared question count must actually be satisfiable from the resolved
// question pool before a session is created.

export interface MockValidationError {
  mockId: string;
  reason: string;
}

export function validateFullMockDefinition(def: FullMockDefinition, availableCountBySection: Record<string, number>): MockValidationError[] {
  const errors: MockValidationError[] = [];
  const fail = (reason: string) => errors.push({ mockId: def.id, reason });

  if (!def.sections || def.sections.length === 0) fail('mock has no sections configured');

  const sumQuestions = def.sections?.reduce((sum, s) => sum + s.questionCount, 0) ?? 0;
  if (sumQuestions !== def.totalQuestions) {
    fail(`totalQuestions (${def.totalQuestions}) does not match the sum of section question counts (${sumQuestions})`);
  }

  const sumMarks = def.sections?.reduce((sum, s) => sum + s.questionCount * s.marksPerQuestion, 0) ?? 0;
  if (sumMarks !== def.totalMarks) {
    fail(`totalMarks (${def.totalMarks}) does not match the sum of section marks (${sumMarks})`);
  }

  const sumDuration = def.sections?.reduce((sum, s) => sum + s.durationSeconds, 0) ?? 0;
  if (sumDuration !== def.durationSeconds) {
    fail(`durationSeconds (${def.durationSeconds}) does not match the sum of section durations (${sumDuration})`);
  }

  for (const section of def.sections ?? []) {
    const available = availableCountBySection[section.id] ?? 0;
    if (available < section.questionCount) {
      fail(`section "${section.title}" expects ${section.questionCount} questions but only ${available} valid questions were found`);
    }
  }

  return errors;
}

export function validateSectionalMockDefinition(def: SectionalMockDefinition, availableCount: number): MockValidationError[] {
  const errors: MockValidationError[] = [];
  if (availableCount < def.section.questionCount) {
    errors.push({
      mockId: def.id,
      reason: `section "${def.section.title}" expects ${def.section.questionCount} questions but only ${availableCount} valid questions were found`,
    });
  }
  return errors;
}
