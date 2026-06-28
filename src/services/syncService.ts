import { v4 as uuidv4 } from 'uuid';
import { supabase, SUPABASE_ENABLED } from './supabaseClient';
import { useAuthStore } from '../store/authStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import {
  syncOutboxDB, syncMetaDB, withSyncSuppressed,
  testDB, bookmarksDB, wrongQuestionsDB, markedForReviewDB, settingsDB,
} from './db';
import type { SyncOutboxEntry, SyncTable } from './db';
import type { SavedTest, BookmarkedQuestion, WrongQuestion, MarkedReviewQuestion, Settings } from '../types';

// ─── Identity helpers ──────────────────────────────────────────────────────────

let deviceIdCache: string | null = null;

async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  const meta = await syncMetaDB.get();
  if (meta.deviceId) {
    deviceIdCache = meta.deviceId;
    return meta.deviceId;
  }
  const id = uuidv4();
  await syncMetaDB.save({ ...meta, deviceId: id });
  deviceIdCache = id;
  return id;
}

function getUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null;
}

const REMOTE_TABLE: Record<SyncTable, string> = {
  saved_tests: 'saved_tests',
  bookmarks: 'bookmarks',
  wrong_questions: 'wrong_questions',
  marked_for_review: 'marked_for_review',
  settings: 'settings',
};

// ─── Row ⇄ local-type mappers ──────────────────────────────────────────────────
// Every field is mapped explicitly (no spread shortcuts) — silent field-name
// drift here would corrupt synced data without ever throwing an error.

function savedTestToRow(t: SavedTest, userId: string) {
  return {
    id: t.id, user_id: userId, date: t.date, display_date: t.displayDate,
    file_name: t.fileName, score: t.score, accuracy: t.accuracy, correct: t.correct,
    wrong: t.wrong, unanswered: t.unanswered, total_questions: t.totalQuestions,
    time_taken: t.timeTaken, questions: t.questions, saved_at: t.savedAt,
    is_revision: t.isRevision, original_test_id: t.originalTestId ?? null,
  };
}
function rowToSavedTest(r: Record<string, any>): SavedTest {
  return {
    id: r.id, date: r.date, displayDate: r.display_date, fileName: r.file_name,
    score: r.score, accuracy: r.accuracy, correct: r.correct, wrong: r.wrong,
    unanswered: r.unanswered, totalQuestions: r.total_questions, timeTaken: r.time_taken,
    questions: r.questions ?? [], savedAt: r.saved_at, isRevision: r.is_revision,
    originalTestId: r.original_test_id ?? undefined,
  };
}

function bookmarkToRow(b: BookmarkedQuestion, userId: string) {
  return {
    id: b.id, user_id: userId, question_id: b.questionId, question: b.question,
    options: b.options, correct_answer: b.correctAnswer, explanation: b.explanation,
    source_file_name: b.sourceFileName, source_date: b.sourceDate, bookmarked_at: b.bookmarkedAt,
  };
}
function rowToBookmark(r: Record<string, any>): BookmarkedQuestion {
  return {
    id: r.id, questionId: r.question_id, question: r.question, options: r.options ?? [],
    correctAnswer: r.correct_answer, explanation: r.explanation, sourceFileName: r.source_file_name,
    sourceDate: r.source_date, bookmarkedAt: r.bookmarked_at,
  };
}

function wrongToRow(w: WrongQuestion, userId: string) {
  return {
    id: w.id, user_id: userId, question_id: w.questionId, question: w.question,
    options: w.options, correct_answer: w.correctAnswer, explanation: w.explanation,
    date_key: w.dateKey, display_date: w.displayDate, file_name: w.fileName,
    wrong_count: w.wrongCount, consecutive_correct: w.consecutiveCorrect, status: w.status,
    last_attempt_at: w.lastAttemptAt, added_at: w.addedAt,
  };
}
function rowToWrong(r: Record<string, any>): WrongQuestion {
  return {
    id: r.id, questionId: r.question_id, question: r.question, options: r.options ?? [],
    correctAnswer: r.correct_answer, explanation: r.explanation, dateKey: r.date_key,
    displayDate: r.display_date, fileName: r.file_name, wrongCount: r.wrong_count,
    consecutiveCorrect: r.consecutive_correct, status: r.status, lastAttemptAt: r.last_attempt_at,
    addedAt: r.added_at,
  };
}

function markedToRow(m: MarkedReviewQuestion, userId: string) {
  return {
    id: m.id, user_id: userId, question_id: m.questionId, question: m.question,
    options: m.options, correct_answer: m.correctAnswer, explanation: m.explanation,
    source_file_name: m.sourceFileName, source_date: m.sourceDate, marked_at: m.markedAt,
  };
}
function rowToMarked(r: Record<string, any>): MarkedReviewQuestion {
  return {
    id: r.id, questionId: r.question_id, question: r.question, options: r.options ?? [],
    correctAnswer: r.correct_answer, explanation: r.explanation, sourceFileName: r.source_file_name,
    sourceDate: r.source_date, markedAt: r.marked_at,
  };
}

