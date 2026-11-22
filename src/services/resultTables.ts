// ─── Shared result tables (pure) ─────────────────────────────────────────────
// One set of tables for every result screen — Practice, Test, Mock and the older daily quiz. They are built from the
// normalized MockAnalysis (the one analysis engine) plus a small ResultContext for what only the screen knows
// (marking scheme, allotted time, sections, earlier attempts of the same test).
//
// Every value comes from stored attempt data. Nothing is estimated: where the attempt did not record something
// (per-question time, difficulty, earlier attempts…) the table says so (null / available:false) instead of showing a made-up number.
// There is deliberately NO rank, percentile, topper comparison or cut-off here — the app has no real data for them.

import type { MockAnalysis, QuestionAnalysis } from '../types/mockAnalysis';
import type { MarkPurpose } from '../types/questionMark';
import { WEAK_MIN_ATTEMPTS, WEAK_BELOW, STRONG_FROM } from './reviewAnalytics';
import { subjectRegistry } from '../data/registry/subjectRegistry';

export type RowStatus = 'correct' | 'wrong' | 'skipped';
export type StrengthLabel = 'Strong' | 'Average' | 'Weak' | 'Insufficient data';

export interface MarkingScheme { marksPerCorrect: number; negativeMarks: number }

export interface SectionRow {
  sectionId: string;
  title: string;
  questions: number;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  maxScore: number;
  /** null when nothing in the section was answered — never shown as 0 %. */
  accuracy: number | null;
  /** null when no time was recorded for the section. */
  timeSpentSeconds: number | null;
  allottedSeconds: number | null;
}

export interface PreviousAttempt {
  attemptId: string;
  completedAt: number;
  /** null when the earlier attempt's score cannot be re-derived honestly (its questions are no longer all available). */
  score: number | null;
  maxScore: number | null;
  accuracy: number | null;
  attempted: number | null;
  timeTakenSeconds: number | null;
}

/** What the result screen knows that the analysis itself does not. */
export interface ResultContext {
  /** null = the test has no marking scheme (plain practice): one point per correct answer, no negative marking. */
  marking: MarkingScheme | null;
  /** Mock sections can carry their own scheme; falls back to `marking`. */
  sectionMarking?: Record<string, MarkingScheme>;
  /** Time allowed for the whole test; null when untimed. */
  allottedSeconds: number | null;
  /** Empty unless the test has sections. */
  sections: SectionRow[];
  /** Earlier attempts of the SAME test, any order. */
  previousAttempts: PreviousAttempt[];
}

export const EMPTY_CONTEXT: ResultContext = { marking: null, allottedSeconds: null, sections: [], previousAttempts: [] };

/** A question taking longer than this is listed under "over the time threshold". */
export const OVER_TIME_SECONDS = 90;
export const QUESTION_PAGE_SIZE = 25;

// ─── Row models ──────────────────────────────────────────────────────────────

export interface ScorecardRow { key: string; label: string; value: string; note?: string }

export interface GroupRow {
  id: string;
  name: string;
  /** Topic rows only. */
  subjectName?: string;
  questions: number;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number | null;
  /** Total time recorded on these questions; null when none was recorded. */
  timeSeconds: number | null;
  marks: number;
  /** Subject/topic rows only (difficulty rows carry no label). Needs WEAK_MIN_ATTEMPTS answered attempts. */
  label: StrengthLabel | null;
}

export interface TimedRow { no: number; topic: string; seconds: number; status: RowStatus }

export interface TimeTable {
  /** False when the attempt recorded no per-question time at all. */
  available: boolean;
  byOutcome: { status: RowStatus; questions: number; averageSeconds: number | null; totalSeconds: number }[];
  fastest: TimedRow[];
  slowest: TimedRow[];
  thresholdSeconds: number;
  overThreshold: TimedRow[];
}

export interface QuestionRow {
  id: string;
  no: number;
  sectionTitle: string | null;
  subject: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  status: RowStatus;
  marked: boolean;
  markPurpose?: MarkPurpose | null;
  options: { id: string; text: string; image?: string }[];
  selectedOptionId: string | null;
  correctOptionId: string;
  yourAnswer: string | null;
  correctAnswer: string;
  timeSeconds: number | null;
  marks: number;
  /** For the solution that opens from the row. */
  question: string;
  explanation?: string;
  baseDir?: string;
}

