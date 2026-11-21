// @vitest-environment jsdom
// Review Center after merging the duplicated tabs: Wrong / Marked / Recently-attempted are gone as tabs (they were the same questions the
// Review tab lists); Bookmarks stay; what those tabs offered lives on the one list; and closed (✕) tests can be browsed, view only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReviewCenterPage from './ReviewCenterPage';
import { archivedSessionsDB, getDB, markedForReviewDB, wrongQuestionsDB } from '../services/db';
import { buildArchiveRecord } from '../services/sessionArchive';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { question, questionsById, session } from '../test/resultFixtures';
import type { ResumableSessionSummary } from '../types/savedSession';
import type { QuizSession } from '../types';

vi.mock('../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ ...(questionsById.get(id) ?? question('q1')), id }))),
}));

const summary = (over: Partial<ResumableSessionSummary> = {}): ResumableSessionSummary => ({ id: 'arch-1', kind: 'universal', title: 'Quant sectional', subtitle: 'Mathematics', group: 'Mathematics', mode: 'test', answered: 5, total: 6, position: 6, remainingSeconds: null, markedCount: 1, createdAt: 1, lastActiveAt: 2, lifecycle: 'suspended', resumeRoute: '/session', location: 'saved', ...over } as ResumableSessionSummary);
const mount = () => render(<MemoryRouter><ReviewCenterPage /></MemoryRouter>);

beforeEach(async () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) });
  const db = await getDB();
  for (const s of ['archivedSessions', 'wrongQuestions', 'markedForReview', 'universalAttempts', 'bookmarks', 'savedTests'] as const) await db.clear(s);
  useWrongQuestionsStore.setState({ questions: [] });
  useMarkedReviewStore.setState({ items: [] });
});
afterEach(cleanup);

describe('tabs', () => {
  it('Wrong Questions, Marked For Review and Recently Attempted are no longer tabs; Review and Bookmarked remain', async () => {
    mount();
    const labels = (await screen.findAllByRole('button')).map((b) => b.textContent ?? '');
    const has = (re: RegExp) => labels.some((l) => re.test(l));
    expect(has(/^\s*Review/)).toBe(true);
    expect(has(/^\s*Bookmarked/)).toBe(true);
    expect(has(/Closed tests/)).toBe(true);
    expect(has(/Wrong Questions/)).toBe(false);
    expect(has(/Marked For Review/)).toBe(false);
    expect(has(/Recently Attempted/)).toBe(false);
  });
  it('Bookmarked still works: its empty state is shown', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: /^Bookmarked/ }));
    expect(await screen.findByText('No bookmarked questions yet')).toBeTruthy();
  });
});

