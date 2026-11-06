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
  it('groups cards by subject and shows title, progress and last activity', async () => {
    await park(session('m1', ['mathematics'], 'Average — Test 1', 5_000));
    await park(session('m2', ['mathematics'], 'Percentage — Test 2', 4_000));
    await park(session('e1', ['english'], 'Idioms — Test 1', 3_000));
    render(<MemoryRouter><ResumeTestsSection /></MemoryRouter>);

    const groups = await screen.findAllByTestId('resume-group');
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getAllByTestId('resume-card')).toHaveLength(2); // the two Mathematics tests together
    expect(within(groups[1]).getAllByTestId('resume-card')).toHaveLength(1);
    expect(within(groups[0]).getByText('Average — Test 1')).toBeTruthy();
    expect(within(groups[0]).getAllByText(/1 of 3/).length).toBeGreaterThan(0);
    expect(within(groups[0]).getAllByText(/Last active/).length).toBe(2);
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
