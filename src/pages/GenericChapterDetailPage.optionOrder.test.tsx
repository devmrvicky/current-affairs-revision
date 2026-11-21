// @vitest-environment jsdom
// Chapter page's inline practice viewer: options come on screen in a fresh random order, the badge shows the
// ON-SCREEN position, and the answer is still judged by option id.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GenericChapterDetailPage from './GenericChapterDetailPage';
import type { UniversalQuestion } from '../types/universalQuestion';

const question = (n: number): UniversalQuestion => ({
  id: `c${n}`, examIds: ['ssc-chsl'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: `Chapter question ${n}`, difficulty: 'easy',
  options: [{ id: 'A', text: `c${n} alpha` }, { id: 'B', text: `c${n} beta` }, { id: 'C', text: `c${n} gamma` }, { id: 'D', text: `c${n} delta` }], correctAnswer: 'B', explanation: `Because c${n}`,
});

vi.mock('../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/questionRepository')>()),
  getQuestionsByExam: vi.fn(async () => [question(1), question(2)]),
}));
vi.mock('../services/universalChapterRepository', async (orig) => ({
  ...(await orig<typeof import('../services/universalChapterRepository')>()),
  getChapter: vi.fn(() => ({ id: 'average', subjectId: 'mathematics', title: 'Average', hasNotes: false, testFileCount: 0, source: 'canonical' })),
  loadUniversalChapterNotes: vi.fn(async () => null),
}));

let rnd = 0;
let spy: { mockRestore: () => void } | undefined;
const optionButtons = () => screen.getAllByRole('button', { name: /c\d (alpha|beta|gamma|delta)/ });
const onScreen = () => optionButtons().map((b) => b.textContent!);

function mount() {
  return render(
    <MemoryRouter initialEntries={['/subjects/mathematics/chapters/average']}>
      <Routes>
        <Route path="/subjects/:subjectId/chapters/:chapterId" element={<GenericChapterDetailPage />} />
        <Route path="*" element={<div>ELSEWHERE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rnd = 0; // [alpha, beta, gamma, delta] → [beta, gamma, delta, alpha]
  spy = vi.spyOn(Math, 'random').mockImplementation(() => rnd);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
});
afterEach(() => { cleanup(); spy?.mockRestore(); spy = undefined; });

describe('Chapter page practice viewer option order', () => {
  it('shows the options in a random order, with badges A–D by on-screen position', async () => {
    mount();
    await screen.findByText('Chapter question 1');
    const texts = onScreen();
    expect(texts.map((t) => t.replace(/^[A-D]/, ''))).toEqual(['c1 beta', 'c1 gamma', 'c1 delta', 'c1 alpha']);
    expect(texts[0]).toMatch(/^A/); // the badge is the position — the stored id "B" is not shown
    expect(texts[3]).toMatch(/^D/);
  });

  it('judges by option id: tapping the correct option (shown first) reveals it as correct and nothing as wrong', async () => {
    mount();
    await screen.findByText('Chapter question 1');
    await userEvent.click(optionButtons()[0]); // beta = id B = correct
    await screen.findByText('Because c1');
    expect(document.querySelector('.lucide-circle-check')).toBeTruthy();
    expect(document.querySelector('.lucide-circle-x')).toBeNull();
  });

  it('a wrong tap shows the correct option and the tapped one as wrong', async () => {
    mount();
    await screen.findByText('Chapter question 1');
    await userEvent.click(optionButtons()[3]); // alpha = id A = wrong
    await screen.findByText('Because c1');
    expect(document.querySelector('.lucide-circle-x')).toBeTruthy();
    expect(document.querySelector('.lucide-circle-check')).toBeTruthy(); // the correct option is revealed too
  });
});
