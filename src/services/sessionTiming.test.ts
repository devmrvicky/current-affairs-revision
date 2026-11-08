import { describe, expect, it } from 'vitest';
import {
  canVisitQuestion, deriveSectionState, finishActiveSection, formatClock, resolveTiming, sectionIndexOfQuestion, sessionElapsedSeconds, splitQuestions, validateTimingSpec,
} from './sessionTiming';

describe('validating what the learner typed', () => {
  it('accepts whole minutes in range and rejects the rest', () => {
    expect(validateTimingSpec({ kind: 'overall', minutes: 30 }, 20)).toBeNull();
    for (const m of [0, -5, 601, 2.5, NaN]) expect(validateTimingSpec({ kind: 'overall', minutes: m }, 20)).toMatch(/whole number/);
  });
  it('sectional needs 2–8 sections, each valid, and no more sections than questions', () => {
    expect(validateTimingSpec({ kind: 'sectional', sectionMinutes: [10] }, 20)).toMatch(/at least 2/);
    expect(validateTimingSpec({ kind: 'sectional', sectionMinutes: Array(9).fill(5) }, 50)).toMatch(/At most 8/);
    expect(validateTimingSpec({ kind: 'sectional', sectionMinutes: [5, 5, 5] }, 2)).toMatch(/only 2 questions/);
    expect(validateTimingSpec({ kind: 'sectional', sectionMinutes: [5, 0] }, 20)).toMatch(/Every section/);
    expect(validateTimingSpec({ kind: 'sectional', sectionMinutes: [5, 10] }, 20)).toBeNull();
    expect(validateTimingSpec({ kind: 'default' }, 20)).toBeNull();
    expect(validateTimingSpec({ kind: 'none' }, 20)).toBeNull();
  });
});

describe('resolving a choice into session timing', () => {
  it('default leaves the app default alone; none removes the timer', () => {
    expect(resolveTiming({ kind: 'default' }, 20, 1800)).toEqual({ durationSeconds: 1800 });
    expect(resolveTiming({ kind: 'none' }, 20, 1800)).toEqual({});
  });
  it('overall sets durationSeconds and timing together', () => {
    expect(resolveTiming({ kind: 'overall', minutes: 25 }, 20, 1800)).toEqual({ durationSeconds: 1500, timing: { mode: 'overall', overallSeconds: 1500 } });
  });
  it('splits questions as evenly as possible and covers every one exactly once', () => {
    expect(splitQuestions(10, 3)).toEqual([4, 3, 3]);
    const { timing, durationSeconds } = resolveTiming({ kind: 'sectional', sectionMinutes: [5, 10, 15] }, 10, undefined);
    const secs = timing!.sections!;
    expect(secs.map((s) => [s.startIndex, s.endIndex])).toEqual([[0, 4], [4, 7], [7, 10]]);
    expect(secs.map((s) => s.durationSeconds)).toEqual([300, 600, 900]);
    expect(durationSeconds).toBe(1800); // total = sum, so everything reading durationSeconds stays correct
    expect(timing!.overallSeconds).toBe(1800);
  });
  it('refuses an invalid spec instead of guessing', () => {
    expect(() => resolveTiming({ kind: 'sectional', sectionMinutes: [5] }, 10, 100)).toThrow(/at least 2/);
  });
});

describe('the session clock', () => {
  const base = { startedAt: 1_000_000, totalPausedTime: 0 };
  it('is wall time minus paused time, frozen while paused, suspended or finished', () => {
    expect(sessionElapsedSeconds(base, 1_090_000)).toBe(90);
    expect(sessionElapsedSeconds({ ...base, totalPausedTime: 30_000 }, 1_090_000)).toBe(60);
    expect(sessionElapsedSeconds({ ...base, pausedAt: 1_050_000 }, 9_999_999)).toBe(50);
    expect(sessionElapsedSeconds({ ...base, suspendedAt: 1_040_000 }, 9_999_999)).toBe(40);
    expect(sessionElapsedSeconds({ ...base, completedAt: 1_030_000 }, 9_999_999)).toBe(30);
    expect(sessionElapsedSeconds(base, 0)).toBe(0); // never negative
  });
});

