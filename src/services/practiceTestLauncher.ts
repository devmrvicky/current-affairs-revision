// ─── Practice test launcher (pure) ───────────────────────────────────────────
// The one place that turns a PracticeTestDefinition into the PracticeConfiguration
// a session starts with. Start, Retake, the chapter "T" panels and the result
// page's Retry all go through here so "the same test" always means the same
// definition, question set and rules.

import type { PracticeConfiguration, SessionMode, SessionNegativeMarking } from '../types/practiceSession';
import type { PracticeTestDefinition } from './testLibraryBuilder';

const DEFAULT_MARKING: SessionNegativeMarking = { marksPerCorrect: 1, negativeMarks: 0 };

/** The title shown in headers and results: chapter context first so "Test 01" is never ambiguous. */
export function testSessionLabel(test: PracticeTestDefinition): string {
  return test.chapterTitle ? `${test.chapterTitle} — ${test.title}` : test.title;
}

/**
 * Fixed exam mocks are always timed tests; every other test follows the chosen
 * mode. Question order is the file's own order (no reshuffle) — a fixed test is
 * the same paper every time.
 */
export function buildTestConfig(test: PracticeTestDefinition, mode: SessionMode, marking?: SessionNegativeMarking): PracticeConfiguration {
  const useTestMode = test.isFixedMock || mode === 'test';
  return {
    examId: test.examId,
    subjectIds: [test.subjectId],
    questionCount: test.questionCount,
    mode: useTestMode ? 'test' : 'practice',
    label: testSessionLabel(test),
    testDefinitionId: test.id,
    ...(useTestMode
      ? {
          marking: marking ?? DEFAULT_MARKING,
          // No per-file duration metadata for chapter tests/mocks yet — a
          // reasonable 90s/question default rather than the exam's full mock
          // duration, which would be misleadingly generous for a short set.
          durationSeconds: Math.max(300, test.questionCount * 90),
          testType: test.isFixedMock ? ('sectional' as const) : undefined,
        }
      : {}),
  };
}
