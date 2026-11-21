// @vitest-environment jsdom
// Every result screen — Practice, Test (sectional, negative marking), Mock and the older quiz engine — shows the SAME
// shared result tables, with the exact numbers of the seeded attempt.
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UniversalResultPage from './UniversalResultPage';
import MockResultPage from './MockResultPage';
import TestResultPage from './TestResultPage';
import TestReviewPage from './TestReviewPage';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useQuizStore } from '../store/quizStore';
import { getDB, mockAttemptsDB } from '../services/db';
import { ledger, legacy, question, questionsById, session } from '../test/resultFixtures';
import type { MockAttemptRecord } from '../types/mockSession';
import type { QuizSession } from '../types';
import type { PracticeSession } from '../types/practiceSession';

vi.mock('../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.map((id) => questionsById.get(id) ?? question('q1')).map((q, i) => ({ ...q, id: ids[i] }))),
}));
vi.mock('../services/mockDefinitionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/mockDefinitionRepository')>()),
  getMockDefinition: vi.fn(async (id: string) => ({ id, title: 'Mock X', examId: 'e', type: 'full-mock', sections: [] })),
}));

const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
const text = (key: string) => screen.getByTestId(`score-${key}`).textContent;

function mount(path: string, element: ReactElement, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
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
  for (const store of ['universalAttempts', 'mockAttempts', 'savedTests', 'wrongQuestions', 'markedForReview', 'bookmarks'] as const) await db.clear(store as never).catch(() => {});
});
afterEach(() => { cleanup(); usePracticeSessionStore.getState().clearSession(); useQuizStore.getState().clearSession(); });

describe('Test result (sectional, negative marking) — /session/result', () => {
  it('shows the scorecard, the section-wise table and the question-wise table with exact numbers', async () => {
    usePracticeSessionStore.setState({ session: session() });
    mount('/session/result', <UniversalResultPage />, '/session/result');
    expect(await screen.findByTestId('table-scorecard')).toBeTruthy();
    expect(text('score')).toBe('5 / 12');
    expect(text('marking')).toBe('+2 correct · −0.5 incorrect');
    expect(text('time')).toBe('06:40 of 10:00');
    expect(bodyRows(screen.getByTestId('table-sections')).map(cells)).toEqual([
      ['Section 1', '3', '3', '2', '1', '0', '3.5 / 6', '66.7%', '02:40 / 05:00'],
      ['Section 2', '3', '2', '1', '1', '1', '1.5 / 6', '50%', '01:45 / 05:00'],
    ]);
    const questions = screen.getByRole('region', { name: 'Question-wise results' });
    expect(bodyRows(questions)).toHaveLength(6);
    expect(cells(bodyRows(questions)[1]).slice(3)).toEqual(['Easy', 'Wrong', 'q2-opt-b', 'q2-opt-a', '100s', '−0.5']);
  });
});

describe('Practice result (no marking scheme, no sections)', () => {
  it('shows "no marking scheme", 1 point per correct, and no section table', async () => {
    const practice = { ...session(), config: { ...session().config, mode: 'practice', marking: undefined, timing: undefined, durationSeconds: undefined, testDefinitionId: undefined } } as PracticeSession;
    usePracticeSessionStore.setState({ session: practice });
    mount('/session/result', <UniversalResultPage />, '/session/result');
    expect(await screen.findByTestId('table-scorecard')).toBeTruthy();
    expect(text('score')).toBe('3 / 6');
    expect(text('marking')).toBe('No marking scheme');
    expect(screen.queryByTestId('table-sections')).toBeNull();
    expect(bodyRows(screen.getByTestId('table-subjects')).map((r) => cells(r)[3])).toEqual(['2', '1']); // correct per subject
  });
});

describe('Test result — earlier attempts of the same test', () => {
  it('compares with the earlier attempt recorded in the ledger', async () => {
    const { universalAttemptsDB } = await import('../services/db');
    await universalAttemptsDB.recordMany(ledger.filter((r) => r.testDefinitionId === 't1'));
    usePracticeSessionStore.setState({ session: session() });
    mount('/session/result', <UniversalResultPage />, '/session/result');
    await screen.findByTestId('table-scorecard');
    await userEvent.click(screen.getByRole('button', { name: /Compared with your earlier attempts/ }));
    expect(bodyRows(screen.getByTestId('table-comparison')).map((r) => cells(r).slice(0, 2).concat(cells(r).slice(2, 5)))).toEqual([
      ['This attempt', expect.any(String), '5 / 12', '60%', '5'],
      ['Attempt 1', expect.any(String), '1.5 / 6', '50%', '2'],
    ]);
  });
});

