import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useExamStore } from '../store/examStore';
import { getExam } from '../services/examService';
import { buildTestConfig } from '../services/practiceTestLauncher';
import { captureOrigin, isSafeReturnRoute } from '../services/returnRoute';
import type { PracticeTestDefinition } from '../services/testLibraryBuilder';
import type { SessionMode } from '../types/practiceSession';

interface StartOptions {
  /** Where Close should lead back to, when that isn't simply the screen the learner is on (e.g. a retake started from a result page). */
  returnTo?: string;
  /** Replace the current history entry instead of pushing — used when retaking from a result page. */
  replace?: boolean;
}

/**
 * Starts (or restarts) a fixed test in the universal session engine. Shared by
 * the library, the chapter "T" panels and the result page so every entry point
 * launches the same definition the same way. An unfinished test that is already
 * open is parked by the session store — never discarded, never prompted about.
 */
export function useStartPracticeTest() {
  const navigate = useNavigate();
  const startSession = usePracticeSessionStore((s) => s.startSession);
  const { selectedExamId } = useExamStore();
  const [startingId, setStartingId] = useState<string | null>(null);

  const start = useCallback(
    (test: PracticeTestDefinition, mode: SessionMode, options: StartOptions = {}): boolean => {
      setStartingId(test.id);
      const exam = getExam(test.examId) ?? getExam(selectedExamId);
      const here = captureOrigin();
      // An explicit origin (a retake started from a result page) isn't the history entry behind the test —
      // that is the finished session — so it carries no history index and Close navigates to the route directly.
      const origin = options.returnTo && isSafeReturnRoute(options.returnTo) ? { route: options.returnTo, idx: -1 } : here;
      startSession(buildTestConfig(test, mode, exam?.mockConfig.marking), test.questionIds, origin);
      navigate('/session', { replace: options.replace });
      return true;
    },
    [startSession, navigate, selectedExamId]
  );

  return { start, startingId };
}