function settingsToRow(s: Settings, userId: string) {
  return {
    user_id: userId, theme: s.theme, sound_enabled: s.soundEnabled, auto_save: s.autoSave,
    show_explanation: s.showExplanation, keyboard_navigation: s.keyboardNavigation,
    font_size: s.fontSize, auto_next_seconds: s.autoNextSeconds,
  };
}
function rowToSettings(r: Record<string, any>): Settings {
  return {
    theme: r.theme, soundEnabled: r.sound_enabled, autoSave: r.auto_save,
    showExplanation: r.show_explanation, keyboardNavigation: r.keyboard_navigation,
    fontSize: r.font_size, autoNextSeconds: r.auto_next_seconds,
  };
}

// ─── Push: drain the local outbox to Supabase ─────────────────────────────────

let isPushing = false;

export async function pushOutbox(): Promise<{ pushed: number; failed: number }> {
  if (!SUPABASE_ENABLED) return { pushed: 0, failed: 0 };
  const userId = getUserId();
  if (!userId || isPushing) return { pushed: 0, failed: 0 };

  isPushing = true;
  try {
    const entries = await syncOutboxDB.getAll();
    if (entries.length === 0) {
      useSyncStatusStore.getState().setPendingCount(0);
      return { pushed: 0, failed: 0 };
    }

    useSyncStatusStore.getState().setStatus('syncing');
    const succeededIds: string[] = [];
    let failed = 0;

    for (const entry of entries) {
      try {
        await applyOutboxEntry(entry, userId);
        succeededIds.push(entry.id);
      } catch (err) {
        console.error('[Sync] push failed for entry', entry.id, err);
        failed++;
      }
    }

    if (succeededIds.length > 0) await syncOutboxDB.deleteMany(succeededIds);

    const remaining = await syncOutboxDB.count();
    useSyncStatusStore.getState().setPendingCount(remaining);
    useSyncStatusStore.getState().setStatus(remaining > 0 ? 'pending' : 'synced');
    if (failed > 0) useSyncStatusStore.getState().setError(`${failed} item(s) failed to sync — will retry`);

    return { pushed: succeededIds.length, failed };
  } finally {
    isPushing = false;
  }
}

async function applyOutboxEntry(entry: SyncOutboxEntry, userId: string): Promise<void> {
  const table = REMOTE_TABLE[entry.table];

  if (entry.op === 'clear') {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }

  if (entry.op === 'delete') {
    if (entry.table === 'settings') return; // single-row table, never individually deleted
    const id = entry.payload as string;
    const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('id', id);
    if (error) throw error;
    return;
  }

  // upsert — conflict target is each table's primary key (composite
  // user_id+id, or just user_id for settings), resolved automatically.
  let row: Record<string, unknown>;
  switch (entry.table) {
    case 'saved_tests': row = savedTestToRow(entry.payload as SavedTest, userId); break;
    case 'bookmarks': row = bookmarkToRow(entry.payload as BookmarkedQuestion, userId); break;
    case 'wrong_questions': row = wrongToRow(entry.payload as WrongQuestion, userId); break;
    case 'marked_for_review': row = markedToRow(entry.payload as MarkedReviewQuestion, userId); break;
    case 'settings': row = settingsToRow(entry.payload as Settings, userId); break;
  }
  const { error } = await supabase.from(table).upsert(row);
  if (error) throw error;
}

// ─── Pull: fetch anything newer than our local watermark ────────────────────

export async function pullChanges(): Promise<void> {
  if (!SUPABASE_ENABLED) return;
  const userId = getUserId();
  if (!userId) return;

  const meta = await syncMetaDB.get();
  const sinceIso = new Date(meta.lastSyncedAt || 0).toISOString();
  let maxSeen = meta.lastSyncedAt || 0;

  await withSyncSuppressed(async () => {
    const { data: tests } = await supabase.from('saved_tests').select('*').gt('updated_at', sinceIso);
    for (const row of tests ?? []) {
      await testDB.save(rowToSavedTest(row));
      maxSeen = Math.max(maxSeen, new Date(row.updated_at).getTime());
    }

    const { data: bookmarks } = await supabase.from('bookmarks').select('*').gt('updated_at', sinceIso);
    for (const row of bookmarks ?? []) {
      await bookmarksDB.upsert(rowToBookmark(row));
      maxSeen = Math.max(maxSeen, new Date(row.updated_at).getTime());
    }

    const { data: wrongQs } = await supabase.from('wrong_questions').select('*').gt('updated_at', sinceIso);
    for (const row of wrongQs ?? []) {
      await wrongQuestionsDB.upsert(rowToWrong(row));
      maxSeen = Math.max(maxSeen, new Date(row.updated_at).getTime());
    }

    const { data: marked } = await supabase.from('marked_for_review').select('*').gt('updated_at', sinceIso);
    for (const row of marked ?? []) {
      await markedForReviewDB.upsert(rowToMarked(row));
      maxSeen = Math.max(maxSeen, new Date(row.updated_at).getTime());
    }

    const { data: settingsRow } = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle();
    if (settingsRow && new Date(settingsRow.updated_at).getTime() > (meta.lastSyncedAt || 0)) {
      await settingsDB.save(rowToSettings(settingsRow));
      maxSeen = Math.max(maxSeen, new Date(settingsRow.updated_at).getTime());
    }
  });

  await syncMetaDB.save({ ...meta, userId, lastSyncedAt: maxSeen });
  useSyncStatusStore.getState().setLastSyncedAt(maxSeen);
}

