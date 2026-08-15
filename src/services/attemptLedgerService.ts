// ─── Attempt Ledger Service ─────────────────────────────────────────────────
// Bridges every place a session gets completed (daily current affairs,
// chapter-wise practice, and the universal Practice/Test Configurator) into
// one IndexedDB ledger keyed by universal question id. This is what makes
// "Unattempted Questions" and cross-content Weak Topics honest rather than
// guessed.
//
// IDEMPOTENCY (Phase 8.5 §2): every record's `id` is deterministic —
// `${sessionId}-${universalQuestionId}` — never a random uuid. The same
// question in the same session always maps to the same ledger key, so
// calling a record* function twice (timer expiry racing a manual submit,
// a retried failed write, a remount) overwrites the same rows via
// IndexedDB `put()` instead of creating duplicates. This is the ledger's
// own safety net, independent of any call-site guard.
//
// Sessions from the Practice/Test Configurator already carry `universalId`
// on every attempt (threaded through legacyQuestionAdapter → quizStore), so
// those are recorded directly. Legacy daily/chapter sessions don't carry it,
// but their ids are DETERMINISTIC — questionRepository.ts builds them from
// `fileName`/`chapterName`/`test.label` + index — so we reconstruct the exact
// same id here rather than guessing. If reconstruction can't be done
// confidently (e.g. Monthly Magazine, which isn't in the universal pool yet,
// or composite sessions like Mixed Revision), we skip recording rather than
// writing a wrong id.

import type { QuizSession } from '../types';
import type { PracticeSession } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import { universalAttemptsDB, type UniversalAttemptRecord } from './db';
import { parseDateFromFileName } from './quizRepository';
import { getChapterList } from './chapterRepository';
import { resolveTopicId } from './questionRepository';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function ledgerRecordId(sessionId: string, universalQuestionId: string): string {
  return `${sessionId}::${universalQuestionId}`;
}

function attemptToRecord(
  session: QuizSession,
  index: number,
  universalQuestionId: string,
  examId: string,
  subjectId: string,
  topicId: string | undefined
): UniversalAttemptRecord {
  const attempt = session.attempts[index];
  return {
    id: ledgerRecordId(session.id, universalQuestionId),
    universalQuestionId,
    examId,
    subjectId,
    topicId,
    isCorrect: attempt.status === 'correct',
    wasAnswered: attempt.status !== 'unanswered',
    timeTaken: attempt.timeTaken,
    attemptedAt: Date.now(),
    sessionId: session.id,
    sourceFileName: session.fileName,
  };
}

/** Sessions built by the universal Practice/Test Configurator — every attempt already carries its real universal id. */
async function recordUniversalSession(session: QuizSession): Promise<boolean> {
  const first = session.attempts[0];
  if (!first?.universalId) return false;

  const records = session.attempts
    .map((attempt, i) => (attempt.universalId ? { attempt, i } : null))
    .filter((x): x is { attempt: typeof session.attempts[number]; i: number } => x !== null)
    .map(({ attempt, i }) =>
      attemptToRecord(session, i, attempt.universalId!, attempt.examId ?? 'current-affairs', attempt.subjectId ?? 'current-affairs', attempt.topicId)
    );
  await universalAttemptsDB.recordMany(records);
  return true;
}

/** Daily Current Affairs sessions — id scheme must match questionRepository's `loadDailyCurrentAffairsQuestions` exactly. */
async function recordDailySession(session: QuizSession): Promise<boolean> {
  if (!parseDateFromFileName(session.fileName)) return false; // not a daily-quiz filename

  const idPrefix = `current-affairs-daily-${session.fileName.replace(/\.json$/i, '')}`;
  const records = session.attempts.map((_, i) =>
    attemptToRecord(session, i, `${idPrefix}-${String(i + 1).padStart(4, '0')}`, 'current-affairs', 'current-affairs', undefined)
  );
  await universalAttemptsDB.recordMany(records);
  return true;
}

/** Chapter-wise sessions — `session.fileName` is the exact chapter test relPath; id scheme must match `loadChapterWiseCurrentAffairsQuestions`. */
async function recordChapterSession(session: QuizSession, chapterName: string): Promise<boolean> {
  const chapter = getChapterList().find((c) => c.chapterName === chapterName);
  const test = chapter?.tests.find((t) => t.relPath === session.fileName);
  if (!test) return false; // fileName didn't match a known chapter test — don't guess

  const topicId = resolveTopicId(chapterName);
  const idPrefix = `current-affairs-chapter-${normalize(chapterName)}-${normalize(test.label)}`;
  const records = session.attempts.map((_, i) =>
    attemptToRecord(session, i, `${idPrefix}-${String(i + 1).padStart(4, '0')}`, 'current-affairs', 'current-affairs', topicId)
  );
  await universalAttemptsDB.recordMany(records);
  return true;
}

