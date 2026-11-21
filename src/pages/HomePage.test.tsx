// @vitest-environment jsdom
// The redesigned Home: every section renders from real stored data, empty sections offer a useful action,
// the removed widgets stay removed, and the daily goal is entirely the learner's choice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HomePage from './HomePage';
import { getDB, markedForReviewDB, readingProgressDB, universalAttemptsDB, wrongQuestionsDB, type UniversalAttemptRecord } from '../services/db';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { useReaderStore } from '../store/readerStore';
import { useStatisticsStore } from '../store/statsStore';
import { useHistoryStore } from '../store/historyStore';
import { getSubjectsForExam } from '../services/examService';

// The install banner imports Vite's PWA virtual module, which does not exist under vitest.
vi.mock('../components/common/PWAComponents', () => ({ PWAInstallBanner: () => null }));

const SUBJECT = 'mathematics';
const attempt = (i: number, over: Partial<UniversalAttemptRecord> = {}): UniversalAttemptRecord => ({
  id: `a${i}-${over.topicId ?? 'average'}`, universalQuestionId: `uq-${i}`, examId: 'ssc-chsl', subjectId: SUBJECT, topicId: 'average', isCorrect: false, wasAnswered: true,
  timeTaken: 20, attemptedAt: Date.now() - i * 1000, sessionId: 'sess-1', sourceFileName: 'x.json', ...over,
});
/** 12 answered attempts on one topic with 3 correct → 25 %: enough data (≥ 10) to be rated, and Weak. Labelled as a finished test session. */
const weakSession = () => Array.from({ length: 12 }, (_, i) => attempt(i, { isCorrect: i < 3, sessionLabel: 'Average — Test 1', sessionMode: 'test', sessionCompletedAt: Date.now() - 5000 }));
/** Only 4 attempts on another topic: below the sample size, so it is never rated. */
const thinSession = () => Array.from({ length: 4 }, (_, i) => attempt(100 + i, { topicId: 'percentage', sessionId: 'sess-2', isCorrect: false }));

function mount() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<div>ELSEWHERE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
  const db = await getDB();
  for (const store of ['universalAttempts', 'wrongQuestions', 'markedForReview', 'readingProgress', 'dailyGoal', 'savedSessions', 'archivedSessions', 'mockAttempts'] as const) await db.clear(store);
  usePracticeSessionStore.getState().clearSession();
  useDailyGoalStore.setState({ goal: null });
  useReaderStore.setState({ progress: {} });
  useStatisticsStore.setState({ stats: null });
  useHistoryStore.setState({ tests: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); usePracticeSessionStore.getState().clearSession(); });

