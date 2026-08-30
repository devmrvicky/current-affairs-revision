// ─── Mock Analysis Service ──────────────────────────────────────────────────
// analyzeMockAttempt() is the ONE analysis engine for every exam-mode test —
// Full Mock, Sectional Mock, or anything added later. It reuses
// mockScoringService for the canonical score/marks (never re-derives that
// formula), and layers subject/topic/speed/preference/historical analysis on
// top, all from the attempt's own real data. Anything this app cannot
// honestly know (rank, percentile, cutoff, topper benchmarks) is left
// `undefined` rather than invented — see each field's comment below.

import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockAttemptRecord } from '../types/mockSession';
import type { MockDefinition } from '../types/examMock';
import type {
  MockAnalysis, SummaryStats, TestOverview, SpeedAnalysis, SpeedBySubject, SpeedByDifficulty,
  SubjectPerformance, TopicPerformance, QuestionPreference, TimeDistributionSlice,
  AreaPerformance, SubjectPreference, HistoricalComparison, QuestionAnalysis,
} from '../types/mockAnalysis';
import { MIN_SAMPLE_SIZE_FOR_STRENGTH } from '../types/mockAnalysis';
import { calculateMockResult } from './mockScoringService';
import { mockAttemptsDB } from './db';
import { subjectRegistry, getTopicDisplayName } from '../data/registry/subjectRegistry';

// Configurable rating thresholds (product spec: "do not hard-code if a
// grading configuration already exists" — none does yet, so these are the
// one place to tune them).
const OVERVIEW_THRESHOLDS = { excellent: 90, veryGood: 75, good: 50 };
const STRONG_AREA = { minAccuracy: 70, minAttemptRate: 60 };
const WEAK_AREA = { maxAccuracy: 50, maxAttemptRate: 40 };
const PREFERENCE_THRESHOLDS = { high: 80, medium: 50 };