export interface RecordSessionOptions {
  /** Pass when the session is a known chapter-wise test — enables accurate id reconstruction + topic tagging. */
  chapterName?: string;
}

/**
 * Records a completed session into the universal attempt ledger, choosing
 * the right strategy automatically. Silently does nothing for sessions we
 * can't confidently map (e.g. Monthly Magazine, Mixed Revision, Bookmarks
 * Revision) — recording a guessed id would make Unattempted Questions wrong,
 * which is worse than not recording at all.
 */
export async function recordSessionToLedger(session: QuizSession, options: RecordSessionOptions = {}): Promise<void> {
  if (session.attempts.length === 0) return;

  if (await recordUniversalSession(session)) return;
  if (options.chapterName && (await recordChapterSession(session, options.chapterName))) return;
  await recordDailySession(session);
}

export async function getAttemptedQuestionIds(examId?: string): Promise<Set<string>> {
  return universalAttemptsDB.getAttemptedQuestionIds(examId);
}

/**
 * Records a completed universal PracticeSession (Phase 8) directly — this is
 * the canonical, simplest path in the whole ledger service: no filename
 * parsing, no ID reconstruction, because SessionQuestionState already
 * references the real universal question id. This is what
 * `recordDailySession`/`recordChapterSession` above are compatibility
 * shims FOR — native sessions never need that machinery.
 */
export async function recordPracticeSessionAttempts(
  session: PracticeSession,
  questionsById: Map<string, UniversalQuestion>
): Promise<void> {
  const records: UniversalAttemptRecord[] = session.states.map((state) => {
    const q = questionsById.get(state.questionId);
    const wasAnswered = state.selectedAnswer !== null;
    const isCorrect = wasAnswered && !!q && state.selectedAnswer === q.correctAnswer;
    return {
      id: ledgerRecordId(session.id, state.questionId),
      universalQuestionId: state.questionId,
      examId: session.config.examId,
      // The question's OWN resolved subject is authoritative — never
      // subjectIds[0] — so a mixed-subject session attributes each
      // question to its real subject, not the first one picked in the
      // configurator (Phase 8.5 §22). Falls back only if the question
      // couldn't be resolved at all.
      subjectId: q?.subjectId ?? session.config.subjectIds[0] ?? 'unknown',
      topicId: q?.topicId,
      isCorrect,
      wasAnswered,
      timeTaken: state.timeTaken,
      attemptedAt: state.answeredAt ?? session.completedAt ?? Date.now(),
      sessionId: session.id,
      sourceFileName: `universal-session-${session.id}`,
    };
  });
  await universalAttemptsDB.recordMany(records);
}

// ─── Universal analytics queries ────────────────────────────────────────────
// These read the ledger directly — no `if (subjectId === 'current-affairs')`
// anywhere. A Mathematics topic gets exactly the same treatment as a Current
// Affairs one the moment attempts for it exist (master prompt §13, §14).

export interface TopicPerformance {
  topicId: string;
  subjectId: string;
  attempted: number;
  correct: number;
}

/** Per-topic attempted/correct counts across every exam/subject with topic-tagged attempts. */
export async function getTopicPerformance(): Promise<TopicPerformance[]> {
  const all = await universalAttemptsDB.getAll();
  const byTopic = new Map<string, TopicPerformance>();
  for (const record of all) {
    if (!record.topicId || !record.wasAnswered) continue;
    const existing = byTopic.get(record.topicId) ?? { topicId: record.topicId, subjectId: record.subjectId, attempted: 0, correct: 0 };
    existing.attempted += 1;
    if (record.isCorrect) existing.correct += 1;
    byTopic.set(record.topicId, existing);
  }
  return Array.from(byTopic.values());
}

/** Most recent N ledger records, most recent first — spans every exam/subject, not just Current Affairs. */
export async function getRecentAttemptRecords(limit: number): Promise<UniversalAttemptRecord[]> {
  const all = await universalAttemptsDB.getAll();
  return all.sort((a, b) => b.attemptedAt - a.attemptedAt).slice(0, limit);
}