describe('Home — sections from seeded data', () => {
  it('renders Resume Tests, Favorites, Subjects, Weak topics, Review counts and Recent attempts from stored data', async () => {
    usePracticeSessionStore.getState().startSession({ examId: 'ssc-chsl', subjectIds: [SUBJECT], questionCount: 3, mode: 'test', label: 'Seeded resume test' }, ['q1', 'q2', 'q3'], { route: '/', idx: -1 });
    await universalAttemptsDB.recordMany([...weakSession(), ...thinSession()]);
    await readingProgressDB.toggleFavorite(`chapter::${SUBJECT}::average`);
    await wrongQuestionsDB.upsert({ id: 'w1', questionId: 1, question: 'Old wrong?', options: ['a', 'b'], correctAnswer: 'a', explanation: '', dateKey: '2026-11-01', displayDate: '1 Nov', fileName: 'x.json', wrongCount: 2, consecutiveCorrect: 0, status: 'learning', lastAttemptAt: 1, addedAt: 1 });
    await markedForReviewDB.upsert({ id: 'm1', questionId: 2, question: 'Doubt?', options: ['a', 'b'], correctAnswer: 'a', explanation: '', sourceFileName: 'x.json', sourceDate: '2026-11-01', markedAt: 1, purpose: 'doubtful', purposes: ['doubtful'] });
    mount();

    // Header: greeting, selected exam, streak chip (shown once stats exist)
    expect(await screen.findByText(/Good (Morning|Afternoon|Evening)!/)).toBeTruthy();
    expect(screen.getByText('SSC CHSL')).toBeTruthy();

    // Resume Tests
    expect(await screen.findByText('Seeded resume test')).toBeTruthy();

    // Favorite chapters (cross-subject)
    const fav = await screen.findByRole('region', { name: 'Favorite chapters' });
    expect(await within(fav).findByText(/Mathematics/)).toBeTruthy();

    // Subjects — every subject of the exam, one card each, real accuracy/attempted for the one with attempts
    const subjects = getSubjectsForExam('ssc-chsl');
    expect(subjects.length).toBeGreaterThan(0);
    const grid = await screen.findByRole('region', { name: 'Subjects' });
    for (const s of subjects) expect(await within(grid).findByTestId(`subject-${s.id}`)).toBeTruthy();
    const maths = within(grid).getByTestId(`subject-${SUBJECT}`);
    expect(maths.textContent).toMatch(/Accuracy 19% · 16 attempted/); // 3 correct of 16 answered (12 + 4), rounded

    // Weak topics: the 25 % topic is rated Weak; the 4-attempt topic is not rated
    const weak = await screen.findByRole('region', { name: 'Weak topics' });
    expect(await within(weak).findByText(/Weak · 25%/)).toBeTruthy();
    expect(weak.textContent).not.toMatch(/Weak · 0%/);

    // Review Center counts: 1 wrong (legacy), 1 doubtful
    const review = await screen.findByRole('region', { name: 'Review Center' });
    await waitFor(() => expect(within(review).getByTestId('review-count-doubtful').textContent).toMatch(/1$/));
    expect(within(review).getByTestId('review-count-wrong').textContent).toMatch(/1$/);

    // Recent attempts: the labelled session, with its real accuracy
    const recent = await screen.findByRole('region', { name: 'Recent attempts' });
    expect(await within(recent).findByText('Average — Test 1')).toBeTruthy();
    expect(recent.textContent).toMatch(/25% accuracy/);
  });

  it('is laid out for a phone in the specified order, with a main and a side column from tablet up', async () => {
    mount();
    await screen.findByTestId('home-layout');
    const cards = (testId: string) => Array.from(screen.getByTestId(testId).children) as HTMLElement[];
    const orderOf = (el: HTMLElement) => Number(/(?:^|\s)order-(\d+)(?:\s|$)/.exec(el.className)?.[1] ?? 0);
    const all = [...cards('home-main'), ...cards('home-side')];
    // Resume (1) < Goal (2) < Favorites (3) < Subjects (4) < Quick actions (5) < Weak (6) < Review (7) < Recent (8)
    const find = (testId: string) => all.find((el) => el.querySelector(`[data-testid="${testId}"]`) || el.getAttribute('data-testid') === testId)!;
    expect(orderOf(all[0])).toBe(1); // Resume Tests
    expect(orderOf(find('home-subjects'))).toBe(4);
    expect(orderOf(find('home-quick-actions'))).toBe(5);
    expect(orderOf(find('home-weak-topics'))).toBe(6);
    expect(orderOf(find('home-review-counts'))).toBe(7);
    expect(orderOf(find('home-recent'))).toBe(8);
    expect(orderOf(find('home-favorites'))).toBe(3);
    expect(orderOf(cards('home-side')[0])).toBe(2); // Daily goal
    expect(screen.getByTestId('home-layout').className).toMatch(/\bflex-col\b.*\blg:grid\b.*\blg:grid-cols-3\b/);
    expect(screen.getByTestId('home-main').className).toMatch(/\bcontents\b.*\blg:col-span-2\b/);
    expect(screen.getByTestId('home-side').className).toMatch(/\bcontents\b/);
  });

  it('no longer shows Today Revision or Current Affairs Progress', async () => {
    mount();
    await screen.findByTestId('home-layout');
    await screen.findByRole('region', { name: 'Recent attempts' });
    expect(screen.queryByText(/today.?s revision/i)).toBeNull();
    expect(screen.queryByText(/today revision/i)).toBeNull();
    expect(screen.queryByText(/current affairs progress/i)).toBeNull();
  });

  it('Quick actions: Practice by Topic, Mock Tests, Review Center and Question Bank', async () => {
    mount();
    const quick = await screen.findByRole('region', { name: 'Quick actions' });
    for (const name of [/Practice by Topic/, /Mock Tests/, /Review Center/, /Question Bank/]) expect(within(quick).getByRole('button', { name })).toBeTruthy();
    await userEvent.click(within(quick).getByRole('button', { name: /Question Bank/ }));
    expect(await screen.findByText('ELSEWHERE')).toBeTruthy();
  });
});

