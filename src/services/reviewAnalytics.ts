// ─── Review analytics (pure) ─────────────────────────────────────────────────
// Everything here is computed from REAL stored attempts (the universalAttempts ledger) and the
// learner's saved marks. No I/O, no randomness, no invented numbers — and nothing is scored
// without enough data: when there isn't, the result says so instead of guessing.
//
// DEFINITIONS (used consistently everywhere below)
//   answered   an attempt where an option was chosen (skipped questions are tracked separately)
//   wrong      answered and not correct
//   accuracy   correct ÷ answered
//   duplicates the ledger id is deterministic (session + question), but rows from several sources
//              may be merged — dedupeAttempts() keeps one row per id so nothing is counted twice
//
// REVISION PRIORITY SCORE (0–100) — every point is listed in `factors`, so the number is never a black box
//   + up to 30  repeated wrong attempts       30 × min(wrong, 3) ÷ 3
//   + 20        still unresolved              the latest attempt was wrong
//   + 15        marked Doubtful
//   + 15        marked Further Practice or Revision (awaiting revision)
//   + up to 20  time since last reviewed      20 × min(days, 30) ÷ 30 — counted only when one of the signals above exists
//   × mastery   each correct answer in a row since the last mistake removes 25 % (4 in a row ⇒ 0)
//   A question with no attempts and no revision-type mark has NO score (insufficient data), and neither does one that has only ever
//   been answered correctly and isn't marked (nothing to revise) — absence of a score is never shown as a zero.
//   Confidence is "low" until there are at least 2 attempts.

import type { MarkPurpose } from '../types/questionMark';

export interface AttemptRow {
  id: string;
  universalQuestionId?: string;
  subjectId: string;
  topicId?: string;
  isCorrect: boolean;
  wasAnswered: boolean;
  timeTaken: number;
  attemptedAt: number;
  sessionId: string;
  sourceFileName: string;
}

const DAY_MS = 86_400_000;

// ─── Sources and de-duplication ──────────────────────────────────────────────

export type AttemptSource = 'practice' | 'mock' | 'chapter';

export const SOURCE_LABELS: Record<AttemptSource, string> = {
  practice: 'Practice & topic/chapter tests',
  mock: 'Mock tests',
  chapter: 'Daily & chapter files',
};

/** Where an attempt came from, read from how the ledger names its source. */
export function attemptSource(row: Pick<AttemptRow, 'sourceFileName'>): AttemptSource {
  if (row.sourceFileName.startsWith('mock-session-')) return 'mock';
  if (row.sourceFileName.startsWith('universal-session-')) return 'practice';
  return 'chapter';
}