describe('Mock result — /mock-tests/:mockId/result', () => {
  const attempt = (): MockAttemptRecord => ({
    id: 'a2', mockDefinitionId: 'mx', examId: 'e', type: 'full-mock', title: 'Mock X', status: 'completed', completedAt: 2000, startedAt: 0, lastActiveAt: 0, currentSectionIndex: 0, currentQuestionIndex: 0,
    sections: [
      { sectionId: 's1', title: 'Quant', subjectId: 'mathematics', questionIds: ['q1', 'q2'], marksPerQuestion: 1, negativeMarks: 0.25, durationSeconds: 600, status: 'submitted', locked: true },
      { sectionId: 's2', title: 'English', subjectId: 'english', questionIds: ['q5'], marksPerQuestion: 2, negativeMarks: 0.5, durationSeconds: 300, status: 'submitted', locked: true },
    ],
    states: {
      q1: { questionId: 'q1', sectionId: 's1', selectedAnswer: 'A', isMarkedForReview: false, visited: true, timeSpentSeconds: 30 }, // right
      q2: { questionId: 'q2', sectionId: 's1', selectedAnswer: 'B', isMarkedForReview: false, visited: true, timeSpentSeconds: 40 }, // wrong
      q5: { questionId: 'q5', sectionId: 's2', selectedAnswer: 'A', isMarkedForReview: true, visited: true, timeSpentSeconds: 20 },  // right, marked
    },
  }) as unknown as MockAttemptRecord;

  it('shows each section with its own marking scheme and the question-wise table with section names', async () => {
    await mockAttemptsDB.save(attempt());
    mount('/mock-tests/mx/result/a2', <MockResultPage />, '/mock-tests/:mockId/result/:attemptId');
    expect(await screen.findByTestId('table-scorecard')).toBeTruthy();
    expect(text('marking')).toBe('Set per section'); // the two sections score differently
    expect(text('score')).toBe('2.75 / 4'); // 1 − 0.25 in Quant, +2 in English
    expect(bodyRows(screen.getByTestId('table-sections')).map((r) => cells(r).slice(0, 8))).toEqual([
      ['Quant', '2', '2', '1', '1', '0', '0.75 / 2', '50%'],
      ['English', '1', '1', '1', '0', '0', '2 / 2', '100%'],
    ]);
    const questions = screen.getByRole('region', { name: 'Question-wise results' });
    expect(bodyRows(questions).map((r) => [cells(r)[1], cells(r)[cells(r).length - 1]])).toEqual([['Quant', '+1'], ['Quant', '−0.25'], ['English', '+2']]);
    expect(within(bodyRows(questions)[2]).getByText('Marked')).toBeTruthy();
  });
});

describe('Older quiz engine — test result and review', () => {
  const legacyTest = (): QuizSession => ({ ...legacy(), testMeta: { isTest: true, testType: 'full', examId: 'e', examName: 'Legacy exam', marking: { marksPerCorrect: 2, negativeMarks: 0.5 } } }) as QuizSession;

  it('TestResultPage shows the same shared tables, with the legacy test\'s own marking', async () => {
    useQuizStore.setState({ session: legacyTest() });
    mount('/tests/result', <TestResultPage />, '/tests/result');
    expect(await screen.findByTestId('table-scorecard')).toBeTruthy();
    expect(text('score')).toBe('1.5 / 6'); // 1 correct × 2 − 1 wrong × 0.5
    expect(text('marking')).toBe('+2 correct · −0.5 incorrect');
    expect(bodyRows(screen.getByTestId('table-subjects')).map((r) => cells(r).slice(0, 4))).toEqual([[expect.stringMatching(/Current Affairs/), '3', '2', '1']]);
    const questions = screen.getByRole('region', { name: 'Question-wise results' });
    expect(bodyRows(questions).map((r) => cells(r).slice(-5, -3))).toHaveLength(3);
  });

  it('TestReviewPage lists the question-wise table above the full answer review', async () => {
    useQuizStore.setState({ session: legacyTest() });
    mount('/tests/result/review', <TestReviewPage />, '/tests/result/review');
    const questions = await screen.findByRole('region', { name: 'Question-wise results' });
    expect(bodyRows(questions)).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Wrong (1)' }));
    expect(bodyRows(questions)).toHaveLength(1);
  });
});
