// ─── Mock Test Session — runtime state ─────────────────────────────────────
// Layered ON TOP OF the existing Universal Session Engine rather than
// replacing it (product spec §0/§122): this is a parallel, dedicated session
// shape for exam-simulation Mock/Sectional tests, because their rules
// (independent per-section timers, sequential locked navigation, no
// mid-test correctness reveal) are fundamentally different from flexible
// Practice sessions. Both share the same QuestionRepository, AttemptLedger
// and scoring primitives underneath.

import type { MockMode } from './examMock';

export type SectionRuntimeStatus = 'not-started' | 'active' | 'completed';
export type MockSessionStatus = 'active' | 'completed' | 'abandoned';

export interface MockSectionRuntime {
  sectionId: string;
  title: string;
  subjectId: string;
  /** Fixed at session start — the only per-question ordering this session ever uses. */
  questionIds: string[];
  marksPerQuestion: number;
  negativeMarks: number;
  durationSeconds: number;
  status: SectionRuntimeStatus;
  /** Absolute timestamp (ms) — set the instant this section becomes active. Never adjusted for time saved/lost in other sections (product spec §4/§170: unused time never transfers). */
  startedAt?: number;
  /** startedAt + durationSeconds*1000 — the section's fixed deadline. */
  endAt?: number;
  completedAt?: number;
  locked: boolean;
}

export interface MockQuestionState {
  questionId: string;
  sectionId: string;
  selectedAnswer: string | null;
  isMarkedForReview: boolean;
  visited: boolean;
  answeredAt?: number;
  /** Accumulated across every visit to this question — an approximation per product spec §42, not perfectly exact wall-clock attribution. */
  timeSpentSeconds: number;
}

export interface MockSession {
  id: string;
  mockDefinitionId: string;
  examId: string;
  type: MockMode;
  title: string;
  status: MockSessionStatus;
  /** Ordered — sections[0] is always first, locked sections never move. */
  sections: MockSectionRuntime[];
  currentSectionIndex: number;
  /** Index within the CURRENT section's questionIds — never a global question index (product spec §61). */
  currentQuestionIndex: number;
  states: Record<string, MockQuestionState>;
  startedAt: number;
  completedAt?: number;
}

// ─── Result shapes ──────────────────────────────────────────────────────────

export interface MockSectionResult {
  sectionId: string;
  title: string;
  questionCount: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  markedForReview: number;
  marks: number;
  maxMarks: number;
  accuracy: number; // correct / attempted * 100
  attemptRate: number; // attempted / questionCount * 100
  timeAllottedSeconds: number;
  timeUsedSeconds: number;
  avgTimePerQuestionSeconds: number;
}

export interface MockResult {
  sessionId: string;
  mockDefinitionId: string;
  type: MockMode;
  title: string;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  markedForReview: number;
  marks: number;
  maxMarks: number;
  accuracy: number;
  percentage: number;
  timeTakenSeconds: number;
  completedAt: number;
  sections: MockSectionResult[];
}
