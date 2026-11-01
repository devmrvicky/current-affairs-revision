// ─── Mock Analysis — normalized result/attempt analysis model ─────────────
// One shape, produced by one service (mockAnalysisService.ts), for the
// result page of a Full Mock, a Sectional Mock, or any future exam-mode
// test — there is deliberately no separate analysis engine per test type.
// Every field that depends on data this app cannot honestly provide
// (rank, percentile, cutoff, topper/past-test benchmarks) is optional and
// is only ever populated from real stored data — never fabricated.

import type { MarkPurpose } from './questionMark';

export interface SummaryStats {
  score: number;
  maxScore: number;
  percentage: number; // score / maxScore * 100
  accuracy: number | null; // correct / attempted * 100 — null when attempted === 0 (not 0%)
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  /** False for tests with no marking scheme (plain Practice): score then just equals correct answers and the UI says "Correct" rather than "Marks". Absent means true. */
  scoringApplicable?: boolean;
}

export interface RankingInfo {
  rank: number;
  totalParticipants: number;
}

export interface CutoffInfo {
  min?: number;
  max?: number;
}

export interface TestOverview {
  rating: 'Excellent' | 'Very Good' | 'Good' | 'Needs Improvement';
  message: string;
}

export interface SpeedBySubject {
  subjectId: string;
  subjectName: string;
  avgTimePerQuestionSeconds: number;
}

export interface SpeedByDifficulty {
  difficulty: 'easy' | 'medium' | 'hard';
  avgTimeSeconds: number;
  questionCount: number;
}

export interface SpeedAnalysis {
  questionsPerMinute: number | null;
  averageTimePerQuestionSeconds: number | null;
  bySubject: SpeedBySubject[];
  byDifficulty: SpeedByDifficulty[];
}

export interface SubjectPerformance {
  subjectId: string;
  subjectName: string;
  questionCount: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  marks: number;
  maxMarks: number;
  accuracy: number | null;
  timeSpentSeconds: number;
  avgTimePerQuestionSeconds: number;
}

export interface TopicPerformance {
  subjectId: string;
  topicId: string;
  topicName: string;
  questionCount: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  marks: number;
  accuracy: number | null;
  avgTimePerQuestionSeconds: number;
}

export interface QuestionPreference {
  answered: number;
  answeredAndMarked: number;
  markedOnly: number;
  visitedNotAnswered: number; // "skipped" after opening
  notVisited: number;
}

export interface TimeDistributionSlice {
  subjectId: string;
  subjectName: string;
  timeSpentSeconds: number;
  percentage: number;
}

/** Minimum sample size before a subject/topic is confidently labelled strong or weak, rather than "Insufficient data" (product spec's own guard). */
export const MIN_SAMPLE_SIZE_FOR_STRENGTH = 3;

export interface AreaPerformance {
  id: string; // subjectId, or `${subjectId}::${topicId}` for topic-level
  name: string;
  accuracy: number;
  attemptRate: number;
  questionCount: number;
}

export interface SubjectPreference {
  subjectId: string;
  subjectName: string;
  attemptRate: number; // attempted / total for that subject, this attempt
  timeSharePercentage: number; // this subject's share of total time spent
  label: 'High' | 'Medium' | 'Low';
}

export interface HistoricalComparison {
  previousAttemptCount: number;
  accuracy: { current: number | null; previousAverage: number | null; changePoints: number | null };
  timeTakenSeconds: { current: number; previousAverage: number; changeSeconds: number };
  score: { current: number; previousAverage: number; changePoints: number };
}

/** A question referred to by the time insights. */
export interface TimedQuestionRef {
  questionId: string;
  /** 1-based position in the test. */
  index: number;
  topicName: string;
  seconds: number;
  status: 'correct' | 'incorrect' | 'unattempted';
}

export interface TopicTime {
  subjectId: string;
  topicId: string;
  topicName: string;
  avgSeconds: number;
  /** Questions with recorded time that this average is over. */
  sample: number;
  accuracy: number | null;
}

/** Everything here comes from per-question time the session actually recorded — `available` is false (and the rest empty) when it recorded none. */
export interface TimeInsights {
  available: boolean;
  /** Mean over questions with recorded time > 0. */
  averageSeconds: number | null;
  averageCorrectSeconds: number | null;
  averageIncorrectSeconds: number | null;
  medianSeconds: number | null;
  /** A question counts as unusually slow above this. */
  slowThresholdSeconds: number | null;
  /** Answered within this and wrong counts as fast-but-wrong. */
  fastThresholdSeconds: number | null;
  slowQuestions: TimedQuestionRef[];
  fastIncorrect: TimedQuestionRef[];
  /** Topics with at least 2 timed questions, slowest first. */
  byTopic: TopicTime[];
  /** Too few timed questions to call anything an outlier. */
  tooFewToJudge: boolean;
}

export interface Recommendations {
  /** Attempted but mostly wrong — a knowledge gap. */
  needsRevision: AreaPerformance[];
  /** Skipped a lot, or only moderate accuracy — needs more reps. */
  needsPractice: AreaPerformance[];
  /** Strong — can be revised less often. */
  reviseLess: AreaPerformance[];
  /** Too few questions to say anything (below the minimum sample). */
  insufficient: { id: string; name: string; questionCount: number }[];
}

/** What the attempt actually recorded — sections that depend on missing data say so instead of inventing it. */
export interface DataAvailability {
  perQuestionTime: boolean;
  /** Whether "skipped after opening" vs "never opened" is known. */
  visitedState: boolean;
}

export interface QuestionAnalysis {
  questionId: string;
  /** 1-based position in the test. */
  index?: number;
  topicName?: string;
  /** Why it was marked (Doubtful / Further Practice / Revision / Mark for Review). */
  markPurpose?: MarkPurpose;
  sectionId: string;
  subjectId: string;
  topicId: string;
  question: string;
  options: { id: string; text: string; image?: string }[];
  selectedAnswer: string | null;
  correctAnswer: string;
  explanation?: string;
  status: 'correct' | 'incorrect' | 'unattempted';
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Needed to resolve `asset:filename` image references within this question's Markdown. */
  baseDir?: string;
}

export interface MockAnalysis {
  attemptId: string;
  mockId: string;
  title: string;
  completedAt: number;

  summary: SummaryStats;
  ranking?: RankingInfo;
  percentile?: number;
  cutoff?: CutoffInfo;
  overview: TestOverview;
  speed: SpeedAnalysis;
  subjectPerformance: SubjectPerformance[];
  topicPerformance: TopicPerformance[];
  questionPreference: QuestionPreference;
  timeDistribution: TimeDistributionSlice[];
  strongAreas: { subjects: AreaPerformance[]; topics: AreaPerformance[] };
  weakAreas: { subjects: AreaPerformance[]; topics: AreaPerformance[] };
  subjectPreference: SubjectPreference[];
  historicalComparison?: HistoricalComparison;
  solutions: QuestionAnalysis[];
  /** Time-per-question insights (slow / fast-but-wrong / correct-vs-incorrect timing). */
  timeInsights?: TimeInsights;
  recommendations?: Recommendations;
  dataAvailability?: DataAvailability;
}
