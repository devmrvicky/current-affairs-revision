// ─── Review Center model (pure) ──────────────────────────────────────────────
// ONE list of review items for every subject and source. An item is a question; it can sit in several categories at once
// (Wrong AND Doubtful AND Revision…) without ever being a second record:
//   • Wrong            answered wrong at least once and not yet mastered (3 correct in a row clears it)
//   • Marked for Review the in-test flag, as saved by older sessions
//   • Doubtful / Further Practice / Revision   the purposes the learner saved
// Sources are merged by identity — a universal question by its id, an older daily/monthly question by its text — so a
// question that is both saved and wrong shows up once, carrying both categories. Nothing here writes anywhere.

import type { DailyQuiz, MarkedReviewQuestion, Question, WrongQuestion } from '../types';
import { savedPurposes, type MarkPurpose } from '../types/questionMark';
import { rankRevisionPriority, buildQuestionHistories, type AttemptRow, type MarkInfo, type QuestionHistory } from './reviewAnalytics';

export type ReviewCategory = 'wrong' | 'review' | 'doubtful' | 'practice' | 'revision';

export const REVIEW_CATEGORIES: { id: ReviewCategory; label: string; description: string }[] = [
  { id: 'wrong', label: 'Wrong Questions', description: 'Answered wrong and not yet mastered' },
  { id: 'review', label: 'Marked for Review', description: 'Flagged to look at again' },
  { id: 'doubtful', label: 'Doubtful / Possibly Incorrect', description: 'You weren’t sure, or think the question may be wrong' },
  { id: 'practice', label: 'Further Practice', description: 'Needs more practice' },
  { id: 'revision', label: 'Revision', description: 'To revise before the exam' },
];

export const MASTERED_STREAK = 3;

export interface ReviewItem {
  /** Unique and stable: `u:<universalId>` for universal questions, `t:<text>` for older daily/monthly ones. */
  key: string;
  universalId?: string;
  /** The saved Review Center record behind it, when there is one (purposes can be edited through it). */
  savedId?: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  subjectId?: string;
  topicId?: string;
  subtopicId?: string;
  difficulty?: string;
  sourceLabel: string;
  /** "2025/July" when the question came from a Monthly Magazine test. */
  monthKey?: string;
  categories: ReviewCategory[];
  /** The saved purposes (Doubtful / Further Practice / Revision) — the editable part of `categories`. */
  purposes: MarkPurpose[];
  attempts: number;
  answered: number;
  wrong: number;
  lastAttemptAt?: number;
  lastWasWrong: boolean;
  trailingCorrect: number;
  savedAt?: number;
  priority?: number;
}

/** What the loader knows about a universal question (kept minimal so tests need no question bank). */
export interface QuestionInfo {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  subjectId?: string;
  topicId?: string;
  subtopicId?: string;
  difficulty?: string;
}

export interface BuildInput {
  attempts: readonly AttemptRow[];
  saved: readonly MarkedReviewQuestion[];
  legacyWrong: readonly WrongQuestion[];
  /** Details for universal questions that are wrong but were never saved (no copy of their text exists). */
  questions: ReadonlyMap<string, QuestionInfo>;
  /** relPaths of Monthly Magazine tests, e.g. "2025/July/Test 01.json". */
  monthlyPaths: ReadonlySet<string>;
  now: number;
}

const norm = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();
const CAT_ORDER: ReviewCategory[] = ['wrong', 'review', 'doubtful', 'practice', 'revision'];
const addCat = (item: ReviewItem, c: ReviewCategory) => { if (!item.categories.includes(c)) item.categories = CAT_ORDER.filter((x) => x === c || item.categories.includes(x)); };

