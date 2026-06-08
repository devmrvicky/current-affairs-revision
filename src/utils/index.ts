import type { QuizSession, SavedTest, AnalysisResult, PerformanceBadge, QuestionAttempt } from '../types';
import { v4 as uuidv4 } from 'uuid';

// ─── Time Formatting ──────────────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

// ─── Score Calculations ───────────────────────────────────────────────────────

export function calcElapsed(session: QuizSession): number {
  const rawElapsed = (Date.now() - session.startTime) / 1000;
  const paused = session.totalPausedTime / 1000;
  const currentPause = session.isPaused && session.pausedAt
    ? (Date.now() - session.pausedAt) / 1000
    : 0;
  return Math.floor(rawElapsed - paused - currentPause);
}

export function buildAnalysis(session: QuizSession): AnalysisResult {
  const correct = session.attempts.filter((a) => a.status === 'correct').length;
  const wrong = session.attempts.filter((a) => a.status === 'wrong').length;
  const unanswered = session.attempts.filter((a) => a.status === 'unanswered').length;
  const total = session.totalQuestions;
  const accuracy = total > 0 ? Math.round((correct / (correct + wrong || 1)) * 100) : 0;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const timeTaken = calcElapsed(session);

  let badge: PerformanceBadge;
  let badgeColor: string;
  if (score >= 90) { badge = 'Excellent'; badgeColor = '#22c55e'; }
  else if (score >= 75) { badge = 'Good'; badgeColor = '#3b82f6'; }
  else if (score >= 50) { badge = 'Average'; badgeColor = '#f59e0b'; }
  else { badge = 'Needs Revision'; badgeColor = '#ef4444'; }

  return { totalQuestions: total, correct, wrong, unanswered, accuracy, score, timeTaken, badge, badgeColor };
}

export function sessionToSavedTest(session: QuizSession, isRevision = false, originalTestId?: string): SavedTest {
  const analysis = buildAnalysis(session);
  return {
    id: uuidv4(),
    date: formatDateKey(new Date()),
    displayDate: session.date,
    fileName: session.fileName,
    score: analysis.score,
    accuracy: analysis.accuracy,
    correct: analysis.correct,
    wrong: analysis.wrong,
    unanswered: analysis.unanswered,
    totalQuestions: session.totalQuestions,
    timeTaken: analysis.timeTaken,
    questions: session.attempts,
    savedAt: Date.now(),
    isRevision,
    originalTestId,
  };
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

export function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatRelativeDate(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (days > 1) return `${days} days ago`;
  if (days === 1) return 'Yesterday';
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────

export function getBadge(score: number): PerformanceBadge {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Average';
  return 'Needs Revision';
}

export function getBadgeColors(badge: PerformanceBadge) {
  switch (badge) {
    case 'Excellent': return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-700' };
    case 'Good': return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700' };
    case 'Average': return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700' };
    case 'Needs Revision': return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700' };
  }
}

// ─── Option Labels ────────────────────────────────────────────────────────────

export function getOptionLabel(index: number): string {
  return String.fromCharCode(65 + index); // A, B, C, D
}

export function getOptionKey(option: string, options: string[]): string {
  const idx = options.indexOf(option);
  return idx >= 0 ? getOptionLabel(idx) : option;
}

// ─── Wrong Questions ──────────────────────────────────────────────────────────

export function getWrongAttempts(attempts: QuestionAttempt[]): QuestionAttempt[] {
  return attempts.filter((a) => a.status === 'wrong' || a.status === 'unanswered');
}

export function getBookmarkedAttempts(attempts: QuestionAttempt[]): QuestionAttempt[] {
  return attempts.filter((a) => a.bookmarked);
}

// ─── Local Storage Helpers ────────────────────────────────────────────────────

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn('localStorage unavailable');
  }
}