// ─── First sign-in on a device: upload whatever's already local ─────────────

async function bulkUploadLocalData(userId: string): Promise<void> {
  const [tests, bookmarks, wrongQs, marked, settings] = await Promise.all([
    testDB.getAll(), bookmarksDB.getAll(), wrongQuestionsDB.getAll(), markedForReviewDB.getAll(), settingsDB.get(),
  ]);

  const batches: [string, Record<string, unknown>[]][] = [
    ['saved_tests', tests.map((t) => savedTestToRow(t, userId))],
    ['bookmarks', bookmarks.map((b) => bookmarkToRow(b, userId))],
    ['wrong_questions', wrongQs.map((w) => wrongToRow(w, userId))],
    ['marked_for_review', marked.map((m) => markedToRow(m, userId))],
  ];

  for (const [table, rows] of batches) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table).upsert(rows);
    if (error) console.error(`[Sync] initial upload failed for ${table}:`, error);
  }

  const { error: settingsError } = await supabase.from('settings').upsert(settingsToRow(settings, userId));
  if (settingsError) console.error('[Sync] initial upload failed for settings:', settingsError);
}

// ─── Sign-in / sign-out lifecycle ────────────────────────────────────────────

export async function onSignedIn(): Promise<void> {
  if (!SUPABASE_ENABLED) return;
  const userId = getUserId();
  if (!userId) return;

  useSyncStatusStore.getState().setStatus('syncing');
  useSyncStatusStore.getState().setError(null);

  const deviceId = await getDeviceId();

  // Best-effort analytics — never block sync on these.
  supabase.from('login_events').insert({ user_id: userId, device_info: navigator.userAgent }).then(
    () => {}, (err) => console.error('[Sync] login_events insert failed:', err)
  );
  supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', userId).then(
    () => {}, (err) => console.error('[Sync] heartbeat update failed:', err)
  );

  try {
    const meta = await syncMetaDB.get();
    const isFirstSyncForThisUser = meta.userId !== userId;

    if (isFirstSyncForThisUser) {
      // Protect whatever this device already accumulated locally before the
      // user ever signed in — upload it once, then proceed as normal.
      await bulkUploadLocalData(userId);
      await syncMetaDB.save({ ...meta, userId, deviceId, lastSyncedAt: 0 });
    }

    await pushOutbox();
    await pullChanges();
    useSyncStatusStore.getState().setStatus('synced');
  } catch (err) {
    console.error('[Sync] onSignedIn failed:', err);
    useSyncStatusStore.getState().setStatus('error');
    useSyncStatusStore.getState().setError(err instanceof Error ? err.message : 'Sync failed');
  }

  startHeartbeat();
}

export function onSignedOut(): void {
  stopHeartbeat();
  useSyncStatusStore.getState().setStatus('signed-out');
  useSyncStatusStore.getState().setPendingCount(0);
}

// ─── Heartbeat (drives the admin "currently active" count) ──────────────────

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    const userId = getUserId();
    if (!userId || document.visibilityState !== 'visible') return;
    supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', userId).then(
      () => {}, () => {} // heartbeat failures are silent — next tick retries
    );
  }, 30_000);
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ─── Data management ──────────────────────────────────────────────────────────

/** Deletes every synced row for the current user from the server. Local IndexedDB data is untouched. */
export async function deleteCloudData(): Promise<{ error: string | null }> {
  if (!SUPABASE_ENABLED) return { error: 'Sync is not configured for this build.' };
  const userId = getUserId();
  if (!userId) return { error: 'Not signed in.' };

  const tables = ['saved_tests', 'bookmarks', 'wrong_questions', 'marked_for_review', 'settings'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) return { error: error.message };
  }

  await syncMetaDB.save({ id: 'meta', deviceId: await getDeviceId(), userId, lastSyncedAt: 0 });
  return { error: null };
}

// ─── Foreground / reconnect triggers ──────────────────────────────────────────

export async function triggerSync(): Promise<void> {
  if (!SUPABASE_ENABLED || !navigator.onLine) return;
  const userId = getUserId();
  if (!userId) return;
  await pushOutbox();
  await pullChanges();
}

let listenersInitialized = false;

/** Call once from App.tsx — wires reconnect/foreground to trigger a sync pass. */
export function initSyncListeners(): void {
  if (listenersInitialized) return;
  listenersInitialized = true;

  window.addEventListener('online', () => { triggerSync().catch((e) => console.error('[Sync]', e)); });
  window.addEventListener('offline', () => {
    if (getUserId()) useSyncStatusStore.getState().setStatus('offline');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') triggerSync().catch((e) => console.error('[Sync]', e));
  });

  // Keep the pending-count badge fresh even without a push/pull cycle.
  syncOutboxDB.count().then((n) => useSyncStatusStore.getState().setPendingCount(n));
}