describe('what the old tabs offered now lives on the Review list', () => {
  const legacyWrong = { id: 'w1', questionId: 1, question: 'An old wrong question?', options: ['a', 'b'], correctAnswer: 'a', explanation: 'because', dateKey: '2026-11-01', displayDate: '1 Nov', fileName: 'x.json', wrongCount: 2, consecutiveCorrect: 0, status: 'learning' as const, lastAttemptAt: 5, addedAt: 1 };
  const plainMark = { id: 'm1', questionId: 2, question: 'A question I flagged?', options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceFileName: 'x.json', sourceDate: 'd', markedAt: 9, purpose: 'review' as const };

  it('an older wrong question can be removed from the wrong list, right from the Review list', async () => {
    await wrongQuestionsDB.upsert(legacyWrong);
    mount();
    const row = (await screen.findByText('An old wrong question?')).closest('li, div[data-testid]') ?? document.body;
    await userEvent.click(screen.getByText('An old wrong question?'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from wrong questions' }));
    await waitFor(() => expect(screen.queryByText('An old wrong question?')).toBeNull());
    expect((await wrongQuestionsDB.getAll()).find((w) => w.id === 'w1')?.status).not.toBe('learning'); // dismissed, not left behind
    void row;
  });
  it('a plain "mark for review" can be un-marked from the Review list', async () => {
    await markedForReviewDB.upsert(plainMark);
    mount();
    await userEvent.click(await screen.findByText('A question I flagged?'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove mark' }));
    await waitFor(() => expect(screen.queryByText('A question I flagged?')).toBeNull());
    expect(await markedForReviewDB.getAll()).toEqual([]);
  });
});

describe('Closed tests — view only', () => {
  const open = async () => { mount(); await userEvent.click(await screen.findByRole('button', { name: /Closed tests/ })); await screen.findByTestId('archived-panel'); };

  it('says what it is, and that there is nothing yet', async () => {
    await open();
    expect(screen.getByText(/View only\./)).toBeTruthy();
    expect(screen.getByText(/can't be resumed or re-submitted/)).toBeTruthy();
    expect(await screen.findByText(/No closed tests/)).toBeTruthy();
  });

  it('lists closed tests with title, kind, date and progress; opening one shows what was answered and what was correct', async () => {
    await archivedSessionsDB.put(buildArchiveRecord(summary(), session(), Date.UTC(2026, 10, 3)));
    await open();
    const card = await screen.findByTestId('archived-session');
    expect(card.textContent).toMatch(/Quant sectional/);
    expect(card.textContent).toMatch(/Practice \/ Test/);
    expect(card.textContent).toMatch(/5\/6 answered/);
    expect(card.textContent).toMatch(/closed .*Nov.*2026/); // the date, in the person's own locale format
    await userEvent.click(within(card).getByRole('button', { name: /Quant sectional/ }));
    const table = await within(card).findByRole('region', { name: 'Question-wise results' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    const q2 = within(rows[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(q2).toEqual(expect.arrayContaining(['Wrong', 'q2-opt-b', 'q2-opt-a'])); // your answer vs the correct one
  });

  it('is genuinely view-only: no resume, restore, retry or delete control anywhere in the panel', async () => {
    await archivedSessionsDB.put(buildArchiveRecord(summary(), session()));
    await open();
    const card = await screen.findByTestId('archived-session');
    await userEvent.click(within(card).getByRole('button', { name: /Quant sectional/ }));
    await within(card).findByRole('region', { name: 'Question-wise results' });
    const names = within(screen.getByTestId('archived-panel')).getAllByRole('button').map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').toLowerCase());
    for (const word of ['resume', 'restore', 'retry', 'delete', 'remove', 'submit']) expect(names.some((n) => n.includes(word))).toBe(false);
    expect(await archivedSessionsDB.getAll()).toHaveLength(1); // looking changes nothing
  });

  it('shows a closed older-quiz session from its own recorded answers', async () => {
    const legacy = { id: 'lg', date: '2026-11-01', fileName: 'Sports.json', totalQuestions: 2, currentIndex: 0, startTime: 0, totalPausedTime: 0, isCompleted: false, isPaused: false, visitedIndices: [0], attempts: [
      { questionId: 1, question: 'Legacy 1?', options: ['red', 'green'], correctAnswer: 'green', explanation: '', selectedAnswer: 'red', status: 'wrong', timeTaken: 4 },
      { questionId: 2, question: 'Legacy 2?', options: ['red', 'green'], correctAnswer: 'green', explanation: '', selectedAnswer: null, status: 'unanswered', timeTaken: 0 },
    ] } as unknown as QuizSession;
    await archivedSessionsDB.put(buildArchiveRecord(summary({ id: 'lg', kind: 'legacy', title: 'Daily quiz', answered: 1, total: 2 }), legacy));
    await open();
    const card = await screen.findByTestId('archived-session');
    await userEvent.click(within(card).getByRole('button', { name: /Daily quiz/ }));
    const rows = within(await within(card).findByRole('region', { name: 'Question-wise results' })).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent).filter((t) => ['Wrong', 'Skipped'].includes(t ?? '')))).toEqual([['Wrong'], ['Skipped']]);
  });
});