describe('sectional state derived from the clock', () => {
  const { timing } = resolveTiming({ kind: 'sectional', sectionMinutes: [1, 2, 1] }, 8, undefined); // 60s, 120s, 60s
  const t = timing!;

  it('starts in section 1 with its full time', () => {
    expect(deriveSectionState(t, undefined, 0)).toMatchObject({ activeIndex: 0, sectionRemainingSeconds: 60, totalRemainingSeconds: 240, finished: false });
    expect(deriveSectionState(t, [], 15)).toMatchObject({ activeIndex: 0, sectionRemainingSeconds: 45, totalRemainingSeconds: 225 });
  });
  it('moves to the next section the moment time runs out', () => {
    const s = deriveSectionState(t, [0], 60);
    expect(s).toMatchObject({ activeIndex: 1, starts: [0, 60], sectionRemainingSeconds: 120, totalRemainingSeconds: 180 });
  });
  it('after a long absence, lands in the right later section with the right time left', () => {
    const s = deriveSectionState(t, [0], 200); // 60 + 120 = 180 → section 3 began at 180
    expect(s).toMatchObject({ activeIndex: 2, starts: [0, 60, 180], sectionRemainingSeconds: 40, totalRemainingSeconds: 40 });
  });
  it('is finished when the last section ends, and stays finished', () => {
    expect(deriveSectionState(t, [0, 60, 180], 240)).toMatchObject({ finished: true, totalRemainingSeconds: 0 });
    expect(deriveSectionState(t, [0], 99_999)).toMatchObject({ finished: true, activeIndex: 2 });
  });
  it('is stable: deriving again from its own output changes nothing (refresh-safe)', () => {
    const first = deriveSectionState(t, [0], 130);
    const again = deriveSectionState(t, first.starts, 130);
    expect(again).toEqual(first);
  });
  it('finishing a section early starts the next one now, with its full time', () => {
    const starts = finishActiveSection(t, [0], 25);
    expect(starts).toEqual([0, 25]);
    expect(deriveSectionState(t, starts, 25)).toMatchObject({ activeIndex: 1, sectionRemainingSeconds: 120 });
    expect(deriveSectionState(t, starts, 100)).toMatchObject({ activeIndex: 1, sectionRemainingSeconds: 45 });
  });
  it('the last section cannot be "finished" — that is Submit', () => {
    expect(finishActiveSection(t, [0, 60, 180], 200)).toEqual([0, 60, 180]);
  });
});

describe('navigation lock', () => {
  const t = resolveTiming({ kind: 'sectional', sectionMinutes: [1, 1] }, 6, undefined).timing!; // [0..3) [3..6)
  it('maps questions to sections', () => {
    expect([0, 2, 3, 5].map((i) => sectionIndexOfQuestion(t, i))).toEqual([0, 0, 1, 1]);
  });
  it('only the active section is open; overall/untimed tests are unrestricted', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => canVisitQuestion(t, 0, i))).toEqual([true, true, true, false, false, false]);
    expect([0, 1, 2, 3, 4, 5].map((i) => canVisitQuestion(t, 1, i))).toEqual([false, false, false, true, true, true]);
    expect(canVisitQuestion({ mode: 'overall', overallSeconds: 60 }, 0, 5)).toBe(true);
    expect(canVisitQuestion(undefined, 0, 5)).toBe(true);
  });
});

describe('formatting', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect([0, 59, 61, 3599, 3600, 3725].map(formatClock)).toEqual(['00:00', '00:59', '01:01', '59:59', '1:00:00', '1:02:05']);
    expect(formatClock(-4)).toBe('00:00');
  });
});
