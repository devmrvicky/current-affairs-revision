// ─── Quiz / Question Types ────────────────────────────────────────────────────

export interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  bookmarked?: boolean;
}

export interface DailyQuiz {
  date: string;
  questions: Question[];
}

// ─── Attempt / Session Types ──────────────────────────────────────────────────

export type AnswerStatus = 'unanswered' | 'correct' | 'wrong';

export interface QuestionAttempt {
  questionId: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  selectedAnswer: string | null;
  status: AnswerStatus;
  timeTaken: number; // seconds
  bookmarked?: boolean;
}

export interface QuizSession {
  id: string;
  date: string;
  fileName: string;
  totalQuestions: number;
  attempts: QuestionAttempt[];
  currentIndex: number;
  startTime: number;
  pausedAt?: number;
  totalPausedTime: number;
  isCompleted: boolean;
  isPaused: boolean;
}

// ─── Saved Test Types ─────────────────────────────────────────────────────────

export interface SavedTest {
  id: string;
  date: string;
  displayDate: string;
  fileName: string;
  score: number;
  accuracy: number;
  correct: number;
  wrong: number;
  unanswered: number;
  totalQuestions: number;
  timeTaken: number; // seconds
  questions: QuestionAttempt[];
  savedAt: number;
  isRevision: boolean;
  originalTestId?: string;
}

// ─── Statistics Types ─────────────────────────────────────────────────────────

export interface DailyStats {
  date: string;
  testsAttempted: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  accuracy: number;
  avgScore: number;
}

export interface Statistics {
  totalTests: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  averageAccuracy: number;
  bestScore: number;
  worstScore: number;
  currentStreak: number;
  longestStreak: number;
  totalRevisions: number;
  dailyStats: DailyStats[];
  lastUpdated: number;
}

// ─── Settings Types ───────────────────────────────────────────────────────────

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  soundEnabled: boolean;
  autoSave: boolean;
  showExplanation: boolean;
  keyboardNavigation: boolean;
  fontSize: 'sm' | 'md' | 'lg';
}

// ─── UI / Utility Types ───────────────────────────────────────────────────────

export type PerformanceBadge = 'Excellent' | 'Good' | 'Average' | 'Needs Revision';

export interface AnalysisResult {
  totalQuestions: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number;
  score: number;
  timeTaken: number;
  badge: PerformanceBadge;
  badgeColor: string;
}

export type SortOrder = 'newest' | 'oldest' | 'highest' | 'lowest';

export interface FilterOptions {
  search: string;
  sortBy: SortOrder;
}
