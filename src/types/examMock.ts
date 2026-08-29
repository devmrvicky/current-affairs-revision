// ─── Exam Mock Configuration (config-driven Mock/Sectional engine) ─────────────
// This is the layer the new CBT-style Mock Test / Sectional Mock system reads
// instead of hard-coding section counts, timings or marking anywhere in the
// UI. Adding a new mock, or a whole new exam's section pattern, is a JSON
// file drop under src/data/{category}/{examId}/mock-config/*.json — no
// component or engine code changes.
//
// A mock's QUESTION CONTENT still lives in the existing exam-mock JSON files
// (src/data/{category}/{examId}/mock/{file}.json, loaded by
// questionRepository's mock loader). This config layer only adds the
// exam-simulation metadata (sections, timing, marking) on top, and resolves
// each section's question order by filtering that same question pool by
// subjectId — so one authored question file can back a Full Mock AND every
// Sectional Mock for that exam without duplicating a single question
// (product spec §92/§93).

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
