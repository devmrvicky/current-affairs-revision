// @vitest-environment jsdom
// ← Back keeps the session in Resume Tests; ✕ Close asks, then archives it (never hard-deletes). On every session screen.
import { useEffect, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import UniversalSessionPage from './UniversalSessionPage';
import MockTestShellPage from './MockTestShellPage';
import QuizPage from './QuizPage';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useMockSessionStore } from '../store/mockSessionStore';
import { useQuizStore } from '../store/quizStore';
import { archivedSessionsDB, getDB } from '../services/db';
import { sessionRegistry } from '../services/sessionRegistry';
import { listResumableSessions } from '../services/sessionManager';
import { suspendPractice } from '../services/sessionLifecycle';
import type { PracticeConfiguration } from '../types/practiceSession';
import type { MockSession } from '../types/mockSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { DailyQuiz } from '../types';

const q = (id: string, text: string): UniversalQuestion => ({
  id, examIds: ['ssc-chsl'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: text, difficulty: 'easy',
  options: ['alpha', 'beta', 'gamma', 'delta'].map((t, i) => ({ id: 'ABCD'[i], text: `${id} ${t}` })), correctAnswer: 'B', explanation: `Because ${id}`,
});
vi.mock('../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.map((id) => q(id, id.startsWith('m') ? `Mock question ${id}` : `Question text ${id}`))),
}));

const U_IDS = ['q1', 'q2', 'q3'];
const uConfig = (mode: 'test' | 'practice'): PracticeConfiguration => ({ examId: 'ssc-chsl', subjectIds: ['mathematics'], questionCount: 3, mode, label: `Exit ${mode}` });
const mockSession = (): MockSession => {
  const now = Date.now();
  return {
    id: 'mock-exit-1', mockDefinitionId: 'mock-x', examId: 'ssc-chsl', type: 'full-mock', title: 'Exit mock', status: 'active',
    sections: [{ sectionId: 's1', title: 'Quant', subjectId: 'mathematics', questionIds: ['m1', 'm2'], marksPerQuestion: 1, negativeMarks: 0.25, durationSeconds: 3600, status: 'active', startedAt: now, endAt: now + 3600_000, locked: false }],
    currentSectionIndex: 0, currentQuestionIndex: 0,
    states: Object.fromEntries(['m1', 'm2'].map((id) => [id, { questionId: id, sectionId: 's1', selectedAnswer: null, isMarkedForReview: false, visited: false, timeSpentSeconds: 0 }])),
    startedAt: now, lastActiveAt: now, returnRoute: '/', returnHistoryIdx: -1,
  } as MockSession;
};
const quiz = { date: '2026-11-17', questions: [1, 2].map((n) => ({ id: n, question: `Legacy question ${n}`, options: [`q${n} alpha`, `q${n} beta`, `q${n} gamma`, `q${n} delta`], correctAnswer: `q${n} beta`, explanation: 'x' })) } as DailyQuiz;

