import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useExamStore } from '../store/examStore';
import { getExam } from '../services/examService';
import { buildTestConfig } from '../services/practiceTestLauncher';
import type { PracticeTestDefinition } from '../services/testLibraryBuilder';
import type { SessionMode } from '../types/practiceSession';

/**
 * Starts (or restarts) a fixed test in the universal session engine. Shared by
 * the library, the chapter "T" panels and the result page so every entry point
 * launches the same definition the same way.
 */
export function useStartPracticeTest() {
  const navigate = useNavigate();
  const { session, startSession, clearSession } = usePracticeSessionStore();
  const { selectedExamId } = useExamStore();
  const [startingId, setStartingId] = useState<string | null>(null);

  const start = useCallback(
    (test: PracticeTestDefinition, mode: SessionMode): boolean => {
      if (session && !session.isCompleted) {
        if (!window.confirm('You have an in-progress session. Starting a new one will discard it. Continue?')) return false;
        clearSession();
      }
      setStartingId(test.id);
      const exam = getExam(test.examId) ?? getExam(selectedExamId);
      startSession(buildTestConfig(test, mode, exam?.mockConfig.marking), test.questionIds);
      navigate('/session');
      return true;
    },
    [session, clearSession, startSession, navigate, selectedExamId]
  );

  return { start, startingId };
}
