// @vitest-environment jsdom
// Mock test screen: options come on screen in a fresh random order, the badge shows the ON-SCREEN position
// (not the stored option id), and the answer is still stored by option id.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MockTestShellPage from './MockTestShellPage';
import { useMockSessionStore } from '../store/mockSessionStore';
import type { MockSession } from '../types/mockSession';
import type { UniversalQuestion } from '../types/universalQuestion';

const IDS = ['m1', 'm2', 'm3'];
const question = (id: string): UniversalQuestion => ({
  id, examIds: ['ssc-chsl'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: `Mock question ${id}`, difficulty: 'easy',
  options: [{ id: 'A', text: `${id} alpha` }, { id: 'B', text: `${id} beta` }, { id: 'C', text: `${id} gamma` }, { id: 'D', text: `${id} delta` }], correctAnswer: 'B', explanation: `Because ${id}`,
});
/** Presses a key on the window AFTER React has attached its listeners — under load the passive effect that adds the keyboard handler can lag a render behind the first paint. */
const pressKey = async (key: string) => { await act(async () => {}); fireEvent.keyDown(window, { key }); };

vi.mock('../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.map(question)),
}));

function seedSession(): MockSession {
  const now = Date.now();
  return {
    id: 'mock-session-1', mockDefinitionId: 'mock-x', examId: 'ssc-chsl', type: 'full-mock', title: 'Option order mock', status: 'active',
    sections: [{ sectionId: 's1', title: 'Quant', subjectId: 'mathematics', questionIds: IDS, marksPerQuestion: 1, negativeMarks: 0.25, durationSeconds: 3600, status: 'active', startedAt: now, endAt: now + 3600_000, locked: false }],
    currentSectionIndex: 0, currentQuestionIndex: 0,
    states: Object.fromEntries(IDS.map((id) => [id, { questionId: id, sectionId: 's1', selectedAnswer: null, isMarkedForReview: false, visited: false, timeSpentSeconds: 0 }])),
    startedAt: now, lastActiveAt: now,
  } as MockSession;
}

let rnd = 0;
let spy: { mockRestore: () => void } | undefined;
const group = () => screen.getByRole('group', { name: 'Answer options' });
const onScreen = () => within(group()).getAllByRole('button').map((b) => b.textContent!);
const selected = (qid: string) => useMockSessionStore.getState().session!.states[qid].selectedAnswer;

function mount() {
  return render(
    <MemoryRouter initialEntries={['/mock-tests/mock-x/test']}>
      <Routes>
        <Route path="/mock-tests/:mockId/test" element={<MockTestShellPage />} />
        <Route path="*" element={<div>ELSEWHERE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rnd = 0; // [alpha, beta, gamma, delta] → [beta, gamma, delta, alpha]
  spy = vi.spyOn(Math, 'random').mockImplementation(() => rnd);
  useMockSessionStore.getState().loadSession(seedSession());
});
afterEach(() => { cleanup(); spy?.mockRestore(); spy = undefined; useMockSessionStore.setState({ session: null }); });

describe('Mock test screen option order', () => {
  it('shows the options in a random order, with badges A–D by on-screen position', async () => {
    mount();
    await screen.findByText('Mock question m1');
    const texts = onScreen();
    expect(texts[0]).toMatch(/^A.*m1 beta/); // not "B": the badge is the position, the stored id is not shown
    expect(texts[1]).toMatch(/^B.*m1 gamma/);
    expect(texts[2]).toMatch(/^C.*m1 delta/);
    expect(texts[3]).toMatch(/^D.*m1 alpha/);
  });

  it('stores the option id of the tapped option, wherever it is shown', async () => {
    mount();
    await screen.findByText('Mock question m1');
    await userEvent.click(within(group()).getAllByRole('button')[3]); // shown last = alpha = id A
    expect(selected('m1')).toBe('A');
    await userEvent.click(within(group()).getAllByRole('button')[0]); // shown first = beta = id B
    expect(selected('m1')).toBe('B');
  });

  it('does not move the options while the question is on screen; a revisit shows a fresh order with the answer still selected', async () => {
    mount();
    await screen.findByText('Mock question m1');
    const first = onScreen();
    rnd = 0.99;
    await userEvent.click(within(group()).getAllByRole('button')[2]); // delta = id D
    expect(onScreen()).toEqual(first);
    await pressKey('ArrowRight');
    await screen.findByText('Mock question m2');
    await pressKey('ArrowLeft');
    await screen.findByText('Mock question m1');
    expect(onScreen()[0]).toMatch(/^A.*m1 alpha/); // different order than the first visit
    expect(within(group()).getByRole('button', { name: /m1 delta/ }).getAttribute('aria-pressed')).toBe('true');
    expect(selected('m1')).toBe('D');
  });
});

// ─── Multi-purpose marking on the Mock screen (rendered) ─────────────────────
describe('Mock test screen: marking with several purposes', () => {
  const marks = async () => (await import('../services/db')).markedForReviewDB.getAll();
  beforeEach(async () => { await (await import('../services/db')).markedForReviewDB.deleteAll(); await (await import('../store/markedReviewStore')).useMarkedReviewStore.getState().load(); });

  it('the sheet offers the four purposes; one question can carry several and is saved as ONE record', async () => {
    mount();
    await screen.findByText('Mock question m1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(4);
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await waitFor(async () => expect(await marks()).toHaveLength(1));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Further Practice/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['doubtful', 'practice', 'revision']));
    const all = await marks();
    expect(all).toHaveLength(1); // never a duplicate record
    expect(all[0].id).toBe('universal:m1');
    expect(all[0].purpose).toBe('doubtful'); // first of the set, for older code
    expect(within(sheet).getByRole('checkbox', { name: /Revision/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('un-ticking one purpose keeps the others; "Mark for Review" stays inside this test and is not saved; Remove all clears everything', async () => {
    mount();
    await screen.findByText('Mock question m1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['doubtful', 'revision']));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['revision']));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Mark for Review/ }));
    expect(within(sheet).getByRole('checkbox', { name: /Mark for Review/ }).getAttribute('aria-checked')).toBe('true');
    expect((await marks())[0].purposes).toEqual(['revision']); // the in-test mark is not a saved purpose
    expect(useMockSessionStore.getState().session!.states.m1.isMarkedForReview).toBe(true);
    await userEvent.click(within(sheet).getByRole('button', { name: /Remove/ }));
    await waitFor(async () => expect(await marks()).toEqual([]));
    expect(useMockSessionStore.getState().session!.states.m1.isMarkedForReview).toBe(false);
  });

  it('marking one question leaves the others unmarked', async () => {
    mount();
    await screen.findByText('Mock question m1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Mark question 1/ })).getByRole('checkbox', { name: /Revision/ }));
    await waitFor(async () => expect(await marks()).toHaveLength(1));
    const states = useMockSessionStore.getState().session!.states;
    expect(states.m2.isMarkedForReview).toBe(false);
    expect(states.m3.isMarkedForReview).toBe(false);
  });
});
