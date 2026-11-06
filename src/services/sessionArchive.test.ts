// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { archivedSessionsDB, savedSessionsDB } from './db';
import { archiveSession, buildArchiveRecord } from './sessionArchive';
import { listResumableSessions, groupResumableSessions } from './sessionManager';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { summarizePractice } from './sessionLifecycle';
import type { PracticeConfiguration, PracticeSession } from '../types/practiceSession';
import type { ResumableSessionSummary } from '../types/savedSession';

const config = (over: Partial<PracticeConfiguration> = {}): PracticeConfiguration => ({
  examId: 'ssc-chsl', subjectIds: ['mathematics'], questionCount: 3, mode: 'practice', label: 'Average — Test 1', ...over,
});

function session(id: string, over: Partial<PracticeSession> = {}): PracticeSession {
  const ids = ['q1', 'q2', 'q3'];
  return {
    id, config: config(), questionIds: ids,
    states: ids.map((questionId) => ({ questionId, selectedAnswer: null, isMarkedForReview: false, timeTaken: 0 })),
    currentIndex: 0, startedAt: 1_000, lastActiveAt: 1_000, isCompleted: false, totalPausedTime: 0, visitedIndices: [0], ...over,
  };
}

beforeEach(async () => {
  usePracticeSessionStore.getState().clearSession();
  for (const r of await savedSessionsDB.getAll()) await savedSessionsDB.delete(r.id);
});

describe('✕ archives instead of deleting', () => {
  it('moves a parked session out of Resume Tests but keeps the whole record', async () => {
    const s = session('parked-1', { currentIndex: 2 });
    s.states[0].selectedAnswer = 'B';
    await savedSessionsDB.put({ id: s.id, kind: 'universal', savedAt: 1, lastActiveAt: 1_000, payload: s });

    const before = (await listResumableSessions()).find((x) => x.id === 'parked-1')!;
    expect(before).toBeTruthy();

    expect(await archiveSession(before)).toBe(true);

    expect((await listResumableSessions()).some((x) => x.id === 'parked-1')).toBe(false);
    expect(await savedSessionsDB.get('parked-1')).toBeUndefined();

    const archived = await archivedSessionsDB.get('parked-1');
    expect(archived).toBeTruthy();
    expect(archived!.archivedReason).toBe('user-closed');
    expect((archived!.payload as PracticeSession).states[0].selectedAnswer).toBe('B');
    expect((archived!.payload as PracticeSession).currentIndex).toBe(2);
  });

  it('archives the on-screen session too, and clears it from its engine store', async () => {
    usePracticeSessionStore.getState().loadSession(session('live-1'));
    const summary = (await listResumableSessions()).find((x) => x.id === 'live-1')!;
    expect(summary.location).toBe('active');

    await archiveSession(summary);

    expect(usePracticeSessionStore.getState().session).toBeNull();
    expect(await archivedSessionsDB.get('live-1')).toBeTruthy();
    expect((await listResumableSessions()).some((x) => x.id === 'live-1')).toBe(false);
  });

  it('returns false and writes nothing when the session no longer exists', async () => {
    const ghost: ResumableSessionSummary = summarizePractice(session('ghost'), 'saved', 5_000);
    expect(await archiveSession(ghost)).toBe(false);
    expect(await archivedSessionsDB.get('ghost')).toBeUndefined();
  });

  it('never lists a completed session as resumable', async () => {
    const done = session('done-1', { isCompleted: true, completedAt: 2_000 });
    await savedSessionsDB.put({ id: done.id, kind: 'universal', savedAt: 1, lastActiveAt: 1_000, payload: done });
    expect((await listResumableSessions()).some((x) => x.id === 'done-1')).toBe(false);
  });

  it('builds a record that carries the summary fields for listing', () => {
    const s = session('x');
    const rec = buildArchiveRecord(summarizePractice(s, 'saved', 5_000), s, 9_999);
    expect(rec).toMatchObject({ id: 'x', kind: 'universal', archivedAt: 9_999, total: 3 });
  });
});

describe('Resume grouping', () => {
  it('groups by subject, newest activity first, and keeps every card exactly once', () => {
    const a = summarizePractice(session('a', { lastActiveAt: 3_000, config: config({ subjectIds: ['mathematics'] }) }), 'saved', 9_000);
    const b = summarizePractice(session('b', { lastActiveAt: 5_000, config: config({ subjectIds: ['mathematics'] }) }), 'saved', 9_000);
    const c = summarizePractice(session('c', { lastActiveAt: 4_000, config: config({ subjectIds: ['english', 'mathematics'] }) }), 'saved', 9_000);
    const groups = groupResumableSessions([a, b, c]);
    expect(groups.map((g) => g.label)).toEqual([a.group, 'Mixed subjects']);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['b', 'a']);
    expect(groups.flatMap((g) => g.sessions).length).toBe(3);
  });
});
