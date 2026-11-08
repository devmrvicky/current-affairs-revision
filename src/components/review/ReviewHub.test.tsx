// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReviewCenterPage from '../../pages/ReviewCenterPage';
import { getDB, markedForReviewDB, universalAttemptsDB, wrongQuestionsDB, type UniversalAttemptRecord } from '../../services/db';
import { useQuizStore } from '../../store/quizStore';
import type { MarkedReviewQuestion, WrongQuestion } from '../../types';

const DAY = 86_400_000;
const NOW = Date.now();
const QUESTIONS: Record<string, { subjectId: string; topicId: string; difficulty: string }> = {
  m1: { subjectId: 'mathematics', topicId: 'average', difficulty: 'hard' },
  e1: { subjectId: 'english', topicId: 'idioms', difficulty: 'easy' },
  r1: { subjectId: 'reasoning', topicId: 'seating', difficulty: 'medium' },
  g1: { subjectId: 'general-awareness', topicId: 'polity', difficulty: 'easy' },
};
vi.mock('../../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.filter((id) => QUESTIONS[id]).map((id) => ({
    id, question: `Question ${id}`, options: [{ id: 'A', text: `${id} right` }, { id: 'B', text: `${id} wrong` }], correctAnswer: 'A', explanation: `Because ${id}`, examIds: ['ssc-chsl'], questionType: 'mcq', ...QUESTIONS[id],
  }))),
}));
vi.mock('../../services/monthlyMagazineRepository', async (orig) => ({
  ...(await orig<typeof import('../../services/monthlyMagazineRepository')>()),
  getAllMonthlyMagazineTestPaths: () => new Set(['2025/July/Test 01.json']),
}));

let n = 0;
const attempt = (q: string, correct: boolean, daysAgo: number): UniversalAttemptRecord => {
  n++;
  return { id: `a${n}`, universalQuestionId: q, examId: 'ssc-chsl', subjectId: QUESTIONS[q].subjectId, topicId: QUESTIONS[q].topicId, isCorrect: correct, wasAnswered: true, timeTaken: 12, attemptedAt: NOW - daysAgo * DAY, sessionId: `s${n}`, sourceFileName: `universal-session-s${n}` };
};
const saved = (over: Partial<MarkedReviewQuestion>): MarkedReviewQuestion => ({ id: 'x', questionId: 0, question: 'q', options: ['a', 'b'], correctAnswer: 'a', explanation: 'e', sourceFileName: 'Practice', sourceDate: 'd', markedAt: NOW - 2 * DAY, ...over });
const legacy = (over: Partial<WrongQuestion>): WrongQuestion => ({ id: 'w', questionId: 1, question: 'q', options: ['a', 'b'], correctAnswer: 'a', explanation: 'e', dateKey: '2025-07-01', displayDate: '1 Jul', fileName: '2025/July/Test 01.json', wrongCount: 2, consecutiveCorrect: 0, status: 'learning', lastAttemptAt: NOW - 3 * DAY, addedAt: NOW - 8 * DAY, ...over });

async function seed() {
  await universalAttemptsDB.recordMany([
    attempt('m1', false, 9), attempt('m1', false, 4),     // maths: wrong twice, saved as doubtful + revision
    attempt('e1', false, 3),                              // english: wrong
    attempt('r1', true, 5),                               // reasoning: only ever correct, saved for further practice
    attempt('g1', false, 6),                              // GS: wrong, saved to "mark for review" (older, no purpose)
  ]);
  await markedForReviewDB.upsert(saved({ id: 'universal:m1', universalQuestionId: 'm1', question: 'Question m1', purpose: 'doubtful', purposes: ['doubtful', 'revision'] }));
  await markedForReviewDB.upsert(saved({ id: 'universal:r1', universalQuestionId: 'r1', question: 'Question r1', purpose: 'practice', purposes: ['practice'] }));
  await markedForReviewDB.upsert(saved({ id: 'universal:g1', universalQuestionId: 'g1', question: 'Question g1', purpose: undefined }));
  await markedForReviewDB.upsert(saved({ id: 'jul_saved', question: 'July saved question', sourceFileName: '2025/July/Test 01.json', purpose: 'revision', purposes: ['revision'], markedAt: NOW - 20 * DAY }));
  await wrongQuestionsDB.upsert(legacy({ id: 'jul_wrong', question: 'July wrong question' }));
}
const mount = () => render(<MemoryRouter initialEntries={['/review']}><Routes><Route path="/review" element={<ReviewCenterPage />} /><Route path="/quiz" element={<div>QUIZ SCREEN</div>} /></Routes></MemoryRouter>);
const items = () => screen.getAllByTestId('review-item').map((e) => e.getAttribute('data-key'));
const metric = (name: string) => screen.getByTestId(`metric-${name}`).textContent;

