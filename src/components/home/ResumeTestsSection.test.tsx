// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResumeTestsSection } from './ResumeTestsSection';
import { archivedSessionsDB, savedSessionsDB } from '../../services/db';
import { usePracticeSessionStore } from '../../store/practiceSessionStore';
import type { PracticeSession } from '../../types/practiceSession';

function session(id: string, subjectIds: string[], label: string, lastActiveAt: number): PracticeSession {
  const ids = ['q1', 'q2', 'q3'];
  return {
    id, config: { examId: 'ssc-chsl', subjectIds, questionCount: 3, mode: 'practice', label },
    questionIds: ids, states: ids.map((questionId, i) => ({ questionId, selectedAnswer: i === 0 ? 'B' : null, isMarkedForReview: false, timeTaken: 0 })),
    currentIndex: 1, startedAt: 1_000, lastActiveAt, isCompleted: false, totalPausedTime: 0, visitedIndices: [0, 1],
  };
}
const park = (s: PracticeSession) => savedSessionsDB.put({ id: s.id, kind: 'universal', savedAt: 1, lastActiveAt: s.lastActiveAt, payload: s });

beforeEach(async () => {
  usePracticeSessionStore.getState().clearSession();
  for (const r of await savedSessionsDB.getAll()) await savedSessionsDB.delete(r.id);
});
afterEach(cleanup);

describe('Resume Tests on Home', () => {
  it('shows only the newest unfinished test on Home and groups the full list in subject tabs', async () => {
    await park(session('m1', ['mathematics'], 'Average — Test 1', 5_000));
    await park(session('m2', ['mathematics'], 'Percentage — Test 2', 4_000));
    await park(session('e1', ['english'], 'Idioms — Test 1', 3_000));
    const user = userEvent.setup();
    render(<MemoryRouter><ResumeTestsSection /></MemoryRouter>);

    expect(await screen.findByText('Average — Test 1')).toBeTruthy();
    expect(screen.queryByText('Percentage — Test 2')).toBeNull();
    expect(screen.getAllByTestId('resume-card')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /View all \(3\)/ }));
    expect(await screen.findByRole('dialog', { name: 'All resumable tests' })).toBeTruthy();
    const mathTab = screen.getByRole('tab', { name: /mathematics/i });
    expect(mathTab.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel', { name: /mathematics resumable tests/i });
    expect(within(panel).getAllByTestId('resume-card')).toHaveLength(2);
    expect(within(panel).getByText('Percentage — Test 2')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /english/i }));
    const englishPanel = screen.getByRole('tabpanel', { name: /english resumable tests/i });
    expect(within(englishPanel).getByText('Idioms — Test 1')).toBeTruthy();
    expect(within(englishPanel).getByText(/Last active/)).toBeTruthy();
  });

  it('✕ asks first; Cancel changes nothing', async () => {
    await park(session('m1', ['mathematics'], 'Average — Test 1', 5_000));
    const user = userEvent.setup();
    render(<MemoryRouter><ResumeTestsSection /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /Close test: Average/ }));
    expect(await screen.findByText(/archived, not deleted/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await savedSessionsDB.get('m1')).toBeTruthy();
    expect(await archivedSessionsDB.get('m1')).toBeUndefined();
    expect(screen.getByTestId('resume-card')).toBeTruthy();
  });

  it('✕ → confirm removes the card from Resume Tests but keeps the record in the archive', async () => {
    await park(session('m1', ['mathematics'], 'Average — Test 1', 5_000));
    await park(session('m2', ['mathematics'], 'Percentage — Test 2', 4_000));
    const user = userEvent.setup();
    render(<MemoryRouter><ResumeTestsSection /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /Close test: Average/ }));
    await user.click(await screen.findByRole('button', { name: 'Close test' }));

    await waitFor(() => expect(screen.getAllByTestId('resume-card')).toHaveLength(1));
    expect(screen.queryByText('Average — Test 1')).toBeNull();
    expect(screen.getByText('Percentage — Test 2')).toBeTruthy(); // the other session is untouched
    expect(await savedSessionsDB.get('m1')).toBeUndefined();
    const archived = await archivedSessionsDB.get('m1');
    expect(archived?.archivedReason).toBe('user-closed');
    expect((archived!.payload as PracticeSession).states[0].selectedAnswer).toBe('B'); // answers preserved
    expect(await savedSessionsDB.get('m2')).toBeTruthy();
  });

  it('a completed session never appears', async () => {
    await park({ ...session('done', ['mathematics'], 'Finished', 5_000), isCompleted: true, completedAt: 6_000 });
    render(<MemoryRouter><ResumeTestsSection /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByTestId('resume-card')).toBeNull());
  });
});
