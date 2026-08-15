// ─── ExamVerse: Universal Exam / Subject / Topic Domain Model ─────────────────
// This file is additive — it does not touch or replace anything in `types/index.ts`.
// Existing Question / DailyQuiz / stores keep working untouched. This is the
// vocabulary the new universal layer (registry + repository + service) speaks.

export type ExamCategory = 'ssc' | 'railway' | 'banking' | 'defence' | 'teaching' | 'upsc' | 'state' | 'other';

export interface NegativeMarkingRule {
  marksPerCorrect: number;
  negativeMarks: number; // 0 = no negative marking
}

export interface MockConfig {
  questions: number;
  durationMinutes: number;
  marking: NegativeMarkingRule;
}

export interface SectionalTestConfig {
  /** Default question count offered for a sectional test in this subject, e.g. [10, 20, 25, 50] */
  questionCounts: number[];
  /** Default duration options in minutes, e.g. [5, 10, 15, 20, 30] */
  durationsMinutes: number[];
}

/** A subject as it applies to ONE exam (a subject may appear in many exams with different weight/config). */
export interface ExamSubjectRef {
  subjectId: string;
  /** Optional override of the subject's display name for this exam (rare). */
  displayName?: string;
  sectionalTest?: SectionalTestConfig;
}

export interface Exam {
  id: string; // e.g. "ssc-chsl"
  name: string; // e.g. "SSC CHSL"
  fullName?: string; // e.g. "Staff Selection Commission — Combined Higher Secondary Level"
  category: ExamCategory;
  subjects: ExamSubjectRef[];
  mockConfig: MockConfig;
  /** Years for which question data may exist. Actual availability is still verified against real data. */
  years?: number[];
  active: boolean; // whether to surface this exam in the exam selector yet
}

/** A subject is reusable across many exams (Reasoning appears in SSC, Railway, Banking...). */
export interface Subject {
  id: string; // e.g. "reasoning"
  name: string; // e.g. "Reasoning"
  nameHi?: string; // e.g. "तर्कशक्ति"
  /** Special-cased subjects like current-affairs plug into the universal engine too — no separate engine. */
  isCurrentAffairs?: boolean;
}

export interface Topic {
  id: string; // e.g. "coding-decoding"
  subjectId: string;
  name: string;
  nameHi?: string;
}

// ─── Registry contracts ────────────────────────────────────────────────────────
// The UI must discover exams/subjects/topics from these, never hard-code
// `if (examId === 'ssc-chsl')` style branches anywhere outside the registry.

export interface ExamRegistry {
  getAllExams(): Exam[];
  getActiveExams(): Exam[];
  getExam(examId: string): Exam | undefined;
  getExamsByCategory(category: ExamCategory): Exam[];
}

export interface SubjectRegistry {
  getAllSubjects(): Subject[];
  getSubject(subjectId: string): Subject | undefined;
  getSubjectsForExam(examId: string): Subject[];
  getTopicsForSubject(subjectId: string): Topic[];
}
