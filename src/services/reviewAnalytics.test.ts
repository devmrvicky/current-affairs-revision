import { describe, expect, it } from 'vitest';
import {
  attemptSource, buildQuestionHistories, compareImprovement, dedupeAttempts, improvementByTopic, mistakesByTopic, rankRevisionPriority, repeatedMistakes,
  revisionPriority, weakTopics, WEAK_MIN_ATTEMPTS, type AttemptRow,
} from './reviewAnalytics';

const DAY = 86_400_000;
const NOW = 100 * DAY;
let n = 0;
function row(q: string, correct: boolean | 'skip', daysAgo: number, over: Partial<AttemptRow> = {}): AttemptRow {
  n++;
  return { id: `r${n}`, universalQuestionId: q, subjectId: 'mathematics', topicId: 'average', isCorrect: correct === true, wasAnswered: correct !== 'skip', timeTaken: 20, attemptedAt: NOW - daysAgo * DAY, sessionId: `s${n}`, sourceFileName: `universal-session-s${n}`, ...over };
}

describe('sources and duplicates', () => {
  it('reads the source from how the ledger names it', () => {
    expect(attemptSource({ sourceFileName: 'mock-session-1' })).toBe('mock');
    expect(attemptSource({ sourceFileName: 'universal-session-1' })).toBe('practice');
    expect(attemptSource({ sourceFileName: 'january-2026.json' })).toBe('chapter');
  });
  it('never counts the same attempt twice', () => {
    const a = row('q1', false, 3, { id: 'same' });
    const merged = dedupeAttempts([a, { ...a }, { ...a, attemptedAt: a.attemptedAt + 5 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].attemptedAt).toBe(a.attemptedAt + 5);
    expect(buildQuestionHistories([a, { ...a }]).get('q1')!.attempts).toBe(1);
  });
});

describe('mistake frequency', () => {
  it('counts wrong, skipped and the streak since the last mistake, in time order regardless of input order', () => {
    const rows = [row('q', true, 1), row('q', false, 10), row('q', 'skip', 5), row('q', false, 8), row('q', true, 2)];
    const h = buildQuestionHistories(rows).get('q')!;
    expect(h).toMatchObject({ attempts: 5, answered: 4, wrong: 2, skipped: 1, trailingCorrect: 2, lastWasWrong: false });
  });
  it('lists repeated mistakes worst-first and rolls up by topic', () => {
    const rows = [row('a', false, 9), row('a', false, 8), row('a', false, 1), row('b', false, 3), row('b', false, 2), row('c', false, 4), row('c', true, 1, { topicId: 'percent' })];
    const hs = buildQuestionHistories(rows);
    expect(repeatedMistakes(hs.values()).map((h) => h.questionId)).toEqual(['a', 'b']);
    const topics = mistakesByTopic(hs.values());
    // question c was last seen under 'percent', so its one mistake is counted there, not under 'average'
    expect(topics.find((t) => t.topicId === 'average')).toMatchObject({ wrong: 5, questionsWrongAtLeastOnce: 2, repeatedQuestions: 2 });
    expect(topics.find((t) => t.topicId === 'percent')).toMatchObject({ wrong: 1, questionsWrongAtLeastOnce: 1, repeatedQuestions: 0 });
  });
});

describe('revision priority', () => {
  const hist = (rows: AttemptRow[]) => buildQuestionHistories(rows).get(rows[0].universalQuestionId!)!;

  it('has no score — rather than a fake zero — when there is nothing to base one on', () => {
    expect(revisionPriority({ questionId: 'x', now: NOW })).toBeNull();
    expect(revisionPriority({ questionId: 'x', purpose: 'review', now: NOW })).toBeNull(); // "mark for review" is per-test, not a revision signal
  });

  it('has no priority for a question that was only ever answered correctly and is not marked', () => {
    expect(revisionPriority({ questionId: 'q', history: hist([row('q', true, 5), row('q', true, 2)]), now: NOW })).toBeNull();
    // …but the same question marked for revision does
    expect(revisionPriority({ questionId: 'q', history: hist([row('q', true, 5), row('q', true, 2)]), purpose: 'revision', now: NOW })).not.toBeNull();
  });

  it('is transparent: every point comes from a listed factor, and the total adds up', () => {
    const h = hist([row('q', false, 12), row('q', false, 6), row('q', false, 5)]);
    const r = revisionPriority({ questionId: 'q', history: h, purpose: 'doubtful', now: NOW })!;
    const sum = r.factors.reduce((a, f) => a + f.points, 0);
    expect(r.factors.map((f) => f.label)).toEqual(expect.arrayContaining(['Wrong 3 times', 'Latest attempt was wrong', 'Marked doubtful']));
    expect(r.score).toBe(Math.round(sum));
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.band).toBe('high');
    expect(r.confidence).toBe('ok');
  });

  it('rises with repeated wrong attempts and with staleness; stays within 0–100', () => {
    const one = revisionPriority({ questionId: 'q', history: hist([row('q', false, 1)]), now: NOW })!;
    const three = revisionPriority({ questionId: 'q', history: hist([row('q', false, 3), row('q', false, 2), row('q', false, 1)]), now: NOW })!;
    const stale = revisionPriority({ questionId: 'q', history: hist([row('q', false, 40)]), now: NOW })!;
    expect(three.score).toBeGreaterThan(one.score);
    expect(stale.score).toBeGreaterThan(one.score);
    const worst = revisionPriority({ questionId: 'q', history: hist([row('q', false, 90), row('q', false, 80), row('q', false, 70)]), purpose: 'doubtful', now: NOW })!;
    expect(worst.score).toBeLessThanOrEqual(100);
  });

  it('gradually fades with correct answers in a row, and is "mastered" after three', () => {
    const wrongTwice = [row('q', false, 20), row('q', false, 19)];
    const scores = [0, 1, 2, 3, 4].map((k) => revisionPriority({ questionId: 'q', history: hist([...wrongTwice, ...Array.from({ length: k }, (_, i) => row('q', true, 10 - i))]), purpose: 'revision', now: NOW })!);
    for (let i = 1; i < scores.length; i++) expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
    expect(scores[0].score).toBeGreaterThan(scores[2].score);
    expect(scores[3].band).toBe('mastered');
    expect(scores[4].score).toBe(0);
    expect(scores[2].band).not.toBe('mastered');
  });

  it('a marked-but-never-attempted question scores from its mark alone, flagged low confidence', () => {
    const r = revisionPriority({ questionId: 'q', purpose: 'practice', markedAt: NOW - 10 * DAY, now: NOW })!;
    expect(r.confidence).toBe('low');
    expect(r.factors.map((f) => f.label)).toEqual(expect.arrayContaining(['Marked for further practice']));
    expect(r.score).toBeGreaterThan(0);
  });

  it('ranks high-risk unresolved questions above consistently-correct ones', () => {
    const rows = [row('bad', false, 5), row('bad', false, 4), row('ok', false, 9), row('ok', true, 8), row('ok', true, 7), row('ok', true, 6)];
    const ranked = rankRevisionPriority(buildQuestionHistories(rows), new Map([['ok', { purpose: 'revision' as const }], ['marked-only', { purpose: 'doubtful' as const, markedAt: NOW - 2 * DAY }]]), NOW);
    expect(ranked[0].questionId).toBe('bad');
    expect(ranked.map((r) => r.questionId)).toContain('marked-only');
    expect(ranked.find((r) => r.questionId === 'ok')!.band).toBe('mastered');
    expect(ranked.findIndex((r) => r.questionId === 'ok')).toBeGreaterThan(ranked.findIndex((r) => r.questionId === 'bad'));
  });
});