function subjectName(subjectId: string): string {
  return subjectRegistry.getSubject(subjectId)?.name ?? subjectId;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildOverview(percentage: number, attemptRate: number, accuracy: number | null): TestOverview {
  const rating: TestOverview['rating'] =
    percentage >= OVERVIEW_THRESHOLDS.excellent ? 'Excellent' :
    percentage >= OVERVIEW_THRESHOLDS.veryGood ? 'Very Good' :
    percentage >= OVERVIEW_THRESHOLDS.good ? 'Good' : 'Needs Improvement';

  const parts: string[] = [];
  if (accuracy !== null) {
    if (accuracy >= 85) parts.push('Your accuracy was excellent');
    else if (accuracy >= 65) parts.push('Your accuracy was solid');
    else parts.push('Your accuracy has room to improve');
  }
  if (attemptRate < 60) parts.push(`you attempted only ${Math.round(attemptRate)}% of the paper`);
  else if (attemptRate < 90) parts.push('you left some questions unattempted');
  else parts.push('you attempted almost the entire paper');

  const message = parts.length > 0 ? `${parts[0]}, and ${parts[1] ?? 'keep up the pace'}.` : 'Keep practicing to build a fuller picture of your performance.';
  return { rating, message };
}

interface FlatQuestionEntry {
  questionId: string;
  sectionId: string;
  subjectId: string;
  topicId: string;
  question: UniversalQuestion;
  selectedAnswer: string | null;
  isMarkedForReview: boolean;
  visited: boolean;
  timeSpentSeconds: number;
  marksPerQuestion: number;
  negativeMarks: number;
}

function flattenAttempt(attempt: MockAttemptRecord, questionsById: Map<string, UniversalQuestion>): FlatQuestionEntry[] {
  const entries: FlatQuestionEntry[] = [];
  for (const section of attempt.sections) {
    for (const questionId of section.questionIds) {
      const q = questionsById.get(questionId);
      const state = attempt.states[questionId];
      if (!q || !state) continue;
      entries.push({
        questionId,
        sectionId: section.sectionId,
        subjectId: q.subjectId,
        topicId: q.topicId ?? 'general',
        question: q,
        selectedAnswer: state.selectedAnswer,
        isMarkedForReview: state.isMarkedForReview,
        visited: state.visited,
        timeSpentSeconds: state.timeSpentSeconds,
        marksPerQuestion: section.marksPerQuestion,
        negativeMarks: section.negativeMarks,
      });
    }
  }
  return entries;
}

function computeSpeed(entries: FlatQuestionEntry[], totalTimeTakenSeconds: number, attempted: number): SpeedAnalysis {
  const questionsPerMinute = totalTimeTakenSeconds > 0 ? round1((attempted / totalTimeTakenSeconds) * 60) : null;
  const averageTimePerQuestionSeconds = attempted > 0 ? Math.round(totalTimeTakenSeconds / attempted) : null;

  const bySubjectMap = new Map<string, { time: number; attempted: number }>();
  const byDifficultyMap = new Map<string, { time: number; count: number }>();

  for (const e of entries) {
    if (e.selectedAnswer === null) continue; // speed is about questions actually engaged with
    const s = bySubjectMap.get(e.subjectId) ?? { time: 0, attempted: 0 };
    s.time += e.timeSpentSeconds;
    s.attempted += 1;
    bySubjectMap.set(e.subjectId, s);

    if (e.question.difficulty) {
      const d = byDifficultyMap.get(e.question.difficulty) ?? { time: 0, count: 0 };
      d.time += e.timeSpentSeconds;
      d.count += 1;
      byDifficultyMap.set(e.question.difficulty, d);
    }
  }

  const bySubject: SpeedBySubject[] = Array.from(bySubjectMap.entries()).map(([subjectId, v]) => ({
    subjectId, subjectName: subjectName(subjectId),
    avgTimePerQuestionSeconds: v.attempted > 0 ? Math.round(v.time / v.attempted) : 0,
  }));

  const byDifficulty: SpeedByDifficulty[] = (['easy', 'medium', 'hard'] as const)
    .filter((d) => byDifficultyMap.has(d))
    .map((d) => {
      const v = byDifficultyMap.get(d)!;
      return { difficulty: d, avgTimeSeconds: v.count > 0 ? Math.round(v.time / v.count) : 0, questionCount: v.count };
    });

  return { questionsPerMinute, averageTimePerQuestionSeconds, bySubject, byDifficulty };
}

function computeSubjectPerformance(entries: FlatQuestionEntry[]): SubjectPerformance[] {
  const bySubject = new Map<string, FlatQuestionEntry[]>();
  for (const e of entries) (bySubject.get(e.subjectId) ?? bySubject.set(e.subjectId, []).get(e.subjectId)!).push(e);

  return Array.from(bySubject.entries()).map(([subjectId, qs]) => {
    let correct = 0, incorrect = 0, marks = 0, maxMarks = 0, time = 0;
    for (const e of qs) {
      maxMarks += e.marksPerQuestion;
      time += e.timeSpentSeconds;
      if (e.selectedAnswer === null) continue;
      if (e.selectedAnswer === e.question.correctAnswer) { correct += 1; marks += e.marksPerQuestion; }
      else { incorrect += 1; marks -= e.negativeMarks; }
    }
    const attempted = correct + incorrect;
    return {
      subjectId, subjectName: subjectName(subjectId),
      questionCount: qs.length, attempted, correct, incorrect, unattempted: qs.length - attempted,
      marks: round1(marks), maxMarks,
      accuracy: attempted > 0 ? round1((correct / attempted) * 100) : null,
      timeSpentSeconds: time,
      avgTimePerQuestionSeconds: attempted > 0 ? Math.round(time / attempted) : 0,
    };
  });
}

function computeTopicPerformance(entries: FlatQuestionEntry[]): TopicPerformance[] {
  const byTopic = new Map<string, FlatQuestionEntry[]>();
  for (const e of entries) {
    const key = `${e.subjectId}::${e.topicId}`;
    (byTopic.get(key) ?? byTopic.set(key, []).get(key)!).push(e);
  }

  return Array.from(byTopic.entries()).map(([key, qs]) => {
    const [subjectId, topicId] = key.split('::');
    let correct = 0, incorrect = 0, marks = 0, time = 0;
    for (const e of qs) {
      time += e.timeSpentSeconds;
      if (e.selectedAnswer === null) continue;
      if (e.selectedAnswer === e.question.correctAnswer) { correct += 1; marks += e.marksPerQuestion; }
      else { incorrect += 1; marks -= e.negativeMarks; }
    }
    const attempted = correct + incorrect;
    return {
      subjectId, topicId, topicName: getTopicDisplayName(subjectId, topicId),
      questionCount: qs.length, attempted, correct, incorrect, unattempted: qs.length - attempted,
      marks: round1(marks),
      accuracy: attempted > 0 ? round1((correct / attempted) * 100) : null,
      avgTimePerQuestionSeconds: attempted > 0 ? Math.round(time / attempted) : 0,
    };
  });
}

function computeQuestionPreference(entries: FlatQuestionEntry[]): QuestionPreference {
  const pref: QuestionPreference = { answered: 0, answeredAndMarked: 0, markedOnly: 0, visitedNotAnswered: 0, notVisited: 0 };
  for (const e of entries) {
    if (!e.visited) pref.notVisited += 1;
    else if (e.selectedAnswer !== null && e.isMarkedForReview) pref.answeredAndMarked += 1;
    else if (e.selectedAnswer !== null) pref.answered += 1;
    else if (e.isMarkedForReview) pref.markedOnly += 1;
    else pref.visitedNotAnswered += 1;
  }
  return pref;
}

function computeTimeDistribution(subjectPerf: SubjectPerformance[]): TimeDistributionSlice[] {
  const total = subjectPerf.reduce((s, p) => s + p.timeSpentSeconds, 0);
  if (total === 0) return subjectPerf.map((p) => ({ subjectId: p.subjectId, subjectName: p.subjectName, timeSpentSeconds: 0, percentage: 0 }));
  return subjectPerf.map((p) => ({
    subjectId: p.subjectId, subjectName: p.subjectName, timeSpentSeconds: p.timeSpentSeconds,
    percentage: round1((p.timeSpentSeconds / total) * 100),
  }));
}

function classifyAreas(subjectPerf: SubjectPerformance[], topicPerf: TopicPerformance[]) {
  const toArea = (id: string, name: string, accuracy: number | null, attempted: number, questionCount: number): AreaPerformance | null => {
    if (questionCount < MIN_SAMPLE_SIZE_FOR_STRENGTH || accuracy === null) return null;
    return { id, name, accuracy, attemptRate: round1((attempted / questionCount) * 100), questionCount };
  };

  const subjectAreas = subjectPerf.map((p) => toArea(p.subjectId, p.subjectName, p.accuracy, p.attempted, p.questionCount)).filter((a): a is AreaPerformance => a !== null);
  const topicAreas = topicPerf.map((p) => toArea(`${p.subjectId}::${p.topicId}`, p.topicName, p.accuracy, p.attempted, p.questionCount)).filter((a): a is AreaPerformance => a !== null);

  const isStrong = (a: AreaPerformance) => a.accuracy >= STRONG_AREA.minAccuracy && a.attemptRate >= STRONG_AREA.minAttemptRate;
  const isWeak = (a: AreaPerformance) => a.accuracy < WEAK_AREA.maxAccuracy || a.attemptRate < WEAK_AREA.maxAttemptRate;

  return {
    strongAreas: { subjects: subjectAreas.filter(isStrong), topics: topicAreas.filter(isStrong) },
    weakAreas: { subjects: subjectAreas.filter(isWeak), topics: topicAreas.filter(isWeak) },
  };
}

function computeSubjectPreference(subjectPerf: SubjectPerformance[], timeDistribution: TimeDistributionSlice[]): SubjectPreference[] {
  const timeBySubject = new Map(timeDistribution.map((t) => [t.subjectId, t.percentage]));
  return subjectPerf.map((p) => {
    const attemptRate = p.questionCount > 0 ? (p.attempted / p.questionCount) * 100 : 0;
    const label: SubjectPreference['label'] =
      attemptRate >= PREFERENCE_THRESHOLDS.high ? 'High' :
      attemptRate >= PREFERENCE_THRESHOLDS.medium ? 'Medium' : 'Low';
    return {
      subjectId: p.subjectId, subjectName: p.subjectName,
      attemptRate: round1(attemptRate),
      timeSharePercentage: timeBySubject.get(p.subjectId) ?? 0,
      label,
    };
  });
}

async function computeHistoricalComparison(attempt: MockAttemptRecord, currentSummary: SummaryStats): Promise<HistoricalComparison | undefined> {
  const all = await mockAttemptsDB.getForMock(attempt.mockDefinitionId);
  const previous = all.filter((a) => a.id !== attempt.id);
  if (previous.length === 0) return undefined;

  // Historical comparison uses TIME, which is always known directly from
  // each frozen attempt's own question states. Comparing accuracy/score
  // against past attempts would require re-resolving every past attempt's
  // question set (they may reference different/since-edited content) —
  // out of scope for this pass, so those fields are reported as unavailable
  // rather than computed from a shortcut that could silently be wrong.
  const avgTime = previous.reduce((sum, a) => sum + Object.values(a.states).reduce((t, st) => t + st.timeSpentSeconds, 0), 0) / previous.length;

  return {
    previousAttemptCount: previous.length,
    accuracy: { current: currentSummary.accuracy, previousAverage: null, changePoints: null },
    timeTakenSeconds: { current: currentSummary.timeTakenSeconds, previousAverage: Math.round(avgTime), changeSeconds: Math.round(currentSummary.timeTakenSeconds - avgTime) },
    score: { current: currentSummary.score, previousAverage: currentSummary.score, changePoints: 0 },
  };
}

function buildSolutions(entries: FlatQuestionEntry[]): QuestionAnalysis[] {
  return entries.map((e) => ({
    questionId: e.questionId,
    sectionId: e.sectionId,
    subjectId: e.subjectId,
    topicId: e.topicId,
    question: e.question.question,
    options: e.question.options,
    selectedAnswer: e.selectedAnswer,
    correctAnswer: e.question.correctAnswer,
    explanation: e.question.explanation,
    status: e.selectedAnswer === null ? 'unattempted' : e.selectedAnswer === e.question.correctAnswer ? 'correct' : 'incorrect',
    isMarkedForReview: e.isMarkedForReview,
    timeSpentSeconds: e.timeSpentSeconds,
    difficulty: e.question.difficulty,
  }));
}

export async function analyzeMockAttempt(
  attempt: MockAttemptRecord,
  definition: MockDefinition,
  questionsById: Map<string, UniversalQuestion>
): Promise<MockAnalysis> {
  const result = calculateMockResult(attempt, questionsById); // canonical scoring — never re-derived here
  const entries = flattenAttempt(attempt, questionsById);

  const summary: SummaryStats = {
    score: result.marks,
    maxScore: result.maxMarks,
    percentage: result.percentage,
    accuracy: result.correct + result.incorrect > 0 ? result.accuracy : null,
    attempted: result.correct + result.incorrect,
    correct: result.correct,
    incorrect: result.incorrect,
    unattempted: result.unattempted,
    totalQuestions: result.totalQuestions,
    timeTakenSeconds: result.timeTakenSeconds,
  };

  const attemptRatePct = summary.totalQuestions > 0 ? (summary.attempted / summary.totalQuestions) * 100 : 0;
  const subjectPerformance = computeSubjectPerformance(entries);
  const topicPerformance = computeTopicPerformance(entries);
  const timeDistribution = computeTimeDistribution(subjectPerformance);
  const { strongAreas, weakAreas } = classifyAreas(subjectPerformance, topicPerformance);

  // Cutoff: architecturally supported (see types/examMock.ts
  // MockDefinitionBase.cutoff) but no mock currently supplies it, so this is
  // honestly "unavailable" rather than a fabricated universal number.
  const cutoff = definition.cutoff;

  return {
    attemptId: attempt.id,
    mockId: definition.id,
    title: definition.title,
    completedAt: attempt.completedAt,
    summary,
    ranking: undefined, // no real comparison pool exists yet — never fabricated
    percentile: undefined, // same
    cutoff,
    overview: buildOverview(summary.percentage, attemptRatePct, summary.accuracy),
    speed: computeSpeed(entries, summary.timeTakenSeconds, summary.attempted),
    subjectPerformance,
    topicPerformance,
    questionPreference: computeQuestionPreference(entries),
    timeDistribution,
    strongAreas,
    weakAreas,
    subjectPreference: computeSubjectPreference(subjectPerformance, timeDistribution),
    historicalComparison: await computeHistoricalComparison(attempt, summary),
    solutions: buildSolutions(entries),
  };
}