/** "2025/July/Test 01.json" → "2025/July"; null when the file isn't a Monthly Magazine test. */
export function monthKeyOf(fileName: string | undefined, monthlyPaths: ReadonlySet<string>): string | undefined {
  if (!fileName || !monthlyPaths.has(fileName)) return undefined;
  const [year, month] = fileName.split('/');
  return year && month ? `${year}/${month}` : undefined;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthLabel(key: string): string {
  const [year, month] = key.split('/');
  return `${month} ${year}`;
}
/** Newest month first. */
export function compareMonthKeysDesc(a: string, b: string): number {
  const [ay, am] = a.split('/'), [by, bm] = b.split('/');
  return Number(by) - Number(ay) || MONTHS.indexOf(bm) - MONTHS.indexOf(am);
}

export function buildReviewItems(input: BuildInput): ReviewItem[] {
  const { saved, legacyWrong, questions, monthlyPaths, now } = input;
  const histories = buildQuestionHistories(input.attempts);
  const items = new Map<string, ReviewItem>();

  const blank = (key: string, over: Partial<ReviewItem>): ReviewItem => ({
    key, question: '', options: [], correctAnswer: '', explanation: '', sourceLabel: '', categories: [], purposes: [],
    attempts: 0, answered: 0, wrong: 0, lastWasWrong: false, trailingCorrect: 0, ...over,
  });
  const applyHistory = (item: ReviewItem, h: QuestionHistory | undefined) => {
    if (!h) return;
    Object.assign(item, { attempts: h.attempts, answered: h.answered, wrong: h.wrong, lastAttemptAt: h.lastAttemptAt, lastWasWrong: h.lastWasWrong, trailingCorrect: h.trailingCorrect });
    item.subjectId ??= h.subjectId;
    item.topicId ??= h.topicId;
  };

  // 1. Saved questions — the full text is stored, so these never depend on the question bank.
  for (const m of saved) {
    const universalId = m.universalQuestionId;
    const key = universalId ? `u:${universalId}` : `t:${norm(m.question)}`;
    const item = items.get(key) ?? blank(key, {
      universalId, savedId: m.id, question: m.question, options: m.options, correctAnswer: m.correctAnswer, explanation: m.explanation,
      sourceLabel: m.sourceFileName, monthKey: monthKeyOf(m.sourceFileName, monthlyPaths), savedAt: m.markedAt,
    });
    item.savedId = m.id;
    item.savedAt = Math.min(item.savedAt ?? m.markedAt, m.markedAt);
    item.monthKey ??= monthKeyOf(m.sourceFileName, monthlyPaths);
    const purposes = savedPurposes(m);
    item.purposes = purposes;
    for (const p of purposes) addCat(item, p);
    if (m.purpose === 'review' || (!m.purpose && !m.purposes)) addCat(item, 'review'); // older marks have no purpose at all
    if (universalId) {
      const q = questions.get(universalId);
      if (q) { item.subjectId ??= q.subjectId; item.topicId ??= q.topicId; item.subtopicId ??= q.subtopicId; item.difficulty ??= q.difficulty; }
      applyHistory(item, histories.get(universalId));
    }
    items.set(key, item);
  }

  // 2. Wrong — universal questions from the attempt ledger…
  for (const h of histories.values()) {
    if (h.wrong === 0 || h.trailingCorrect >= MASTERED_STREAK) continue;
    const key = `u:${h.questionId}`;
    let item = items.get(key);
    if (!item) {
      const q = questions.get(h.questionId);
      if (!q) continue; // wrong, but there is no copy of the question to show
      item = blank(key, { universalId: h.questionId, question: q.question, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation, subjectId: q.subjectId, topicId: q.topicId, subtopicId: q.subtopicId, difficulty: q.difficulty, sourceLabel: 'Practice & tests' });
      items.set(key, item);
    }
    applyHistory(item, h);
    addCat(item, 'wrong');
  }

  // 3. …and older daily / monthly wrong questions (matched to saved ones by text, so nothing is listed twice).
  for (const w of legacyWrong) {
    if (w.status === 'mastered') continue;
    const key = `t:${norm(w.question)}`;
    const item = items.get(key) ?? blank(key, { question: w.question, options: w.options, correctAnswer: w.correctAnswer, explanation: w.explanation, sourceLabel: w.fileName, monthKey: monthKeyOf(w.fileName, monthlyPaths) });
    item.monthKey ??= monthKeyOf(w.fileName, monthlyPaths);
    if (!item.universalId) Object.assign(item, { wrong: Math.max(item.wrong, w.wrongCount), lastWasWrong: true, trailingCorrect: w.consecutiveCorrect, lastAttemptAt: w.lastAttemptAt, attempts: Math.max(item.attempts, w.wrongCount), answered: Math.max(item.answered, w.wrongCount) });
    addCat(item, 'wrong');
    items.set(key, item);
  }

  // Priority, from the same transparent score the Insights tab shows.
  const marks = new Map<string, MarkInfo>();
  for (const it of items.values()) if (it.universalId && it.purposes[0]) marks.set(it.universalId, { purpose: it.purposes[0], markedAt: it.savedAt });
  for (const r of rankRevisionPriority(histories, marks, now)) {
    const it = items.get(`u:${r.questionId}`);
    if (it) it.priority = r.score;
  }
  return Array.from(items.values());
}

// ─── Metrics (all computed from the items above) ─────────────────────────────

export interface ReviewMetrics {
  total: number;
  byCategory: Record<ReviewCategory, number>;
  /** In some category and not mastered. */
  unresolved: number;
  repeatedMistakes: number;
  bySubject: { subjectId: string; count: number }[];
  /** Accuracy over the recorded attempts on these questions; null when none were answered. */
  accuracy: { answered: number; wrong: number; percent: number | null };
}

export function reviewMetrics(items: readonly ReviewItem[]): ReviewMetrics {
  const byCategory: Record<ReviewCategory, number> = { wrong: 0, review: 0, doubtful: 0, practice: 0, revision: 0 };
  const subjects = new Map<string, number>();
  let answered = 0, wrong = 0, unresolved = 0, repeated = 0;
  for (const it of items) {
    for (const c of it.categories) byCategory[c]++;
    if (it.trailingCorrect < MASTERED_STREAK) unresolved++;
    if (it.wrong >= 2) repeated++;
    answered += it.answered;
    wrong += it.wrong;
    const s = it.subjectId ?? 'unknown';
    subjects.set(s, (subjects.get(s) ?? 0) + 1);
  }
  return {
    total: items.length, byCategory, unresolved, repeatedMistakes: repeated,
    bySubject: Array.from(subjects, ([subjectId, count]) => ({ subjectId, count })).sort((a, b) => b.count - a.count),
    accuracy: { answered, wrong, percent: answered === 0 ? null : Math.round(((answered - wrong) / answered) * 1000) / 10 },
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface ReviewFilters {
  category: ReviewCategory | 'all';
  subjectId?: string;
  topicId?: string;
  subtopicId?: string;
  difficulty?: string;
  /** Result of the latest attempt. */
  status?: 'wrong' | 'correct' | 'unattempted';
  repeatedOnly?: boolean;
  recentlySaved?: boolean;
  dateRange?: '7d' | '30d' | '90d';
  query?: string;
  month?: string;
  /** Only questions that came from Monthly Magazine tests (any month). */
  monthlyOnly?: boolean;
}

export const EMPTY_FILTERS: ReviewFilters = { category: 'all' };
const DAY = 86_400_000;

/** Every filter narrows the same list, so they always agree with each other. */
export function filterReviewItems(items: readonly ReviewItem[], f: ReviewFilters, now: number): ReviewItem[] {
  const q = f.query?.trim().toLowerCase();
  const rangeDays = f.dateRange ? { '7d': 7, '30d': 30, '90d': 90 }[f.dateRange] : undefined;
  return items.filter((it) => {
    if (f.category !== 'all' && !it.categories.includes(f.category)) return false;
    if (f.subjectId && it.subjectId !== f.subjectId) return false;
    if (f.topicId && it.topicId !== f.topicId) return false;
    if (f.subtopicId && it.subtopicId !== f.subtopicId) return false;
    if (f.difficulty && it.difficulty !== f.difficulty) return false;
    if (f.month && it.monthKey !== f.month) return false;
    if (f.monthlyOnly && !it.monthKey) return false;
    if (f.status === 'wrong' && !it.lastWasWrong) return false;
    if (f.status === 'correct' && !(it.answered > 0 && !it.lastWasWrong)) return false;
    if (f.status === 'unattempted' && it.attempts > 0) return false;
    if (f.repeatedOnly && it.wrong < 2) return false;
    if (f.recentlySaved && !(it.savedAt && now - it.savedAt <= 7 * DAY)) return false;
    if (rangeDays !== undefined && Math.max(it.savedAt ?? 0, it.lastAttemptAt ?? 0) < now - rangeDays * DAY) return false;
    if (q && !`${it.question} ${it.options.join(' ')} ${it.explanation} ${it.sourceLabel}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ─── Monthly Current Affairs ─────────────────────────────────────────────────

export interface MonthSummary {
  monthKey: string;
  label: string;
  total: number;
  wrong: number;
  /** Saved but not attempted again since being saved. */
  notRevisited: number;
}

export function monthSummaries(items: readonly ReviewItem[]): MonthSummary[] {
  const by = new Map<string, MonthSummary>();
  for (const it of items) {
    if (!it.monthKey) continue;
    const s = by.get(it.monthKey) ?? { monthKey: it.monthKey, label: monthLabel(it.monthKey), total: 0, wrong: 0, notRevisited: 0 };
    s.total++;
    if (it.categories.includes('wrong')) s.wrong++;
    if (isSavedButNotRevisited(it)) s.notRevisited++;
    by.set(it.monthKey, s);
  }
  return Array.from(by.values()).sort((a, b) => compareMonthKeysDesc(a.monthKey, b.monthKey));
}

export function isRevisitedSinceSaved(it: ReviewItem): boolean {
  return it.lastAttemptAt !== undefined && it.lastAttemptAt > (it.savedAt ?? 0);
}

/** Saved by the learner and not attempted again since. A question that is only "wrong" was never saved, so it isn't one. */
export function isSavedButNotRevisited(it: ReviewItem): boolean {
  return it.savedAt !== undefined && !isRevisitedSinceSaved(it);
}

// ─── Revision test generation ────────────────────────────────────────────────

export interface RevisionSpec {
  count: number | 'all';
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  randomize: boolean;
}

/**
 * Chooses the questions for a revision test. Read-only: it returns items, it never edits the saved records, so generating
 * a test can't remove or alter anything in the Review Center. Not randomized → highest revision priority first.
 */
export function selectForRevision(items: readonly ReviewItem[], spec: RevisionSpec, rng: () => number = Math.random): ReviewItem[] {
  let pool = items.filter((i) => i.question && i.options.length >= 2);
  if (spec.difficulty && spec.difficulty !== 'mixed') pool = pool.filter((i) => i.difficulty === spec.difficulty);
  if (spec.randomize) {
    pool = [...pool];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  } else {
    pool = [...pool].sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }
  return spec.count === 'all' ? pool : pool.slice(0, Math.max(0, spec.count));
}

/** A quiz the existing test engine can run, with each question linked back to its universal id so attempts reach the ledger. */
export function buildRevisionQuiz(items: readonly ReviewItem[], label: string): DailyQuiz {
  const questions: Question[] = items.map((it, i) => ({
    id: i + 1, question: it.question, options: it.options, correctAnswer: it.correctAnswer, explanation: it.explanation,
    ...(it.universalId ? { universalId: it.universalId } : {}),
    ...(it.subjectId ? { subjectId: it.subjectId } : {}),
    ...(it.topicId ? { topicId: it.topicId } : {}),
  }));
  return { date: label, questions };
}
