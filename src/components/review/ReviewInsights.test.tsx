// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { universalAttemptsDB, markedForReviewDB, getDB, type UniversalAttemptRecord } from '../../services/db';
import { ReviewInsightsPanel } from './ReviewInsightsPanel';
import ReviewCenterPage from '../../pages/ReviewCenterPage';
import { resolveQuestionsByIds } from '../../services/questionRepository';

// Question text lookup would load the whole bank; the ids are what matter here.
vi.mock('../../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, question: `Text of ${id}` }))),
}));

const DAY = 86_400_000;
let n = 0;
function attempt(q: string, correct: boolean, daysAgo: number, over: Partial<UniversalAttemptRecord> = {}): UniversalAttemptRecord {
  n++;
  return { id: `a${n}`, universalQuestionId: q, examId: 'ssc-chsl', subjectId: 'mathematics', topicId: 'average', isCorrect: correct, wasAnswered: true, timeTaken: 15, attemptedAt: Date.now() - daysAgo * DAY, sessionId: `s${n}`, sourceFileName: `universal-session-s${n}`, ...over };
}

beforeEach(async () => {
  const db = await getDB();
  await db.clear('universalAttempts' as never);
  await db.clear('markedForReview' as never);
});
afterEach(cleanup);

describe('Review insights (real stored attempts)', () => {
  it('empty state when there is nothing to analyse', async () => {
    render(<ReviewInsightsPanel />);
    expect(await screen.findByText('No insights yet')).toBeTruthy();
  });

  it('ranks an unresolved repeated mistake first, explains every point, and shows the formula', async () => {
    await universalAttemptsDB.recordMany([attempt('hard', false, 12), attempt('hard', false, 6), attempt('hard', false, 2), attempt('easy', true, 3), attempt('easy', true, 2)]);
    await markedForReviewDB.upsert({ id: 'universal:doubt', questionId: 0, universalQuestionId: 'doubt', question: 'q', options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceFileName: 'x', sourceDate: 'x', markedAt: Date.now() - 5 * DAY, purpose: 'doubtful' });
    render(<ReviewInsightsPanel />);

    const rows = await screen.findAllByTestId('priority-row');
    expect(await within(rows[0]).findByText('Text of hard')).toBeTruthy();
    expect(within(rows[0]).getByText(/Wrong 3 times/)).toBeTruthy();
    expect(within(rows[0]).getByText(/Latest attempt was wrong/)).toBeTruthy();
    expect(rows.some((r) => within(r).queryByText('Text of doubt'))).toBe(true); // a marked-only question still appears (low confidence)
    expect(rows.some((r) => within(r).queryByText('Text of easy'))).toBe(false);  // never wrong → no score at all
    const marked = rows.find((r) => within(r).queryByText('Text of doubt'))!;
    expect(within(marked).getByText(/Limited data/)).toBeTruthy();

    await userEvent.click(screen.getByText('How is this calculated?'));
    expect(screen.getByText(/A question with no attempts and no revision mark gets no score at all/)).toBeTruthy();
  });

  it('says "loading" — never "unavailable" — until the question lookup has finished', async () => {
    let finish: (v: { id: string; question: string }[]) => void = () => undefined;
    vi.mocked(resolveQuestionsByIds).mockImplementationOnce(() => new Promise((res) => { finish = res as typeof finish; }) as ReturnType<typeof resolveQuestionsByIds>);
    await universalAttemptsDB.recordMany([attempt('slow', false, 3)]);
    render(<ReviewInsightsPanel />);
    const row = (await screen.findAllByTestId('priority-row'))[0];
    expect(within(row).getByText('Loading question…')).toBeTruthy();
    expect(within(row).queryByText(/unavailable/)).toBeNull();
    finish([{ id: 'slow', question: 'Now loaded' }]);
    expect(await within(row).findByText('Now loaded')).toBeTruthy();
  });

  it('lists repeated mistakes, and refuses an improvement trend on a small sample', async () => {
    await universalAttemptsDB.recordMany([attempt('q1', false, 9), attempt('q1', false, 5), attempt('q2', true, 4), attempt('q3', true, 3)]);
    render(<ReviewInsightsPanel />);
    const repeated = await screen.findAllByTestId('repeated-row');
    expect(repeated).toHaveLength(1);
    expect(within(repeated[0]).getByText('2× wrong')).toBeTruthy();
    const imp = await screen.findAllByTestId('improvement-row');
    expect(imp[0].getAttribute('data-trend')).toBe('insufficient-data');
    expect(within(imp[0]).getByText(/at least 5/)).toBeTruthy();
  });

  it('shows a real improving topic once both periods have enough answers', async () => {
    const flags = [false, false, false, false, true, true, true, true, true, true];
    await universalAttemptsDB.recordMany(flags.map((f, i) => attempt(`q${i}`, f, 20 - i, { topicId: 'percent' })));
    render(<ReviewInsightsPanel />);
    const imp = (await screen.findAllByTestId('improvement-row')).find((r) => r.getAttribute('data-trend') === 'improving');
    expect(imp).toBeTruthy();
    expect(within(imp!).getByText(/\+\d+/)).toBeTruthy();
  });
});

describe('Review Center → Weak Topics uses the unified, sample-aware analysis', () => {
  it('does not rate a thin topic, rates a well-sampled one, and splits sources', async () => {
    const thin = [attempt('t1', false, 2, { topicId: 'percent' }), attempt('t2', false, 1, { topicId: 'percent' })];
    const rich = Array.from({ length: 14 }, (_, i) => attempt(`r${i}`, i < 4, 14 - i, { topicId: 'average', sourceFileName: i % 2 ? 'mock-session-x' + i : 'universal-session-y' + i }));
    await universalAttemptsDB.recordMany([...thin, ...rich]);
    render(<MemoryRouter><ReviewCenterPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Weak Topics/ }));
    const rows = await screen.findAllByTestId('weak-topic-row');
    await waitFor(() => expect(rows.length).toBeGreaterThanOrEqual(2));
    const byStatus = (s: string) => rows.filter((r) => r.getAttribute('data-status') === s);
    expect(byStatus('Weak')).toHaveLength(1);
    expect(byStatus('Insufficient data')).toHaveLength(1);
    expect(within(byStatus('Insufficient data')[0]).getByText(/needed before this topic is rated/)).toBeTruthy();
    expect(within(byStatus('Weak')[0]).getByText(/Mock tests/)).toBeTruthy(); // source-wise split shown
    expect(rows[0].getAttribute('data-status')).toBe('Weak'); // weak first, unrated last
  });
});