/** One row per id (the latest wins), so merged sources can never double-count an attempt. */
export function dedupeAttempts<T extends Pick<AttemptRow, 'id' | 'attemptedAt'>>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of rows) {
    const prev = byId.get(r.id);
    if (!prev || r.attemptedAt >= prev.attemptedAt) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

// ─── Per-question history & mistake frequency ────────────────────────────────

export interface QuestionHistory {
  questionId: string;
  subjectId: string;
  topicId?: string;
  attempts: number;
  answered: number;
  wrong: number;
  skipped: number;
  lastAttemptAt: number;
  lastWasWrong: boolean;
  /** Correct answers in a row since the most recent mistake (or since the first attempt). */
  trailingCorrect: number;
}

export function buildQuestionHistories(rows: readonly AttemptRow[]): Map<string, QuestionHistory> {
  const grouped = new Map<string, AttemptRow[]>();
  for (const r of dedupeAttempts(rows)) {
    if (!r.universalQuestionId) continue;
    const list = grouped.get(r.universalQuestionId) ?? [];
    list.push(r);
    grouped.set(r.universalQuestionId, list);
  }
  const out = new Map<string, QuestionHistory>();
  for (const [questionId, list] of grouped) {
    list.sort((a, b) => a.attemptedAt - b.attemptedAt);
    const answeredRows = list.filter((r) => r.wasAnswered);
    let trailingCorrect = 0;
    for (let i = answeredRows.length - 1; i >= 0 && answeredRows[i].isCorrect; i--) trailingCorrect++;
    const last = answeredRows[answeredRows.length - 1];
    out.set(questionId, {
      questionId,
      subjectId: list[list.length - 1].subjectId,
      topicId: list[list.length - 1].topicId,
      attempts: list.length,
      answered: answeredRows.length,
      wrong: answeredRows.filter((r) => !r.isCorrect).length,
      skipped: list.length - answeredRows.length,
      lastAttemptAt: list[list.length - 1].attemptedAt,
      lastWasWrong: !!last && !last.isCorrect,
      trailingCorrect,
    });
  }
  return out;
}

export const REPEATED_MISTAKE_MIN = 2;

/** Questions the learner has got wrong at least twice, worst first. */
export function repeatedMistakes(histories: Iterable<QuestionHistory>, minWrong = REPEATED_MISTAKE_MIN): QuestionHistory[] {
  return Array.from(histories)
    .filter((h) => h.wrong >= minWrong)
    .sort((a, b) => b.wrong - a.wrong || b.lastAttemptAt - a.lastAttemptAt);
}

export interface TopicMistakeRow {
  subjectId: string;
  topicId: string;
  wrong: number;
  questionsWrongAtLeastOnce: number;
  repeatedQuestions: number;
}

export function mistakesByTopic(histories: Iterable<QuestionHistory>): TopicMistakeRow[] {
  const by = new Map<string, TopicMistakeRow>();
  for (const h of histories) {
    if (!h.topicId || h.wrong === 0) continue;
    const row = by.get(h.topicId) ?? { subjectId: h.subjectId, topicId: h.topicId, wrong: 0, questionsWrongAtLeastOnce: 0, repeatedQuestions: 0 };
    row.wrong += h.wrong;
    row.questionsWrongAtLeastOnce += 1;
    if (h.wrong >= REPEATED_MISTAKE_MIN) row.repeatedQuestions += 1;
    by.set(h.topicId, row);
  }
  return Array.from(by.values()).sort((a, b) => b.repeatedQuestions - a.repeatedQuestions || b.wrong - a.wrong);
}

// ─── Revision priority ───────────────────────────────────────────────────────

export const PRIORITY_WEIGHTS = {
  repeatedWrong: 30, repeatedWrongCap: 3,
  unresolved: 20,
  doubtful: 15,
  awaitingRevision: 15,
  staleness: 20, stalenessDays: 30,
  masteryDiscountPerCorrect: 0.25, masteryMaxCorrect: 4,
  masteredStreak: 3,
  highAt: 60, mediumAt: 30,
} as const;

export type PriorityBand = 'high' | 'medium' | 'low' | 'mastered';

export interface PriorityFactor {
  label: string;
  points: number;
}

export interface PriorityResult {
  questionId: string;
  score: number;
  band: PriorityBand;
  confidence: 'low' | 'ok';
  factors: PriorityFactor[];
  /** Multiplier applied for recent correct answers (1 = none). */
  masteryMultiplier: number;
  daysSinceReview: number | null;
}

export interface PriorityInput {
  questionId: string;
  history?: QuestionHistory;
  purpose?: MarkPurpose;
  markedAt?: number;
  now: number;
}

/** Returns null when there is not enough data to say anything (no attempts and no revision-type mark). */
export function revisionPriority({ questionId, history, purpose, markedAt, now }: PriorityInput): PriorityResult | null {
  const W = PRIORITY_WEIGHTS;
  const doubtful = purpose === 'doubtful';
  const awaiting = purpose === 'practice' || purpose === 'revision';
  if (!history && !doubtful && !awaiting) return null;

  const factors: PriorityFactor[] = [];
  const wrong = history?.wrong ?? 0;
  if (wrong > 0) factors.push({ label: `Wrong ${wrong} time${wrong === 1 ? '' : 's'}`, points: (W.repeatedWrong * Math.min(wrong, W.repeatedWrongCap)) / W.repeatedWrongCap });
  if (history?.lastWasWrong) factors.push({ label: 'Latest attempt was wrong', points: W.unresolved });
  if (doubtful) factors.push({ label: 'Marked doubtful', points: W.doubtful });
  if (awaiting) factors.push({ label: purpose === 'revision' ? 'Marked for revision' : 'Marked for further practice', points: W.awaitingRevision });

  // Never wrong and not marked: there is nothing to revise, so no priority — not a score of zero.
  if (factors.length === 0) return null;

  const anchor = history?.lastAttemptAt ?? markedAt;
  const days = anchor === undefined ? null : Math.max(0, (now - anchor) / DAY_MS);
  if (factors.length > 0 && days !== null && days > 0) {
    const pts = (W.staleness * Math.min(days, W.stalenessDays)) / W.stalenessDays;
    if (pts >= 0.5) factors.push({ label: `Not reviewed for ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`, points: pts });
  }

  const streak = history?.trailingCorrect ?? 0;
  const multiplier = Math.max(0, 1 - W.masteryDiscountPerCorrect * Math.min(streak, W.masteryMaxCorrect));
  const raw = factors.reduce((n, f) => n + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw * multiplier)));
  const mastered = streak >= W.masteredStreak;
  const band: PriorityBand = mastered ? 'mastered' : score >= W.highAt ? 'high' : score >= W.mediumAt ? 'medium' : 'low';

  return {
    questionId, score, band,
    confidence: (history?.attempts ?? 0) >= 2 ? 'ok' : 'low',
    factors: factors.map((f) => ({ ...f, points: Math.round(f.points * 10) / 10 })),
    masteryMultiplier: multiplier,
    daysSinceReview: days,
  };
}