interface Scenario {
  name: string; entry: string; path: string; element: ReactElement; ready: string; answerName: RegExp;
  start: () => void; id: () => string | undefined; answers: () => unknown; clear: () => void; suspended: () => boolean;
}
const scenarios: Scenario[] = (['test', 'practice'] as const).map((mode) => ({
  name: `Universal ${mode}`, entry: '/page', path: '/page', element: <UniversalSessionPage />, ready: 'Question text q1', answerName: /q1 beta/,
  start: () => { usePracticeSessionStore.getState().clearSession(); usePracticeSessionStore.getState().startSession(uConfig(mode), U_IDS, { route: '/', idx: -1 }); },
  id: () => usePracticeSessionStore.getState().session?.id,
  answers: () => usePracticeSessionStore.getState().session?.states.map((s) => s.selectedAnswer),
  clear: () => usePracticeSessionStore.getState().clearSession(),
  suspended: () => !!usePracticeSessionStore.getState().session?.suspendedAt,
})).concat([
  {
    name: 'Mock', entry: '/mock-tests/mock-x/test', path: '/mock-tests/:mockId/test', element: <MockTestShellPage />, ready: 'Mock question m1', answerName: /m1 beta/,
    start: () => { useMockSessionStore.getState().clearSession(); useMockSessionStore.getState().loadSession(mockSession()); },
    id: () => useMockSessionStore.getState().session?.id,
    answers: () => Object.values(useMockSessionStore.getState().session?.states ?? {}).map((s) => s.selectedAnswer),
    clear: () => useMockSessionStore.getState().clearSession(),
    suspended: () => !!useMockSessionStore.getState().session?.suspendedAt,
  },
  {
    name: 'Legacy quiz', entry: '/page', path: '/page', element: <QuizPage />, ready: 'Legacy question 1', answerName: /q1 beta/,
    start: () => { useQuizStore.getState().clearSession(); useQuizStore.getState().startSession(quiz, 'legacy.json', undefined, { route: '/', idx: -1 }); },
    id: () => useQuizStore.getState().session?.id,
    answers: () => useQuizStore.getState().session?.attempts.map((a) => a.selectedAnswer),
    clear: () => useQuizStore.getState().clearSession(),
    // The legacy page pauses itself while the answer sheet is open; a paused clock is already stopped, so either marker counts.
    suspended: () => { const x = useQuizStore.getState().session; return !!(x?.suspendedAt || x?.pausedAt); },
  },
]);

const nav: { go?: ReturnType<typeof useNavigate> } = {};
function Probe() { const n = useNavigate(); useEffect(() => { nav.go = n; }); return null; }
function mount(s: Scenario) {
  return render(
    <MemoryRouter initialEntries={['/', s.entry]} initialIndex={1}>
      <Routes>
        <Route path={s.path} element={s.element} />
        <Route path="/" element={<div>HOME</div>} />
        <Route path="*" element={<div>ELSEWHERE</div>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}
async function clearStores() {
  const db = await getDB();
  await db.clear('archivedSessions');
  await db.clear('savedSessions');
}

beforeEach(async () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
  await clearStores();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); for (const s of scenarios) s.clear(); });

