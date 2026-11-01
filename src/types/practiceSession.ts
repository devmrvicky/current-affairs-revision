// ─── Universal Practice/Test Session Model (Phase 8) ──────────────────────────
// This is the NEW session architecture for native ExamVerse content. It never
// touches DailyQuiz/legacy Question — sessions reference questions ONLY by
// their stable UniversalQuestion id and resolve content from the repository
// on demand (master prompt Phase 8 §3, §5, §22). The legacy quizStore/
// DailyQuiz engine still exists and still serves old Current Affairs pages —
// this is a parallel, independent path, not a replacement of it.

import type { Difficulty } from './universalQuestion';
import type { MarkPurpose } from './questionMark';

export type SessionMode = 'practice' | 'test';

export interface SessionNegativeMarking {
  marksPerCorrect: number;
  negativeMarks: number;
}

export interface PracticeConfiguration {
  examId: string;
  subjectIds: string[];
  /** Only meaningful when subjectIds.length === 1 — mixed-subject sessions don't scope to a single topic. */
  topicId?: string;
  difficulty?: Difficulty | 'mixed';
  questionCount: number;
  mode: SessionMode;
  /** Test-mode only. */
  durationSeconds?: number;
  marking?: SessionNegativeMarking;
  testType?: 'sectional' | 'full';
  /** Present when started from a specific PracticeTestDefinition card (an exam mock, chapter test, or miscellaneous set) rather than free-form Quick Practice — enables per-test attempt statistics (product-refactor §89-90). */
  testDefinitionId?: string;
  /** Human-readable label for headers/results, e.g. "SSC CHSL — Mathematics". */
  label: string;
}

export interface SessionQuestionState {
  questionId: string; // stable UniversalQuestion id
  selectedAnswer: string | null; // an options[].id, e.g. "B" — never option text
  /** True when the question carries a "review before submit" mark. Kept for compatibility with sessions written before purposes existed — see markPurpose. */
  isMarkedForReview: boolean;
  /** Why the question was marked (shared across the practice, mock and quiz engines). `isMarkedForReview` is true exactly when this is 'review'. */
  markPurpose?: MarkPurpose;
  answeredAt?: number;
  timeTaken: number; // seconds
}

export interface PracticeSession {
  id: string;
  config: PracticeConfiguration;
  /** Fixed at session start — the only randomization is question order/selection, done once by practiceService. */
  questionIds: string[];
  /** Parallel array to questionIds, same order/length. */
  states: SessionQuestionState[];
  currentIndex: number;
  startedAt: number;
  completedAt?: number;
  isCompleted: boolean;
  pausedAt?: number;
  totalPausedTime: number;
  visitedIndices: number[];

  // ── Resumability (all optional: sessions saved before multi-session resume lack them) ──
  /** Set automatically when the learner leaves the test with the clock running; folded into totalPausedTime when they come back. Distinct from pausedAt, which is the learner's own explicit Pause. */
  suspendedAt?: number;
  /** Last time the test was on screen — heartbeat while open, drives "Last active" and crash recovery. */
  lastActiveAt?: number;
  lastResumedAt?: number;
  /** Validated internal route the test was entered from; where the close button returns to. */
  returnRoute?: string;
  /** History index of the screen it was entered from — see returnRoute.ts. */
  returnHistoryIdx?: number;
}

export interface UniversalTestResult {
  sessionId: string;
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  skipped: number;
  marks: number;
  maxMarks: number;
  percentage: number;
  accuracy: number;
  timeTakenSeconds: number;
  avgTimePerQuestionSeconds: number;
}
