// quizService.ts — thin facade over QuizRepository
// All pages/stores import from here; the repository is swapped in quizRepository.ts.

import { getQuizRepository, buildFileName, buildDisplayDate, parseDateFromFileName } from './quizRepository';
import type { DailyQuiz } from '../types';

// ─── Re-export helpers so existing imports don't break ───────────────────────

export { buildFileName as getFileName, buildDisplayDate as getDisplayDate, parseDateFromFileName };

// ─── Quiz Loading ─────────────────────────────────────────────────────────────

export async function loadQuizForDate(date: Date = new Date()): Promise<DailyQuiz | null> {
  return getQuizRepository().getQuizByFileName(buildFileName(date));
}

export async function loadQuizByFileName(fileName: string): Promise<DailyQuiz | null> {
  return getQuizRepository().getQuizByFileName(fileName);
}

// ─── Available Files ──────────────────────────────────────────────────────────

/** Returns all known quiz filenames. Cached after first call. */
export async function getAvailableFileNames(): Promise<string[]> {
  return getQuizRepository().getAvailableFileNames();
}

/** @deprecated use getAvailableFileNames() — kept for backward compat */
export const AVAILABLE_QUIZ_FILES: string[] = [];
// Populated lazily — callers that need it should call getAvailableFileNames()
getAvailableFileNames().then((files) => {
  AVAILABLE_QUIZ_FILES.length = 0;
  AVAILABLE_QUIZ_FILES.push(...files);
});