export interface MarkInfo {
  purpose: MarkPurpose;
  markedAt?: number;
}

/** Scores every question that has something to say about it, highest priority first. */
export function rankRevisionPriority(histories: ReadonlyMap<string, QuestionHistory>, marks: ReadonlyMap<string, MarkInfo>, now: number): PriorityResult[] {
  const ids = new Set<string>([...histories.keys(), ...marks.keys()]);
  const out: PriorityResult[] = [];
  for (const id of ids) {
    const r = revisionPriority({ questionId: id, history: histories.get(id), purpose: marks.get(id)?.purpose, markedAt: marks.get(id)?.markedAt, now });
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.score - a.score || (b.daysSinceReview ?? 0) - (a.daysSinceReview ?? 0));
}

// ─── Improvement over time ───────────────────────────────────────────────────

/** Each period needs at least this many answered attempts before the comparison is called reliable. */
export const MIN_ATTEMPTS_PER_PERIOD = 5;
const STEADY_BAND_PP = 5;

export type Trend = 'improving' | 'declining' | 'steady' | 'insufficient-data';

export interface ImprovementResult {
  previousAccuracy: number | null;
  latestAccuracy: number | null;
  /** Percentage points, latest − previous. */
  delta: number | null;
  previousAttempts: number;
  latestAttempts: number;
  trend: Trend;
  reliable: boolean;
  note?: string;
}

const pct = (correct: number, total: number) => (total === 0 ? null : Math.round((correct / total) * 1000) / 10);

/** Older half vs newer half of the answered attempts, by time. Refuses to call a trend on tiny samples. */
export function compareImprovement(rows: readonly AttemptRow[]): ImprovementResult {
  const answered = dedupeAttempts(rows).filter((r) => r.wasAnswered).sort((a, b) => a.attemptedAt - b.attemptedAt);
  const split = Math.floor(answered.length / 2);
  const previous = answered.slice(0, answered.length - split);
  const latest = answered.slice(answered.length - split);
  const pAcc = pct(previous.filter((r) => r.isCorrect).length, previous.length);
  const lAcc = pct(latest.filter((r) => r.isCorrect).length, latest.length);
  const base = { previousAccuracy: pAcc, latestAccuracy: lAcc, previousAttempts: previous.length, latestAttempts: latest.length };

  if (previous.length < MIN_ATTEMPTS_PER_PERIOD || latest.length < MIN_ATTEMPTS_PER_PERIOD) {
    return { ...base, delta: pAcc !== null && lAcc !== null ? Math.round((lAcc - pAcc) * 10) / 10 : null, trend: 'insufficient-data', reliable: false,
      note: `Needs at least ${MIN_ATTEMPTS_PER_PERIOD} answered attempts in each period to compare (you have ${previous.length} earlier and ${latest.length} recent).` };
  }
  const delta = Math.round((lAcc! - pAcc!) * 10) / 10;
  return { ...base, delta, trend: delta > STEADY_BAND_PP ? 'improving' : delta < -STEADY_BAND_PP ? 'declining' : 'steady', reliable: true,
    ...(Math.min(previous.length, latest.length) < 15 ? { note: 'Based on a small number of attempts — treat as indicative.' } : {}) };
}

export interface TopicImprovementRow extends ImprovementResult {
  subjectId: string;
  topicId: string;
}

export function improvementByTopic(rows: readonly AttemptRow[]): TopicImprovementRow[] {
  const by = new Map<string, AttemptRow[]>();
  for (const r of dedupeAttempts(rows)) {
    if (!r.topicId) continue;
    by.set(r.topicId, [...(by.get(r.topicId) ?? []), r]);
  }
  const out: TopicImprovementRow[] = [];
  for (const [topicId, list] of by) out.push({ subjectId: list[0].subjectId, topicId, ...compareImprovement(list) });
  const order: Record<Trend, number> = { declining: 0, improving: 1, steady: 2, 'insufficient-data': 3 };
  return out.sort((a, b) => order[a.trend] - order[b.trend] || (a.delta ?? 0) - (b.delta ?? 0));
}