beforeEach(async () => {
  const db = await getDB();
  for (const s of ['universalAttempts', 'markedForReview', 'wrongQuestions'] as const) await db.clear(s as never);
  useQuizStore.getState().clearSession();
  await seed();
});
afterEach(cleanup);

describe('Review Center (universal)', () => {
  it('lists every subject and source in one place, once each, with real metrics', async () => {
    mount();
    await screen.findByTestId('review-hub');
    await waitFor(() => expect(items()).toHaveLength(6));
    expect(items().sort()).toEqual(['t:july saved question', 't:july wrong question', 'u:e1', 'u:g1', 'u:m1', 'u:r1']);
    expect(metric('total-saved-questions')).toBe('6');
    expect(metric('repeated-mistakes')).toBe('2'); // m1 (2 wrong attempts) and the July question (wrongCount 2)
    for (const subject of ['Mathematics', 'English', 'Reasoning']) expect(screen.getByLabelText('Subject-wise distribution').textContent).toContain(subject);
  });

  it('shows all five categories with live counts; a question can sit in several without being duplicated', async () => {
    mount();
    await waitFor(() => expect(items()).toHaveLength(6));
    const tabs = within(screen.getByRole('tablist', { name: 'Review categories' }));
    expect(tabs.getByRole('tab', { name: /^Wrong Questions \(4\)$/ })).toBeTruthy();       // m1, e1, g1, July wrong
    expect(tabs.getByRole('tab', { name: /^Marked for Review \(1\)$/ })).toBeTruthy();     // g1
    expect(tabs.getByRole('tab', { name: /^Doubtful \/ Possibly Incorrect \(1\)$/ })).toBeTruthy(); // m1
    expect(tabs.getByRole('tab', { name: /^Further Practice \(1\)$/ })).toBeTruthy();      // r1
    expect(tabs.getByRole('tab', { name: /^Revision \(2\)$/ })).toBeTruthy();              // m1 + July saved (merged with the July wrong one)
    await userEvent.click(tabs.getByRole('tab', { name: /^Doubtful/ }));
    expect(items()).toEqual(['u:m1']);
    await userEvent.click(tabs.getByRole('tab', { name: /^Revision/ }));
    expect(items()).toHaveLength(2);
    await userEvent.click(tabs.getByRole('tab', { name: /^Wrong Questions/ }));
    expect(items()).toHaveLength(4); // m1 is here too: same record, second category
  });

  it('filters combine and never disagree with the count', async () => {
    mount();
    await waitFor(() => expect(items()).toHaveLength(6));
    await userEvent.selectOptions(screen.getByLabelText('Subject'), 'mathematics');
    expect(items()).toEqual(['u:m1']);
    await userEvent.selectOptions(screen.getByLabelText('Subject'), '');
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'easy');
    expect(items().sort()).toEqual(['u:e1', 'u:g1']);
    await userEvent.selectOptions(screen.getByLabelText('Latest result'), 'unattempted');
    expect(screen.queryAllByTestId('review-item')).toHaveLength(0);
    expect(screen.getByTestId('result-count').textContent).toBe('0 of 6');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await userEvent.click(screen.getByLabelText('Repeated mistakes'));
    expect(items().sort()).toEqual(['t:july wrong question', 'u:m1']);
  });

  it('Monthly Current Affairs: month rows, wrong-from-month, and month-scoped lists', async () => {
    mount();
    const row = await screen.findByTestId('month-row');
    expect(row.textContent).toMatch(/July 2025/);
    expect(row.textContent).toMatch(/2 questions · 1 wrong · 1 saved but not revisited/);
    await userEvent.click(within(row).getByRole('button', { name: 'Wrong' }));
    expect(items().sort()).toEqual(['t:july wrong question']);
    await userEvent.click(screen.getByRole('tab', { name: /^All/ })); // the month stays selected: now all of July's questions
    expect(items().sort()).toEqual(['t:july saved question', 't:july wrong question'].sort());
    await userEvent.click(within(row).getByRole('button', { name: 'July 2025' })); // clicking the active month again clears it
    expect(items()).toHaveLength(6);
  });

  it('Mixed revision — all months builds a test from monthly questions only', async () => {
    await markedForReviewDB.upsert(saved({ id: 'jun_saved', question: 'June saved question', sourceFileName: '2025/June/Test 02.json', purpose: 'doubtful', purposes: ['doubtful'] }));
    vi.mocked((await import('../../services/monthlyMagazineRepository')).getAllMonthlyMagazineTestPaths).mockReturnValue?.(new Set(['2025/July/Test 01.json', '2025/June/Test 02.json']));
    mount();
    await screen.findByTestId('review-hub');
    await userEvent.click(await screen.findByRole('button', { name: /Mixed revision — all months/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate a revision test' });
    expect(within(dialog).getByText(/monthly Current Affairs questions \(all months\)/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start test' }));
    await screen.findByText('QUIZ SCREEN');
    const asked = useQuizStore.getState().session!.attempts.map((a) => a.question);
    expect(asked.every((t) => /^July|^June/.test(t))).toBe(true);
    expect(asked.some((t) => /Question (m1|e1|r1|g1)/.test(t))).toBe(false); // nothing from outside the monthly set
  });

  it('a saved purpose can be removed later; removing the last one removes the saved record, not the wrong-answer history', async () => {
    mount();
    await waitFor(() => expect(items()).toHaveLength(6));
    await userEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: /^Doubtful/ }));
    const row = screen.getByTestId('review-item');
    await userEvent.click(within(row).getByRole('button', { expanded: false }));
    await userEvent.click(within(row).getByRole('button', { name: /Remove Doubtful/ }));
    await waitFor(async () => expect((await markedForReviewDB.getById('universal:m1'))?.purposes).toEqual(['revision']));
    await userEvent.click(await screen.findByRole('tab', { name: /^Revision/ }));
    const again = items().includes('u:m1') ? screen.getAllByTestId('review-item').find((e) => e.getAttribute('data-key') === 'u:m1')! : null;
    expect(again).toBeTruthy();
    await userEvent.click(within(again).getByRole('button', { name: /Remove Revision/ }));
    await waitFor(async () => expect(await markedForReviewDB.getById('universal:m1')).toBeUndefined());
    expect((await universalAttemptsDB.getAll()).filter((a) => a.universalQuestionId === 'm1')).toHaveLength(2); // history intact
    await waitFor(() => expect(screen.getByTestId('metric-total-saved-questions').textContent).toBe('6')); // still listed: it is still wrong
  });

  it('generates a normal test from the current view, leaves every saved record untouched, and starts it in the existing engine', async () => {
    const before = JSON.stringify([await markedForReviewDB.getAll(), await wrongQuestionsDB.getAll(), await universalAttemptsDB.getAll()]);
    mount();
    await waitFor(() => expect(items()).toHaveLength(6));
    await userEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: /^Wrong Questions/ }));
    await userEvent.click(screen.getByRole('button', { name: /Generate test/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate a revision test' });
    expect(within(dialog).getByRole('status').textContent).toMatch(/4 questions will be in this test/);
    await userEvent.click(within(dialog).getByLabelText(/Shuffle questions/)); // off → highest priority first
    await userEvent.click(within(dialog).getByRole('radio', { name: /Test \(answers at the end\)/ }));
    await userEvent.type(within(dialog).getByLabelText('Timer (minutes)'), '15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start test' }));
    await screen.findByText('QUIZ SCREEN');

    const session = useQuizStore.getState().session!;
    expect(session.attempts).toHaveLength(4);
    expect(session.testMeta).toMatchObject({ isTest: true, durationSeconds: 900 });
    expect(session.attempts.find((a) => a.universalId === 'm1')?.subjectId).toBe('mathematics'); // linked back so attempts reach the ledger
    expect(JSON.stringify([await markedForReviewDB.getAll(), await wrongQuestionsDB.getAll(), await universalAttemptsDB.getAll()])).toBe(before);
  });

  it('a practice-mode revision test has no timer; a bad timer value blocks Start', async () => {
    mount();
    await waitFor(() => expect(items()).toHaveLength(6));
    await userEvent.click(screen.getByRole('button', { name: /Generate test/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate a revision test' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Test \(answers at the end\)/ }));
    await userEvent.type(within(dialog).getByLabelText('Timer (minutes)'), '0');
    expect((within(dialog).getByRole('button', { name: 'Start test' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByRole('radio', { name: /Practice/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start test' }));
    await screen.findByText('QUIZ SCREEN');
    expect(useQuizStore.getState().session!.testMeta).toBeUndefined();
  });
});