describe('improvement tracker', () => {
  const series = (flags: boolean[], topicId = 'average') => flags.map((f, i) => row(`q${i}`, f, flags.length - i, { topicId }));

  it('compares the older half with the newer half', () => {
    const r = compareImprovement(series([false, false, false, true, false, true, true, true, true, true, true, true]));
    expect(r).toMatchObject({ reliable: true, previousAttempts: 6, latestAttempts: 6, trend: 'improving' });
    expect(r.latestAccuracy).toBeGreaterThan(r.previousAccuracy!);
    expect(r.delta).toBeGreaterThan(5);
  });
  it('detects decline and steadiness', () => {
    expect(compareImprovement(series([true, true, true, true, true, false, false, true, false, false])).trend).toBe('declining');
    expect(compareImprovement(series([true, false, true, false, true, true, false, true, false, true])).trend).toBe('steady');
  });
  it('refuses to call a trend on a small sample, and says why', () => {
    const r = compareImprovement(series([false, false, true, true, true, true]));
    expect(r).toMatchObject({ trend: 'insufficient-data', reliable: false });
    expect(r.note).toMatch(/at least 5/);
  });
  it('skipped questions do not count as attempts, and duplicates are ignored', () => {
    const base = series([false, false, false, false, false, true, true, true, true, true]);
    const withNoise = [...base, row('skip', 'skip', 50), { ...base[0] }];
    expect(compareImprovement(withNoise)).toEqual(compareImprovement(base));
  });
  it('groups by topic and lists declining topics first', () => {
    const rows = [...series([true, true, true, true, true, false, false, false, false, false], 'down'), ...series([false, false, false, false, false, true, true, true, true, true], 'up'), ...series([true, false], 'tiny')];
    expect(improvementByTopic(rows).map((t) => [t.topicId, t.trend])).toEqual([['down', 'declining'], ['up', 'improving'], ['tiny', 'insufficient-data']]);
  });
});