// ─── Unified weak topics ─────────────────────────────────────────────────────

/** A topic is only labelled Weak/Average/Strong once it has this many answered attempts. */
export const WEAK_MIN_ATTEMPTS = 10;
export const WEAK_BELOW = 60;
export const STRONG_FROM = 80;

export type WeakStatus = 'Weak' | 'Average' | 'Strong' | 'Insufficient data';

export interface SourceStat {
  source: AttemptSource;
  attempted: number;
  correct: number;
  accuracy: number | null;
}

export interface WeakTopicRow {
  subjectId: string;
  topicId: string;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number | null;
  avgTimeSec: number | null;
  /** Distinct sessions that contributed attempts. */
  sessions: number;
  repeatedMistakeQuestions: number;
  frequentlyWrongQuestionIds: string[];
  bySource: SourceStat[];
  status: WeakStatus;
  /** 0–100, higher = weaker: 70 % inaccuracy + 30 % share of questions repeatedly missed. Null until there is enough data. */
  weaknessIndex: number | null;
  note?: string;
}

/**
 * One row per topic, combining every source (practice, topic/chapter tests, mocks, daily files) —
 * and the same numbers split by source. Attempts are de-duplicated, and a topic is only judged
 * once it has WEAK_MIN_ATTEMPTS answered attempts.
 */
export function weakTopics(rows: readonly AttemptRow[], histories?: ReadonlyMap<string, QuestionHistory>): WeakTopicRow[] {
  const clean = dedupeAttempts(rows).filter((r) => r.topicId);
  const hist = histories ?? buildQuestionHistories(clean);
  const by = new Map<string, AttemptRow[]>();
  for (const r of clean) by.set(r.topicId!, [...(by.get(r.topicId!) ?? []), r]);

  const out: WeakTopicRow[] = [];
  for (const [topicId, list] of by) {
    const answered = list.filter((r) => r.wasAnswered);
    const correct = answered.filter((r) => r.isCorrect).length;
    const wrong = answered.length - correct;
    const accuracy = pct(correct, answered.length);

    const sourceStats: SourceStat[] = (['practice', 'mock', 'chapter'] as AttemptSource[]).flatMap((source) => {
      const a = answered.filter((r) => attemptSource(r) === source);
      return a.length === 0 ? [] : [{ source, attempted: a.length, correct: a.filter((r) => r.isCorrect).length, accuracy: pct(a.filter((r) => r.isCorrect).length, a.length) }];
    });

    const topicHistories = Array.from(hist.values()).filter((h) => h.topicId === topicId);
    const repeated = repeatedMistakes(topicHistories);
    const distinctAnswered = topicHistories.filter((h) => h.answered > 0).length;
    const enough = answered.length >= WEAK_MIN_ATTEMPTS;
    const status: WeakStatus = !enough ? 'Insufficient data' : accuracy! < WEAK_BELOW ? 'Weak' : accuracy! < STRONG_FROM ? 'Average' : 'Strong';
    const repeatedShare = distinctAnswered === 0 ? 0 : (repeated.length / distinctAnswered) * 100;
    const timed = answered.filter((r) => r.timeTaken > 0);

    out.push({
      subjectId: list[0].subjectId, topicId,
      attempted: answered.length, correct, wrong, skipped: list.length - answered.length, accuracy,
      avgTimeSec: timed.length === 0 ? null : Math.round(timed.reduce((n, r) => n + r.timeTaken, 0) / timed.length),
      sessions: new Set(list.map((r) => r.sessionId)).size,
      repeatedMistakeQuestions: repeated.length,
      frequentlyWrongQuestionIds: repeated.slice(0, 5).map((h) => h.questionId),
      bySource: sourceStats,
      status,
      weaknessIndex: enough ? Math.round(0.7 * (100 - accuracy!) + 0.3 * repeatedShare) : null,
      ...(enough ? {} : { note: `Only ${answered.length} answered attempt${answered.length === 1 ? '' : 's'} — ${WEAK_MIN_ATTEMPTS} are needed before this topic is rated.` }),
    });
  }
  const order: Record<WeakStatus, number> = { Weak: 0, Average: 1, Strong: 2, 'Insufficient data': 3 };
  return out.sort((a, b) => order[a.status] - order[b.status] || (b.weaknessIndex ?? 0) - (a.weaknessIndex ?? 0) || b.attempted - a.attempted);
}
