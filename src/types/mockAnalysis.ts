// ─── Mock Analysis — normalized result/attempt analysis model ─────────────
// One shape, produced by one service (mockAnalysisService.ts), for the
// result page of a Full Mock, a Sectional Mock, or any future exam-mode
// test — there is deliberately no separate analysis engine per test type.
// Every field that depends on data this app cannot honestly provide
// (rank, percentile, cutoff, topper/past-test benchmarks) is optional and
// is only ever populated from real stored data — never fabricated.

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

export interface QuestionAnalysis {
  questionId: string;
  sectionId: string;
  subjectId: string;
  topicId: string;
  question: string;
  options: { id: string; text: string }[];
  selectedAnswer: string | null;
  correctAnswer: string;
  explanation?: string;
  status: 'correct' | 'incorrect' | 'unattempted';
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
  difficulty?: 'easy' | 'medium' | 'hard';
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
}