describe('Home — empty states give a useful next step', () => {
  it('every data section says what is missing and offers an action', async () => {
    mount();
    const resume = await screen.findByText('No unfinished tests');
    expect(resume).toBeTruthy();
    const fav = await screen.findByRole('region', { name: 'Favorite chapters' });
    expect(await within(fav).findByText(/No favorite chapters yet/)).toBeTruthy();
    expect(within(fav).getByRole('button', { name: /Explore chapters/ })).toBeTruthy();
    const weak = await screen.findByRole('region', { name: 'Weak topics' });
    expect(await within(weak).findByText(/No attempts yet/)).toBeTruthy();
    expect(within(weak).getByRole('button', { name: /Start practising/ })).toBeTruthy();
    const review = await screen.findByRole('region', { name: 'Review Center' });
    expect(await within(review).findByText(/Nothing to review yet/)).toBeTruthy();
    const recent = await screen.findByRole('region', { name: 'Recent attempts' });
    expect(await within(recent).findByText(/No finished attempts yet/)).toBeTruthy();
    expect(within(recent).getByRole('button', { name: /Take a practice test/ })).toBeTruthy();
    const goal = await screen.findByText(/No daily goal set/);
    expect(goal).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set a goal' })).toBeTruthy();
  });

  it('a topic with too few attempts is never rated: Weak topics says more data is needed', async () => {
    await universalAttemptsDB.recordMany(thinSession()); // 4 attempts, all wrong — but below the 10-attempt sample size
    mount();
    const weak = await screen.findByRole('region', { name: 'Weak topics' });
    expect(await within(weak).findByText(/Not enough data yet/)).toBeTruthy();
    expect(weak.textContent).toMatch(/10 answered attempts/);
    expect(weak.textContent).not.toMatch(/Weak · /);
  });
});

describe('Home — error state', () => {
  it('a section that fails to load shows an error with Try again, and the rest of the page still works', async () => {
    const real = universalAttemptsDB.getAll.bind(universalAttemptsDB);
    const spy = vi.spyOn(universalAttemptsDB, 'getAll').mockRejectedValueOnce(new Error('disk unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    // Several sections read the ledger; whichever got the rejection shows an alert, the others still render.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't load this section/);
    expect(await screen.findByRole('region', { name: 'Subjects' })).toBeTruthy();
    spy.mockImplementation(real);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('Home — daily goal is entirely the learner\'s choice', () => {
  it('nothing is pre-set; the learner picks a type and a custom number, can change it, and can clear it', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Set a goal' }));
    const input = await screen.findByLabelText(/Custom target in questions/);
    await userEvent.clear(input);
    await userEvent.type(input, '37');
    await userEvent.click(screen.getByRole('button', { name: 'Save Goal' }));
    expect(await screen.findByText(/0 \/ 37 questions/)).toBeTruthy();
    expect(useDailyGoalStore.getState().goal?.target).toBe(37);

    // Change to Tests with a preset
    await userEvent.click(screen.getByRole('button', { name: 'Change goal' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Tests$/ }));
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Goal' }));
    expect(await screen.findByText(/0 \/ 3 tests/)).toBeTruthy();

    // Clear it
    await userEvent.click(screen.getByRole('button', { name: 'Change goal' }));
    await userEvent.click(await screen.findByRole('button', { name: /Clear goal/ }));
    expect(await screen.findByText(/No daily goal set/)).toBeTruthy();
    expect(useDailyGoalStore.getState().goal?.target).toBe(0);
  });

  it('a cleared goal is never "met" and never builds a streak', async () => {
    await useDailyGoalStore.getState().load();
    expect(useDailyGoalStore.getState().goal?.target).toBe(0); // a new learner starts with no goal
    await useDailyGoalStore.getState().increment(40);
    expect(useDailyGoalStore.getState().isGoalMet()).toBe(false);
    expect(useDailyGoalStore.getState().goal?.streakDays).toBe(0);
    expect(useDailyGoalStore.getState().getProgress()).toBe(0);
  });
});
