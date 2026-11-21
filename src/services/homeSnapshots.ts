// Pure builders for the Home screen. Every number comes from stored attempt data passed in — nothing is estimated,
// and where there is nothing to show the result says so (null / empty) instead of inventing a value.

import type { UniversalAttemptRecord } from './db';
import type { MockAttemptRecord } from '../types/mockSession';
import type { SavedTest } from '../types';
import { weakTopics, WEAK_MIN_ATTEMPTS, type WeakTopicRow } from './reviewAnalytics';

// ─── Subjects ────────────────────────────────────────────────────────────────

export interface SubjectCardData {
  id: string;
  name: string;
  chapters: number;
  questions: number;
  /** Answered questions recorded for this subject; null when only an overall accuracy is known (older Current Affairs history). */
  attempted: number | null;
  /** null = nothing attempted yet — never shown as 0 %. */
  accuracy: number | null;
}

export function buildSubjectCards(
  rows: readonly { subject: { id: string; name: string }; questionCount: number }[],
  performance: readonly { subjectId: string; attempted: number; correct: number }[],
  chapterCount: (subjectId: string) => number,
  /** Current Affairs' own long-standing average accuracy, used only when the attempt ledger has nothing for it. */
  currentAffairsFallbackAccuracy: number | null,
): SubjectCardData[] {
  const perf = new Map(performance.map((p) => [p.subjectId, p]));
  return rows.map(({ subject, questionCount }) => {
    const p = perf.get(subject.id);
    const base = { id: subject.id, name: subject.name, chapters: chapterCount(subject.id), questions: questionCount };
    if (p && p.attempted > 0) return { ...base, attempted: p.attempted, accuracy: Math.round((p.correct / p.attempted) * 100) };
    if (subject.id === 'current-affairs' && currentAffairsFallbackAccuracy !== null) return { ...base, attempted: null, accuracy: Math.round(currentAffairsFallbackAccuracy) };
    return { ...base, attempted: 0, accuracy: null };
  });
}

// ─── Weak topics ─────────────────────────────────────────────────────────────

export interface WeakSnapshot {
  /** Up to `limit` topics rated Weak — only topics with WEAK_MIN_ATTEMPTS answered attempts are ever rated. */
  top: WeakTopicRow[];
  /** Topics with enough data to be rated at all (Weak, Average or Strong). */
  ratedCount: number;
  /** Topics seen but below the sample size. */
  insufficientCount: number;
  totalTopics: number;
  minAttempts: number;
}

export function weakSnapshot(attempts: Parameters<typeof weakTopics>[0], limit = 3): WeakSnapshot {
  const rows = weakTopics(attempts);
  const rated = rows.filter((r) => r.status !== 'Insufficient data');
  return {
    top: rows.filter((r) => r.status === 'Weak').slice(0, limit),
    ratedCount: rated.length,
    insufficientCount: rows.length - rated.length,
    totalTopics: rows.length,
    minAttempts: WEAK_MIN_ATTEMPTS,
  };
}

// ─── Recent attempts ─────────────────────────────────────────────────────────

export type RecentKind = 'practice' | 'test' | 'mock' | 'daily';

export interface RecentAttempt {
  id: string;
  title: string;
  kind: RecentKind;
  at: number;
  answered: number;
  total: number;
  /** null when the stored record does not carry correctness (mock attempts keep it on the result page). */
  accuracy: number | null;
  route: string;
}

/** One entry per finished practice/test session, from the per-question ledger. Rows without a session label cannot be reopened, so they are not listed. */
export function recentFromUniversal(rows: readonly UniversalAttemptRecord[]): RecentAttempt[] {
  const bySession = new Map<string, UniversalAttemptRecord[]>();
  for (const r of rows) {
    if (!r.sessionLabel) continue;
    const list = bySession.get(r.sessionId);
    if (list) list.push(r); else bySession.set(r.sessionId, [r]);
  }
  return Array.from(bySession, ([sessionId, list]) => {
    const answered = list.filter((r) => r.wasAnswered);
    const correct = answered.filter((r) => r.isCorrect).length;
    return {
      id: `u:${sessionId}`,
      title: list[0].sessionLabel!,
      kind: list[0].sessionMode === 'test' ? 'test' : 'practice',
      at: list[0].sessionCompletedAt ?? Math.max(...list.map((r) => r.attemptedAt)),
      answered: answered.length,
      total: list.length,
      accuracy: answered.length === 0 ? null : Math.round((correct / answered.length) * 100),
      route: `/session/result/${sessionId}`,
    } satisfies RecentAttempt;
  });
}

export function recentFromMocks(records: readonly MockAttemptRecord[]): RecentAttempt[] {
  return records.map((m) => {
    const states = Object.values(m.states);
    return {
      id: `m:${m.id}`,
      title: m.title,
      kind: 'mock',
      at: m.completedAt,
      answered: states.filter((s) => s.selectedAnswer !== null).length,
      total: states.length,
      accuracy: null,
      route: `/mock-tests/${m.mockDefinitionId}/result/${m.id}`,
    } satisfies RecentAttempt;
  });
}

export function recentFromLegacy(tests: readonly SavedTest[]): RecentAttempt[] {
  return tests.map((t) => ({
    id: `d:${t.id}`,
    title: `${t.displayDate}${t.isRevision ? ' · Revision' : ''}`,
    kind: 'daily',
    at: t.savedAt,
    answered: t.totalQuestions - t.unanswered,
    total: t.totalQuestions,
    accuracy: t.accuracy,
    route: `/history/${t.id}`,
  } satisfies RecentAttempt));
}

/** Newest first across every engine. */
export function mergeRecent(lists: readonly (readonly RecentAttempt[])[], limit: number): RecentAttempt[] {
  return lists.flat().sort((a, b) => b.at - a.at).slice(0, limit);
}