describe.each(scenarios)('$name — ← Back and ✕ Close', (s) => {
  it('the header has two distinct, accessible, 44 px controls with different icons', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    const back = screen.getByRole('button', { name: 'Back — progress is saved' });
    const close = screen.getByRole('button', { name: 'Close test — archive and remove from Resume' });
    expect(back).not.toBe(close);
    for (const b of [back, close]) expect(b.className).toMatch(/\bw-11\b.*\bh-11\b/); // 44 px
    expect(back.querySelector('.lucide-arrow-left')).toBeTruthy();
    expect(close.querySelector('.lucide-x')).toBeTruthy();
    expect(back.querySelector('.lucide-x')).toBeNull();
    expect(close.querySelector('.lucide-arrow-left')).toBeNull();
  });

  it('Back leaves the screen but keeps the session — same answers and position — in Resume Tests; nothing is archived', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    await userEvent.click(screen.getByRole('button', { name: s.answerName }));
    const answersBefore = JSON.stringify(s.answers());
    const id = s.id()!;
    await userEvent.click(screen.getByTestId('test-back'));
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(s.id()).toBe(id);
    expect(JSON.stringify(s.answers())).toBe(answersBefore);
    expect(s.suspended()).toBe(true); // the clock stopped
    expect((await listResumableSessions()).map((x) => x.id)).toContain(id);
    expect(await archivedSessionsDB.getAll()).toHaveLength(0);
  });

  it('the browser Back button behaves the same way: the session stays resumable, nothing is archived', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    await userEvent.click(screen.getByRole('button', { name: s.answerName }));
    const id = s.id()!;
    act(() => { nav.go!(-1); });
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(s.id()).toBe(id);
    expect(s.suspended()).toBe(true);
    expect((await listResumableSessions()).map((x) => x.id)).toContain(id);
    expect(await archivedSessionsDB.getAll()).toHaveLength(0);
  });

  it('✕ asks first; Cancel changes nothing', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    const id = s.id()!;
    await userEvent.click(screen.getByTestId('test-close'));
    expect(await screen.findByText('Close this test?')).toBeTruthy();
    expect(screen.getByText(/cannot be resumed\. Your answers are archived, not deleted/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Close this test?')).toBeNull());
    expect(screen.getByText(s.ready)).toBeTruthy(); // still on the test
    expect(s.id()).toBe(id);
    expect(await archivedSessionsDB.getAll()).toHaveLength(0);
    expect((await listResumableSessions()).map((x) => x.id)).toContain(id);
  });

  it('✕ → confirm archives the session (answers kept), removes it from Resume, returns, and never hard-deletes', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    await userEvent.click(screen.getByRole('button', { name: s.answerName }));
    const id = s.id()!;
    const answersBefore = JSON.stringify(s.answers());
    await userEvent.click(screen.getByTestId('test-close'));
    await userEvent.click(await screen.findByRole('button', { name: 'Close test' }));
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(s.id()).toBeUndefined(); // no longer the running session
    expect((await listResumableSessions()).map((x) => x.id)).not.toContain(id);
    const archived = await archivedSessionsDB.getAll();
    expect(archived.map((a) => a.id)).toEqual([id]);
    const payload = archived[0].payload as unknown as { states?: unknown; attempts?: unknown };
    const given = s.name === 'Legacy quiz' ? 'q1 beta' : 'B'; // the answer tapped above
    expect(answersBefore).toContain(given);
    expect(JSON.stringify(payload.states ?? payload.attempts)).toContain(given); // still in the archived record
  });

  it('if archiving fails: an error is shown, the session is kept, and the learner stays on the test', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    const id = s.id()!;
    vi.spyOn(archivedSessionsDB, 'put').mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = vi.spyOn(toast, 'error');
    await userEvent.click(screen.getByTestId('test-close'));
    await userEvent.click(await screen.findByRole('button', { name: 'Close test' }));
    await waitFor(() => expect(err).toHaveBeenCalledWith(expect.stringMatching(/still in Resume Tests/), expect.anything()));
    expect(s.id()).toBe(id);
    expect(screen.getByText(s.ready)).toBeTruthy();
    expect(screen.queryByText('HOME')).toBeNull();
    expect(await archivedSessionsDB.getAll()).toHaveLength(0);
    expect((await listResumableSessions()).map((x) => x.id)).toContain(id);
  });

  it('a double tap on Close → confirm archives exactly once and navigates once', async () => {
    s.start(); mount(s);
    await screen.findByText(s.ready);
    const put = vi.spyOn(archivedSessionsDB, 'put');
    await userEvent.click(screen.getByTestId('test-close'));
    const confirm = await screen.findByRole('button', { name: 'Close test' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(put).toHaveBeenCalledTimes(1);
    expect(await archivedSessionsDB.getAll()).toHaveLength(1);
  });
});

describe('✕ Close leaves other sessions alone', () => {
  it('another parked session stays in Resume Tests; only the closed one is archived', async () => {
    const [uTest] = scenarios;
    // Park a different, unfinished session first.
    usePracticeSessionStore.getState().clearSession();
    usePracticeSessionStore.getState().startSession({ ...uConfig('test'), label: 'Other test' }, ['q1', 'q2'], { route: '/', idx: -1 });
    const other = usePracticeSessionStore.getState().session!;
    usePracticeSessionStore.getState().clearSession();
    await sessionRegistry.parkPractice(suspendPractice(other));

    uTest.start(); mount(uTest);
    await screen.findByText(uTest.ready);
    const id = uTest.id()!;
    await userEvent.click(screen.getByTestId('test-close'));
    await userEvent.click(await screen.findByRole('button', { name: 'Close test' }));
    expect(await screen.findByText('HOME')).toBeTruthy();
    const ids = (await listResumableSessions()).map((x) => x.id);
    expect(ids).toContain(other.id);
    expect(ids).not.toContain(id);
    expect((await archivedSessionsDB.getAll()).map((a) => a.id)).toEqual([id]);
    expect(within(document.body).queryByText('Close this test?')).toBeNull();
  });
});
