import { describe, expect, it } from 'vitest';
import { buildSubjectCards, mergeRecent, recentFromLegacy, recentFromMocks, recentFromUniversal, weakSnapshot } from './homeSnapshots';
import type { UniversalAttemptRecord } from './db';
import type { MockAttemptRecord } from '../types/mockSession';
import type { SavedTest } from '../types';

const row = (i: number, over: Partial<UniversalAttemptRecord> = {}): UniversalAttemptRecord => ({
  id: `r${i}`, examId: 'ssc-chsl', subjectId: 'mathematics', topicId: 'average', isCorrect: false, wasAnswered: true, timeTaken: 10, attemptedAt: 1000 + i, sessionId: 's1', sourceFileName: 'f.json', ...over,
});

describe('buildSubjectCards', () => {
  const rows = [{ subject: { id: 'mathematics', name: 'Mathematics' }, questionCount: 40 }, { subject: { id: 'english', name: 'English' }, questionCount: 0 }, { subject: { id: 'current-affairs', name: 'Current Affairs' }, questionCount: 9 }];
  it('uses real attempted/correct, shows null accuracy (not 0 %) when nothing was attempted, and treats Current Affairs like any subject', () => {
    const cards = buildSubjectCards(rows, [{ subjectId: 'mathematics', attempted: 8, correct: 6 }], (id) => (id === 'mathematics' ? 12 : 0), null);
    expect(cards[0]).toMatchObject({ id: 'mathematics', chapters: 12, questions: 40, attempted: 8, accuracy: 75 });
    expect(cards[1]).toMatchObject({ id: 'english', attempted: 0, accuracy: null });
    expect(cards[2]).toMatchObject({ id: 'current-affairs', attempted: 0, accuracy: null });
  });
  it('falls back to the older Current Affairs average only when the ledger has nothing for it', () => {
    expect(buildSubjectCards(rows, [], () => 0, 61.6)[2]).toMatchObject({ attempted: null, accuracy: 62 });
    expect(buildSubjectCards(rows, [{ subjectId: 'current-affairs', attempted: 10, correct: 5 }], () => 0, 61.6)[2]).toMatchObject({ attempted: 10, accuracy: 50 });
  });
});

describe('weakSnapshot', () => {
  it('rates a topic only from 10 answered attempts; below that it is "insufficient", never weak', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row(i, { isCorrect: i < 2 })), // 20 % over 10 → Weak
      ...Array.from({ length: 9 }, (_, i) => row(50 + i, { topicId: 'percentage', sessionId: 's2' })), // 0 % over 9 → not rated
    ];
    const snap = weakSnapshot(rows, 3);
    expect(snap.top.map((t) => t.topicId)).toEqual(['average']);
    expect(snap.ratedCount).toBe(1);
    expect(snap.insufficientCount).toBe(1);
    expect(snap.minAttempts).toBe(10);
  });
  it('returns at most `limit` weak topics', () => {
    const rows = ['t1', 't2', 't3', 't4'].flatMap((topicId, k) => Array.from({ length: 10 }, (_, i) => row(k * 20 + i, { topicId, sessionId: `s${k}` })));
    expect(weakSnapshot(rows, 3).top).toHaveLength(3);
  });
  it('is empty with no attempts', () => expect(weakSnapshot([])).toMatchObject({ top: [], totalTopics: 0, ratedCount: 0 }));
});

describe('recent attempts', () => {
  it('lists one entry per labelled practice/test session, with its real accuracy and a reopenable route', () => {
    const rows = [
      ...[0, 1, 2, 3].map((i) => row(i, { sessionId: 'sA', sessionLabel: 'Average — Test 1', sessionMode: 'test', sessionCompletedAt: 5000, isCorrect: i < 3, wasAnswered: i < 4 })),
      row(9, { sessionId: 'sB' }), // no label → cannot be reopened → not listed
    ];
    const out = recentFromUniversal(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Average — Test 1', kind: 'test', at: 5000, answered: 4, total: 4, accuracy: 75, route: '/session/result/sA' });
  });
  it('mock attempts carry no invented score; legacy tests keep theirs; the merge is newest-first and capped', () => {
    const mock = { id: 'm1', mockDefinitionId: 'mx', title: 'Full mock', completedAt: 9000, states: { a: { selectedAnswer: 'A' }, b: { selectedAnswer: null } } } as unknown as MockAttemptRecord;
    const legacy = { id: 'L1', displayDate: '1 Nov', savedAt: 7000, totalQuestions: 10, unanswered: 2, accuracy: 60, isRevision: true } as SavedTest;
    const m = recentFromMocks([mock]);
    expect(m[0]).toMatchObject({ kind: 'mock', answered: 1, total: 2, accuracy: null, route: '/mock-tests/mx/result/m1' });
    const l = recentFromLegacy([legacy]);
    expect(l[0]).toMatchObject({ kind: 'daily', answered: 8, accuracy: 60, title: '1 Nov · Revision', route: '/history/L1' });
    const merged = mergeRecent([l, m, recentFromUniversal([row(0, { sessionLabel: 'P', sessionCompletedAt: 8000 })])], 2);
    expect(merged.map((x) => x.at)).toEqual([9000, 8000]);
  });
});
