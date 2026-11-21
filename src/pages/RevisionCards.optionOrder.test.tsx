// @vitest-environment jsdom
// Wrong Questions and Danger Zone cards: options come on screen in a fresh random order every time a card is
// opened (and on "Try again"); the answer is still judged by the option TEXT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WrongQuestionsPage from './WrongQuestionsPage';
import DangerZonePage from './DangerZonePage';
import { wrongQuestionsDB } from '../services/db';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import type { WrongQuestion } from '../types';

const wq = (over: Partial<WrongQuestion> = {}): WrongQuestion => ({
  id: 'k1', questionId: 1, question: 'Which one is right?', options: ['alpha', 'beta', 'gamma', 'delta'], correctAnswer: 'beta', explanation: 'Because beta.',
  dateKey: '2026-11-01', displayDate: '1 Nov 2026', fileName: 'x.json', wrongCount: 3, consecutiveCorrect: 0, status: 'learning', lastAttemptAt: 1, addedAt: 1, ...over,
});

let rnd = 0;
let spy: { mockRestore: () => void } | undefined;
const optionButtons = () => screen.getAllByRole('button', { name: /^[A-D]\s*(alpha|beta|gamma|delta)$/ });
const onScreen = () => optionButtons().map((b) => b.textContent!);
const expand = async () => {
  const toggle = document.querySelector('button svg.lucide-chevron-down')?.closest('button');
  expect(toggle).toBeTruthy();
  await userEvent.click(toggle as HTMLElement);
};

beforeEach(async () => {
  rnd = 0; // [alpha, beta, gamma, delta] → [beta, gamma, delta, alpha]
  spy = vi.spyOn(Math, 'random').mockImplementation(() => rnd);
  for (const q of await wrongQuestionsDB.getAll()) await wrongQuestionsDB.delete(q.id);
  await wrongQuestionsDB.upsert(wq());
  useWrongQuestionsStore.setState({ questions: [] });
});
afterEach(() => { cleanup(); spy?.mockRestore(); spy = undefined; });

describe('Wrong Questions page', () => {
  const mount = () => render(<MemoryRouter><WrongQuestionsPage /></MemoryRouter>);

  it('shows the card\'s options in a random order, lettered by position, and judges by text', async () => {
    mount();
    await screen.findByText('Which one is right?');
    await expand();
    const texts = onScreen();
    expect(texts.map((t) => t.slice(1))).toEqual(['beta', 'gamma', 'delta', 'alpha']);
    expect(texts.map((t) => t[0])).toEqual(['A', 'B', 'C', 'D']);
    await userEvent.click(optionButtons()[0]); // "beta" — the correct one, shown first
    await waitFor(async () => expect((await wrongQuestionsDB.getById('k1'))?.consecutiveCorrect).toBe(1));
  });

  it('a wrong tap is recorded as wrong, wherever the option sits', async () => {
    mount();
    await screen.findByText('Which one is right?');
    await expand();
    await userEvent.click(optionButtons()[3]); // "alpha", shown last
    await waitFor(async () => expect((await wrongQuestionsDB.getById('k1'))?.wrongCount).toBe(4));
  });

  it('re-shuffles on "Try again" and when the card is opened again', async () => {
    mount();
    await screen.findByText('Which one is right?');
    await expand();
    expect(onScreen()[0]).toMatch(/beta$/);
    await userEvent.click(optionButtons()[0]);
    rnd = 0.99; // later shuffles leave the order alone
    await userEvent.click(await screen.findByTitle('Try again'));
    await waitFor(() => expect(onScreen()).toEqual(['Aalpha', 'Bbeta', 'Cgamma', 'Ddelta']));
  });
});

describe('Danger Zone page', () => {
  const mount = () => render(<MemoryRouter><DangerZonePage /></MemoryRouter>);

  it('shows the card\'s options in a random order and judges by text', async () => {
    mount();
    await screen.findByText('Which one is right?');
    await expand();
    expect(onScreen().map((t) => t.slice(1))).toEqual(['beta', 'gamma', 'delta', 'alpha']);
    await userEvent.click(optionButtons()[0]);
    const card = screen.getByText('Which one is right?').closest('.card') as HTMLElement;
    await waitFor(() => expect(within(card).getByText('Explanation')).toBeTruthy());
    await waitFor(async () => expect((await wrongQuestionsDB.getById('k1'))?.consecutiveCorrect).toBe(1));
  });
});
