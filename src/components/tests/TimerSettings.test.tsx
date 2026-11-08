// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimerChip } from './TimerSettings';
import { useTimingPrefStore } from '../../store/timingPrefStore';
import { buildTestConfig } from '../../services/practiceTestLauncher';
import type { PracticeTestDefinition } from '../../services/testLibraryBuilder';

const test20 = { id: 't1', examId: 'ssc-chsl', subjectId: 'mathematics', title: 'Test 01', chapterTitle: 'Average', questionCount: 20, questionIds: Array.from({ length: 20 }, (_, i) => `q${i}`), isFixedMock: false } as unknown as PracticeTestDefinition;

beforeEach(() => { useTimingPrefStore.setState({ spec: { kind: 'default' } }); });
afterEach(cleanup);

describe('timer setup form', () => {
  it('saves an overall timer, remembers it, and the chip shows it', async () => {
    const user = userEvent.setup();
    render(<TimerChip questionCount={20} defaultLabel="About 90 seconds per question" />);
    expect(screen.getByRole('button', { name: /Default timer/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Test timer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Test timer' });
    await user.click(within(dialog).getByRole('radio', { name: /Overall timer/ }));
    const minutes = within(dialog).getByLabelText('Overall minutes');
    await user.clear(minutes); await user.type(minutes, '45');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(useTimingPrefStore.getState().spec).toEqual({ kind: 'overall', minutes: 45 });
    expect(screen.getByRole('button', { name: /45 min/ })).toBeTruthy();
  });

  it('builds a sectional timer by hand and shows how the questions split; invalid input blocks Save', async () => {
    const user = userEvent.setup();
    render(<TimerChip questionCount={20} defaultLabel="x" />);
    await user.click(screen.getByRole('button', { name: /Test timer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Test timer' });
    await user.click(within(dialog).getByRole('radio', { name: /Sectional timers/ }));
    await user.click(within(dialog).getByRole('button', { name: 'More sections' })); // 3 sections
    expect(within(dialog).getByText(/Section 1 · 7 Qs/)).toBeTruthy(); // 20 → 7, 7, 6
    expect(within(dialog).getByText(/Section 3 · 6 Qs/)).toBeTruthy();
    const s2 = within(dialog).getByLabelText('Section 2 minutes');
    await user.clear(s2);
    expect((within(dialog).getByRole('alert')).textContent).toMatch(/Every section/);
    expect((within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(s2, '5');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(useTimingPrefStore.getState().spec).toEqual({ kind: 'sectional', sectionMinutes: [10, 5, 10] });
  });

  it('Cancel leaves the saved choice alone', async () => {
    const user = userEvent.setup();
    render(<TimerChip defaultLabel="x" />);
    await user.click(screen.getByRole('button', { name: /Test timer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Test timer' });
    await user.click(within(dialog).getByRole('radio', { name: /No timer/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(useTimingPrefStore.getState().spec).toEqual({ kind: 'default' });
  });
});

describe('how the choice reaches a started test', () => {
  it('default keeps the long-standing 90 s/question; overall, none and sectional replace it', () => {
    expect(buildTestConfig(test20, 'test').durationSeconds).toBe(1800);
    expect(buildTestConfig(test20, 'test', undefined, { kind: 'default' }).timing).toBeUndefined();
    expect(buildTestConfig(test20, 'test', undefined, { kind: 'overall', minutes: 12 })).toMatchObject({ durationSeconds: 720, timing: { mode: 'overall' } });
    const none = buildTestConfig(test20, 'test', undefined, { kind: 'none' });
    expect(none.durationSeconds).toBeUndefined();
    expect(none.timing).toBeUndefined();
    const sec = buildTestConfig(test20, 'test', undefined, { kind: 'sectional', sectionMinutes: [5, 10] });
    expect(sec.durationSeconds).toBe(900);
    expect(sec.timing?.sections?.map((s) => [s.startIndex, s.endIndex])).toEqual([[0, 10], [10, 20]]);
  });
  it('an impossible choice for this test falls back to the default instead of failing; practice mode ignores timing', () => {
    expect(buildTestConfig(test20, 'test', undefined, { kind: 'sectional', sectionMinutes: Array(9).fill(5) }).durationSeconds).toBe(1800);
    const practice = buildTestConfig(test20, 'practice', undefined, { kind: 'overall', minutes: 5 });
    expect(practice.mode).toBe('practice');
    expect(practice.durationSeconds).toBeUndefined();
  });
});
