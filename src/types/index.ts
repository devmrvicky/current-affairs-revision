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

// ─── Wrong Questions / Mastery ────────────────────────────────────────────────

export type MasteryStatus = 'learning' | 'mastered';

export interface WrongQuestion {
  id: string;                // unique: `${dateKey}_${questionId}`
  questionId: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  dateKey: string;           // YYYY-MM-DD of original test
  displayDate: string;
  fileName: string;
  wrongCount: number;
  consecutiveCorrect: number; // mastered when this reaches 3
  status: MasteryStatus;
  lastAttemptAt: number;
  addedAt: number;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export type CalendarDateStatus = 'available' | 'unavailable' | 'completed' | 'none';

export interface CalendarDate {
  date: Date;
  dateKey: string;           // YYYY-MM-DD
  fileName: string;          // e.g. 08june2026.json
  status: CalendarDateStatus;
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export interface BookmarkedQuestion {
  id: string;                // unique: `${fileName}_${questionId}`
  questionId: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sourceFileName: string;    // e.g. "08june2026.json" or "Sports.json"
  sourceDate: string;        // display date or chapter name
  bookmarkedAt: number;
}

// ─── Chapter Types ────────────────────────────────────────────────────────────

export interface ChapterStats {
  fileName: string;          // e.g. "Sports.json"
  chapterName: string;       // display name without .json
  totalAttempts: number;
  bestScore: number;
  averageScore: number;
  totalCorrect: number;
  totalQuestions: number;
  lastAttemptAt: number;
  lastAttemptDate: string;
}

// ─── Daily Goal ───────────────────────────────────────────────────────────────

export interface DailyGoal {
  target: number;                     // questions per day target
  questionsToday: number;             // answered today
  dateKey: string;                    // YYYY-MM-DD
  streakDays: number;                 // days in a row goal was met
  bestStreakDays: number;
  lastGoalMetDate: string;
}

// ─── Notification Settings ────────────────────────────────────────────────────

export interface NotificationSettings {
  enabled: boolean;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;          // "HH:MM"
  streakReminderEnabled: boolean;
  weeklyReportEnabled: boolean;
  soundEnabled: boolean;
  fcmToken?: string;
}

// ─── Smart Revision Queue Item ────────────────────────────────────────────────

export type RevisionItemType = 'wrong' | 'bookmark' | 'old-test';

export interface SmartRevisionItem {
  id: string;
  type: RevisionItemType;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  priority: number;           // higher = more urgent
  sourceLabel: string;        // e.g. "Wrong 3×" or "Bookmarked"
  wrongCount?: number;
  bookmarkedAt?: number;
}

// ─── Weekly Report ────────────────────────────────────────────────────────────

export interface WeeklyReport {
  weekStart: string;          // YYYY-MM-DD (Monday)
  weekEnd: string;
  totalAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  daysActive: number;
  topicsStrong: string[];
  topicsWeak: string[];
  dailyBreakdown: { date: string; questions: number; accuracy: number }[];
}
