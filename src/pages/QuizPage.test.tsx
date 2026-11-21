// @vitest-environment jsdom
// Legacy quiz screen: options come on screen in a fresh random order, but the answer is still the option TEXT,
// scoring is unchanged, and the order stored on the attempt (what review screens read) is never touched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuizPage from './QuizPage';
import { useQuizStore } from '../store/quizStore';
import type { DailyQuiz } from '../types';

/** Presses a key on the window AFTER React has attached its listeners — under load the passive effect that adds the keyboard handler can lag a render behind the first paint. */
const pressKey = async (key: string) => { await act(async () => {}); fireEvent.keyDown(window, { key }); };

const quiz: DailyQuiz = {
  date: '2026-11-17',
  questions: [1, 2, 3].map((n) => ({
    id: n, question: `Legacy question ${n}`, options: [`q${n} alpha`, `q${n} beta`, `q${n} gamma`, `q${n} delta`], correctAnswer: `q${n} beta`, explanation: `Because ${n}`,
  })),
} as DailyQuiz;

let rnd = 0.99;
let spy: { mockRestore: () => void } | undefined;
const optionButtons = () => screen.getAllByRole('button', { name: /q\d (alpha|beta|gamma|delta)/ });
const onScreen = () => optionButtons().map((b) => b.textContent!);
const attempt = (i = 0) => useQuizStore.getState().session!.attempts[i];

function mount() {
  return render(
    <MemoryRouter initialEntries={['/quiz']}>
      <Routes>
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/analysis" element={<div>ANALYSIS</div>} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // jsdom has no matchMedia; the page reads it through useIsDesktop. A phone-sized, non-matching stub is enough.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
  rnd = 0.99; // 0.99 leaves an order alone: the store's own once-per-session shuffle keeps the stored order as written
  spy = vi.spyOn(Math, 'random').mockImplementation(() => rnd);
  useQuizStore.getState().clearSession();
  useQuizStore.getState().startSession(quiz, 'legacy.json', undefined, { route: '/', idx: -1 });
  rnd = 0; // from now on the display shuffle gives [beta, gamma, delta, alpha]
});
afterEach(() => { cleanup(); spy?.mockRestore(); spy = undefined; useQuizStore.getState().clearSession(); });

describe('QuizPage (legacy) option order', () => {
  it('shows the options in a random order, lettered by on-screen position', async () => {
    expect(attempt().options).toEqual(['q1 alpha', 'q1 beta', 'q1 gamma', 'q1 delta']); // stored order, as written
    mount();
    await screen.findByText('Legacy question 1');
    const texts = onScreen();
    expect(texts[0]).toMatch(/^A.*q1 beta/);
    expect(texts[1]).toMatch(/^B.*q1 gamma/);
    expect(texts[2]).toMatch(/^C.*q1 delta/);
    expect(texts[3]).toMatch(/^D.*q1 alpha/);
  });

  it('scores by the option tapped, wherever it is shown — and leaves the stored order untouched', async () => {
    mount();
    await screen.findByText('Legacy question 1');
    await userEvent.click(optionButtons()[0]); // shown first = "q1 beta" = the correct answer
    expect(attempt().selectedAnswer).toBe('q1 beta');
    expect(attempt().status).toBe('correct');
    expect(attempt().options).toEqual(['q1 alpha', 'q1 beta', 'q1 gamma', 'q1 delta']);
  });

  it('a wrong tap is recorded as wrong', async () => {
    mount();
    await screen.findByText('Legacy question 1');
    await userEvent.click(optionButtons()[3]); // shown last = "q1 alpha"
    expect(attempt().selectedAnswer).toBe('q1 alpha');
    expect(attempt().status).toBe('wrong');
  });

  it('keeps the order while the question stays on screen, and re-shuffles when it comes back', async () => {
    mount();
    await screen.findByText('Legacy question 1');
    const first = onScreen();
    rnd = 0.99;
    await userEvent.click(optionButtons()[1]); // answering must not move anything
    expect(onScreen()).toEqual(first);
    await pressKey('ArrowRight');
    await screen.findByText('Legacy question 2');
    await pressKey('ArrowLeft');
    await screen.findByText('Legacy question 1');
    expect(onScreen()[0]).toMatch(/^A.*q1 alpha/); // a different order than the first visit (random is now 0.99)
    expect(attempt().selectedAnswer).toBe('q1 gamma'); // the answer given on the first visit is still recorded
  });
});

// ─── Multi-purpose marking on the older quiz screen (rendered) ───────────────
describe('QuizPage (legacy): marking with several purposes', () => {
  const marks = async () => (await import('../services/db')).markedForReviewDB.getAll();
  beforeEach(async () => { await (await import('../services/db')).markedForReviewDB.deleteAll(); await (await import('../store/markedReviewStore')).useMarkedReviewStore.getState().load(); });

  it('the sheet offers the four purposes; one question can carry several and is saved as ONE record', async () => {
    mount();
    await screen.findByText('Legacy question 1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(4);
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await waitFor(async () => expect(await marks()).toHaveLength(1));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Further Practice/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['doubtful', 'practice', 'revision']));
    expect(await marks()).toHaveLength(1); // never a duplicate record
    expect((await marks())[0].purpose).toBe('doubtful'); // first of the set, for older code
    expect(attempt().markPurpose).toBe('doubtful'); // and the attempt itself carries the mark (first of the set)
    expect(within(sheet).getByRole('checkbox', { name: /Doubtful/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('un-ticking keeps the other purposes; "Mark for Review" stays in this test and is not saved; Remove all clears the record', async () => {
    mount();
    await screen.findByText('Legacy question 1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['doubtful', 'revision']));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['revision']));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Mark for Review/ }));
    expect((await marks())[0].purposes).toEqual(['revision']); // the in-test mark is not a saved purpose
    expect(attempt().markedForReview).toBe(true);
    await userEvent.click(within(sheet).getByRole('button', { name: /Remove/ }));
    await waitFor(async () => expect(await marks()).toEqual([]));
    expect(attempt().markedForReview).toBe(false);
  });

  it('marking question 1 leaves question 2 unmarked', async () => {
    mount();
    await screen.findByText('Legacy question 1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Mark question 1/ })).getByRole('checkbox', { name: /Revision/ }));
    await waitFor(async () => expect(await marks()).toHaveLength(1));
    expect(attempt(1).markedForReview).toBeFalsy();
    expect(attempt(1).markPurpose).toBeUndefined();
  });
});