export interface ComparisonRow {
  id: string;
  label: string;
  at: number;
  isCurrent: boolean;
  score: number | null;
  maxScore: number | null;
  accuracy: number | null;
  attempted: number | null;
  timeSeconds: number | null;
}

export interface ResultTables {
  scorecard: ScorecardRow[];
  sections: SectionRow[];
  subjects: GroupRow[];
  topics: GroupRow[];
  difficulty: { available: boolean; rows: GroupRow[] };
  time: TimeTable;
  questions: QuestionRow[];
  /** Empty on a first attempt. */
  comparison: ComparisonRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function statusOf(q: Pick<QuestionAnalysis, 'status'>): RowStatus {
  return q.status === 'correct' ? 'correct' : q.status === 'incorrect' ? 'wrong' : 'skipped';
}

function schemeFor(ctx: ResultContext, sectionId: string): MarkingScheme {
  return ctx.sectionMarking?.[sectionId] ?? ctx.marking ?? { marksPerCorrect: 1, negativeMarks: 0 };
}

export function marksFor(status: RowStatus, scheme: MarkingScheme): number {
  if (status === 'correct') return scheme.marksPerCorrect;
  if (status === 'wrong') return scheme.negativeMarks > 0 ? -scheme.negativeMarks : 0;
  return 0;
}

/** Strong / Average / Weak only from WEAK_MIN_ATTEMPTS answered attempts (the same rule as Review Center); below that: "Insufficient data". */
export function strengthLabel(attempted: number, accuracy: number | null): StrengthLabel {
  if (attempted < WEAK_MIN_ATTEMPTS || accuracy === null) return 'Insufficient data';
  return accuracy < WEAK_BELOW ? 'Weak' : accuracy < STRONG_FROM ? 'Average' : 'Strong';
}

function optionText(q: QuestionAnalysis, optionId: string | null): string | null {
  if (optionId === null) return null;
  return q.options.find((o) => o.id === optionId)?.text ?? optionId;
}

function subjectName(subjectId: string): string {
  return subjectRegistry.getSubject(subjectId)?.name ?? subjectId;
}

function groupRows(
  solutions: readonly QuestionAnalysis[],
  keyOf: (q: QuestionAnalysis) => { id: string; name: string; subjectName?: string } | null,
  ctx: ResultContext,
  withLabel: boolean,
): GroupRow[] {
  const groups = new Map<string, GroupRow & { _timed: boolean }>();
  for (const q of solutions) {
    const key = keyOf(q);
    if (!key) continue;
    let g = groups.get(key.id);
    if (!g) {
      g = { id: key.id, name: key.name, subjectName: key.subjectName, questions: 0, attempted: 0, correct: 0, wrong: 0, skipped: 0, accuracy: null, timeSeconds: null, marks: 0, label: null, _timed: false };
      groups.set(key.id, g);
    }
    const status = statusOf(q);
    g.questions += 1;
    if (status === 'correct') { g.attempted += 1; g.correct += 1; }
    else if (status === 'wrong') { g.attempted += 1; g.wrong += 1; }
    else g.skipped += 1;
    g.marks = round2(g.marks + marksFor(status, schemeFor(ctx, q.sectionId)));
    if (q.timeSpentSeconds > 0) { g._timed = true; g.timeSeconds = (g.timeSeconds ?? 0) + q.timeSpentSeconds; }
  }
  return Array.from(groups.values()).map(({ _timed, ...g }) => {
    void _timed;
    const accuracy = g.attempted > 0 ? round1((g.correct / g.attempted) * 100) : null;
    return { ...g, accuracy, label: withLabel ? strengthLabel(g.attempted, accuracy) : null };
  });
}

function timeTable(solutions: readonly QuestionAnalysis[]): TimeTable {
  const timed = solutions.filter((q) => q.timeSpentSeconds > 0);
  const toRow = (q: QuestionAnalysis, i: number): TimedRow => ({ no: q.index ?? i + 1, topic: q.topicName ?? q.topicId, seconds: q.timeSpentSeconds, status: statusOf(q) });
  const rowsAll = solutions.map(toRow);
  const timedRows = rowsAll.filter((r) => r.seconds > 0);
  const byOutcome = (['correct', 'wrong', 'skipped'] as const).map((status) => {
    const list = timed.filter((q) => statusOf(q) === status);
    const total = list.reduce((n, q) => n + q.timeSpentSeconds, 0);
    return { status, questions: solutions.filter((q) => statusOf(q) === status).length, averageSeconds: list.length > 0 ? Math.round(total / list.length) : null, totalSeconds: total };
  });
  return {
    available: timed.length > 0,
    byOutcome,
    fastest: [...timedRows].sort((a, b) => a.seconds - b.seconds || a.no - b.no).slice(0, 3),
    slowest: [...timedRows].sort((a, b) => b.seconds - a.seconds || a.no - b.no).slice(0, 3),
    thresholdSeconds: OVER_TIME_SECONDS,
    overThreshold: timedRows.filter((r) => r.seconds > OVER_TIME_SECONDS).sort((a, b) => a.no - b.no),
  };
}

export function formatClockSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── The builder ─────────────────────────────────────────────────────────────

export function buildResultTables(analysis: MockAnalysis, ctx: ResultContext = EMPTY_CONTEXT): ResultTables {
  const { summary, solutions } = analysis;
  const sectionTitle = new Map(ctx.sections.map((s) => [s.sectionId, s.title]));
  const marked = solutions.filter((q) => q.isMarkedForReview).length;
  const attemptRate = summary.totalQuestions > 0 ? round1((summary.attempted / summary.totalQuestions) * 100) : null;
  const avgTime = analysis.timeInsights?.averageSeconds ?? null;
  const scoring = summary.scoringApplicable !== false && (ctx.marking !== null || !!ctx.sectionMarking);

  const scorecard: ScorecardRow[] = [
    { key: 'score', label: scoring ? 'Score' : 'Score (1 per correct answer)', value: `${summary.score} / ${summary.maxScore}`, note: `${summary.percentage.toFixed(1)}%` },
    { key: 'marking', label: 'Marking scheme', value: ctx.marking ? `+${ctx.marking.marksPerCorrect} correct · −${ctx.marking.negativeMarks} incorrect` : ctx.sectionMarking ? 'Set per section' : 'No marking scheme' },
    { key: 'accuracy', label: 'Accuracy', value: summary.accuracy !== null ? `${summary.accuracy}%` : 'Not available', note: summary.accuracy !== null ? `of ${summary.attempted} attempted` : 'Nothing attempted' },
    { key: 'attemptRate', label: 'Attempt rate', value: attemptRate !== null ? `${attemptRate}%` : 'Not available' },
    { key: 'attempted', label: 'Attempted', value: `${summary.attempted} / ${summary.totalQuestions}` },
    { key: 'correct', label: 'Correct', value: String(summary.correct) },
    { key: 'incorrect', label: 'Incorrect', value: String(summary.incorrect) },
    { key: 'unattempted', label: 'Unattempted', value: String(summary.unattempted) },
    { key: 'marked', label: 'Marked for review', value: String(marked) },
    { key: 'time', label: 'Time taken', value: ctx.allottedSeconds !== null ? `${formatClockSeconds(summary.timeTakenSeconds)} of ${formatClockSeconds(ctx.allottedSeconds)}` : `${formatClockSeconds(summary.timeTakenSeconds)} (no time limit)` },
    { key: 'avgTime', label: 'Average time per question', value: avgTime !== null ? `${avgTime}s` : 'Not recorded', note: avgTime !== null ? 'over questions with recorded time' : undefined },
  ];

  const subjects = groupRows(solutions, (q) => ({ id: q.subjectId, name: subjectName(q.subjectId) }), ctx, true);
  const topics = groupRows(solutions, (q) => ({ id: `${q.subjectId}::${q.topicId}`, name: q.topicName ?? q.topicId, subjectName: subjectName(q.subjectId) }), ctx, true);
  const hasDifficulty = solutions.some((q) => q.difficulty);
  const difficultyRows = hasDifficulty
    ? (['easy', 'medium', 'hard'] as const).flatMap((d) => groupRows(solutions, (q) => (q.difficulty === d ? { id: d, name: d[0].toUpperCase() + d.slice(1) } : null), ctx, false))
    : [];

  const questions: QuestionRow[] = solutions.map((q, i) => {
    const status = statusOf(q);
    return {
      id: q.questionId,
      no: q.index ?? i + 1,
      sectionTitle: sectionTitle.get(q.sectionId) ?? null,
      subject: subjectName(q.subjectId),
      topic: q.topicName ?? q.topicId,
      difficulty: q.difficulty ?? null,
      status,
      marked: q.isMarkedForReview || !!q.markPurpose,
      markPurpose: q.markPurpose ?? null,
      options: q.options.map((option) => ({ id: option.id, text: option.text, image: option.image })),
      selectedOptionId: q.selectedAnswer,
      correctOptionId: q.correctAnswer,
      yourAnswer: optionText(q, q.selectedAnswer),
      correctAnswer: optionText(q, q.correctAnswer) ?? q.correctAnswer,
      timeSeconds: q.timeSpentSeconds > 0 ? q.timeSpentSeconds : null,
      marks: round2(marksFor(status, schemeFor(ctx, q.sectionId))),
      question: q.question,
      explanation: q.explanation,
      baseDir: q.baseDir,
    };
  });

  const comparison: ComparisonRow[] = ctx.previousAttempts.length === 0 ? [] : [
    { id: analysis.attemptId, label: 'This attempt', at: analysis.completedAt, isCurrent: true, score: summary.score, maxScore: summary.maxScore, accuracy: summary.accuracy, attempted: summary.attempted, timeSeconds: summary.timeTakenSeconds },
    ...[...ctx.previousAttempts].sort((a, b) => b.completedAt - a.completedAt).map((p, i, all) => ({
      id: p.attemptId, label: `Attempt ${all.length - i}`, at: p.completedAt, isCurrent: false, score: p.score, maxScore: p.maxScore, accuracy: p.accuracy, attempted: p.attempted, timeSeconds: p.timeTakenSeconds,
    })),
  ];

  return { scorecard, sections: ctx.sections, subjects, topics, difficulty: { available: hasDifficulty, rows: difficultyRows }, time: timeTable(solutions), questions, comparison };
}

// ─── Question-wise table: sort, filter, paginate ─────────────────────────────

export type QuestionSortKey = 'no' | 'status' | 'subject' | 'difficulty' | 'time' | 'marks';
export type SortDir = 'asc' | 'desc';
export type QuestionFilter = 'all' | RowStatus | 'marked' | 'slow';

const STATUS_ORDER: Record<RowStatus, number> = { wrong: 0, skipped: 1, correct: 2 };
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export function filterQuestionRows(rows: readonly QuestionRow[], filter: QuestionFilter, slowThresholdSeconds: number | null = null): QuestionRow[] {
  if (filter === 'all') return [...rows];
  if (filter === 'marked') return rows.filter((r) => r.marked);
  if (filter === 'slow') return slowThresholdSeconds === null ? [] : rows.filter((r) => r.timeSeconds !== null && r.timeSeconds > slowThresholdSeconds);
  return rows.filter((r) => r.status === filter);
}

/** Stable: ties keep test order. Rows with no recorded time / no difficulty sort last in either direction. */
export function sortQuestionRows(rows: readonly QuestionRow[], key: QuestionSortKey, dir: SortDir): QuestionRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (r: QuestionRow): number | string | null => {
    switch (key) {
      case 'no': return r.no;
      case 'status': return STATUS_ORDER[r.status];
      case 'subject': return `${r.subject} ${r.topic}`.toLowerCase();
      case 'difficulty': return r.difficulty === null ? null : DIFFICULTY_ORDER[r.difficulty];
      case 'time': return r.timeSeconds;
      case 'marks': return r.marks;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a), vb = value(b);
    if (va === null && vb === null) return a.no - b.no;
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return c !== 0 ? c * sign : a.no - b.no;
  });
}

export function paginate<T>(items: readonly T[], page: number, size: number = QUESTION_PAGE_SIZE): { items: T[]; page: number; pageCount: number; from: number; to: number; total: number } {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), page: p, pageCount, from: total === 0 ? 0 : start + 1, to: Math.min(total, start + size), total };
}
