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
  markedForReview?: boolean;
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
  visitedIndices: number[]; // indices the user has navigated to (for palette "visited" state)
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
  autoNextSeconds: 0 | 2 | 3 | 5; // 0 = off
  /** Deliberately local/device-only — not part of the synced settings row, so it survives sync pulls untouched. */
  hapticEnabled?: boolean;
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

// ─── Marked For Review ────────────────────────────────────────────────────────

export interface MarkedReviewQuestion {
  id: string;                // unique: `${fileName}_${questionId}`
  questionId: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sourceFileName: string;
  sourceDate: string;
  markedAt: number;
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

export interface NotificationCategorySettings {
  dailyRevisionReminder: boolean;
  dailyQuizReminder: boolean;
  studyStreak: boolean;
  weeklyProgress: boolean;
  revisionTargetCompleted: boolean;
  chapterCompleted: boolean;
  testCompleted: boolean;
  wrongQuestionReview: boolean;
  newChapterAdded: boolean;
  continueReadingReminder: boolean;
  incompleteTestReminder: boolean;
  resumePreviousTest: boolean;
  achievementUnlocked: boolean;
  monthlySummary: boolean;
  missedRevision: boolean;
  longTimeNoStudy: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  categories: NotificationCategorySettings;
  /** "HH:MM", used for the daily revision/quiz reminder categories */
  reminderTime: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:MM"
  quietHoursEnd: string;   // "HH:MM"
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /** Stable per-install id, generated once, used to target server-sent push without requiring sign-in. */
  deviceId: string;
  /** Optional FCM token, kept for backward compatibility with any existing Firebase setup. */
  fcmToken?: string;
  /** Set once the browser's standard Web Push subscription has been created. */
  pushEndpoint?: string;
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

// ─── Reading / Highlights ─────────────────────────────────────────────────────

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export interface Highlight {
  id: string;
  chapterId: string;          // e.g. "Sports"
  text: string;               // selected text content
  color: HighlightColor;
  note?: string;              // optional personal note
  startOffset: number;        // character offset in full markdown text
  endOffset: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingProgress {
  chapterId: string;
  scrollPercent: number;      // 0-100
  scrollY: number;            // px
  timeSpentSeconds: number;
  lastReadAt: number;
  completionStatus: 'not_started' | 'reading' | 'completed';
  isFavorite: boolean;
  /** User-set override, independent of the auto-calculated completionStatus/scrollPercent above. */
  manuallyCompleted?: boolean;
}

export interface ReadingPrefs {
  fontSize: number;           // px, e.g. 16
  fontFamily: 'serif' | 'sans' | 'mono';
  lineHeight: number;         // e.g. 1.8
  maxWidth: number;           // px, e.g. 720
}

export interface ReaderNote {
  id: string;
  chapterId: string;
  text: string;               // the note content
  anchorText: string;         // text the note is attached to
  createdAt: number;
}

// ─── Monthly Magazine ─────────────────────────────────────────────────────────
// A magazine "issue" is a Year/Month folder under data/monthly-magazine/, e.g.
// data/monthly-magazine/2025/July/. Same philosophy as the Chapter system
// (folder = the unit), but supports MULTIPLE markdown parts per issue instead
// of just the first one found.

export interface MonthlyMagazineTest {
  relPath: string;   // unique key, e.g. "2025/July/Test 01.json"
  label: string;      // "Test 01", "Test 02", ... assigned by stable order
}

export interface MonthlyMagazinePart {
  relPath: string;    // e.g. "2025/July/Part 1.md"
  globKey: string;    // needed to actually load it via markdownRepository
  label: string;       // "Part 1", "Part 2", ... assigned by stable order
}

export interface MonthlyMagazineIssue {
  year: number;
  month: string;          // "January".."December"
  issueKey: string;        // unique id, e.g. "2025/July" — used as the reader/progress key
  parts: MonthlyMagazinePart[];
  tests: MonthlyMagazineTest[];
}