describe('unified weak topics', () => {
  const many = (count: number, accuracy: number, over: Partial<AttemptRow> = {}) =>
    Array.from({ length: count }, (_, i) => row(`${over.topicId ?? 'average'}-q${i}`, i < Math.round(count * accuracy), count - i, over));

  it('does not rate a topic until it has enough answered attempts', () => {
    const [t] = weakTopics(many(WEAK_MIN_ATTEMPTS - 1, 0));
    expect(t.status).toBe('Insufficient data');
    expect(t.weaknessIndex).toBeNull();
    expect(t.note).toMatch(/needed before/);
  });
  it('labels Weak / Average / Strong by accuracy once the sample is big enough', () => {
    const rows = [...many(20, 0.3, { topicId: 'weak-t' }), ...many(20, 0.7, { topicId: 'avg-t' }), ...many(20, 0.95, { topicId: 'strong-t' })];
    const res = weakTopics(rows);
    expect(res.map((t) => [t.topicId, t.status])).toEqual([['weak-t', 'Weak'], ['avg-t', 'Average'], ['strong-t', 'Strong']]);
    expect(res[0].weaknessIndex!).toBeGreaterThan(res[1].weaknessIndex!);
  });
  it('combines every source and also reports each separately', () => {
    const rows = [
      ...many(8, 0.5, { sourceFileName: 'universal-session-a' }).map((r, i) => ({ ...r, id: `p${i}`, sessionId: 'a' })),
      ...many(6, 0.5, { sourceFileName: 'mock-session-b' }).map((r, i) => ({ ...r, id: `m${i}`, sessionId: 'b' })),
    ];
    const [t] = weakTopics(rows);
    expect(t.attempted).toBe(14);
    expect(t.sessions).toBe(2);
    expect(t.bySource.map((s) => [s.source, s.attempted])).toEqual([['practice', 8], ['mock', 6]]);
    expect(t.bySource.reduce((n, s) => n + s.attempted, 0)).toBe(t.attempted);
  });
  it('does not double-count a merged duplicate, and excludes skipped questions from accuracy', () => {
    const rows = many(12, 0.5);
    const noisy = [...rows, ...rows.map((r) => ({ ...r })), row('skipped', 'skip', 1)];
    const clean = weakTopics(rows)[0], dirty = weakTopics(noisy)[0];
    expect(dirty.attempted).toBe(clean.attempted);
    expect(dirty.accuracy).toBe(clean.accuracy);
    expect(dirty.skipped).toBe(1);
  });
  it('reports repeated mistakes and the questions behind them', () => {
    const rows = [...many(12, 1), row('hard', false, 9), row('hard', false, 8), row('hard', false, 7)];
    const [t] = weakTopics(rows);
    expect(t.repeatedMistakeQuestions).toBe(1);
    expect(t.frequentlyWrongQuestionIds).toEqual(['hard']);
  });
  it('averages solving time over timed attempts only', () => {
    const rows = many(10, 0.5).map((r, i) => ({ ...r, timeTaken: i < 5 ? 30 : 0 }));
    expect(weakTopics(rows)[0].avgTimeSec).toBe(30);
  });
});
