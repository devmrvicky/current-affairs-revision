// @vitest-environment jsdom
// Drives the real test screen through the flows in the spec's acceptance list (§17):
// arrow keys, changing an answer in Test mode, Practice staying final, sidebar Submit + confirmation,
// floating buttons, and — for sectional timing — the section lock, "Finish section", and exact restore after an absence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UniversalSessionPage from './UniversalSessionPage';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { resolveTiming } from '../services/sessionTiming';
import type { PracticeConfiguration } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';

const IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
const question = (id: string): UniversalQuestion => ({
  id, examIds: ['ssc-chsl'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: `Question text ${id}`, difficulty: 'easy',
  options: [{ id: 'A', text: `${id} alpha` }, { id: 'B', text: `${id} beta` }, { id: 'C', text: `${id} gamma` }, { id: 'D', text: `${id} delta` }], correctAnswer: 'B', explanation: `Because ${id}`,
});
/** Presses a key on the window AFTER React has attached its listeners — under load the passive effect that adds the keyboard handler can lag a render behind the first paint. */
const pressKey = async (key: string) => { await act(async () => {}); fireEvent.keyDown(window, { key }); };

vi.mock('../services/questionRepository', async (orig) => ({
  ...(await orig<typeof import('../services/questionRepository')>()),
  resolveQuestionsByIds: vi.fn(async (ids: string[]) => ids.map(question)),
}));

const base: PracticeConfiguration = { examId: 'ssc-chsl', subjectIds: ['mathematics'], questionCount: 6, mode: 'test', label: 'Average — Test 1' };

function start(config: PracticeConfiguration, over: { startedAtAgoSeconds?: number } = {}) {
  usePracticeSessionStore.getState().clearSession();
  usePracticeSessionStore.getState().startSession(config, IDS, { route: '/', idx: -1 });
  if (over.startedAtAgoSeconds) {
    const s = usePracticeSessionStore.getState().session!;
    usePracticeSessionStore.setState({ session: { ...s, startedAt: Date.now() - over.startedAtAgoSeconds * 1000 } });
  }
}
function mount() {
  return render(
    <MemoryRouter initialEntries={['/session']}>
      <Routes>
        <Route path="/session" element={<UniversalSessionPage />} />
        <Route path="/session/result" element={<div>RESULT PAGE</div>} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const position = () => screen.getByTestId('question-position').textContent!;
const session = () => usePracticeSessionStore.getState().session!;

beforeEach(() => { usePracticeSessionStore.getState().clearSession(); });
afterEach(cleanup);

describe('Test mode', () => {
  it('arrow keys move between questions; the floating buttons appear only after an option is chosen, then move too', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1', {}, { timeout: 5000 });
    expect(position()).toMatch(/Q1 \/ 6/);
    await pressKey('ArrowRight');
    await screen.findByText('Question text q2', {}, { timeout: 5000 }); // first test in the file runs cold; the exit animation can exceed the default 1 s
    expect(screen.queryByTestId('floating-next')).toBeNull(); // nothing chosen on q2 yet
    await userEvent.click(screen.getByRole('button', { name: /q2 alpha/ }));
    expect(screen.getByTestId('floating-prev')).toBeTruthy();
    expect(screen.getByTestId('floating-next')).toBeTruthy();
    await userEvent.click(screen.getByTestId('floating-next'));
    await screen.findByText('Question text q3', {}, { timeout: 5000 });
    await pressKey('ArrowLeft');
    await screen.findByText('Question text q2', {}, { timeout: 5000 }); // first test in the file runs cold; the exit animation can exceed the default 1 s
  });

  it('Test mode: the floating buttons are hidden before any option is chosen, shown after, and gone again on the next unanswered question', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    expect(screen.queryByTestId('floating-prev')).toBeNull();
    expect(screen.queryByTestId('floating-next')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /q1 gamma/ }));
    expect(screen.getByTestId('floating-prev')).toBeTruthy();
    expect(screen.getByTestId('floating-next')).toBeTruthy();
    await userEvent.click(screen.getByTestId('floating-next'));
    await screen.findByText('Question text q2');
    expect(screen.queryByTestId('floating-prev')).toBeNull(); // q2 has no chosen option
    expect(screen.queryByTestId('floating-next')).toBeNull();
    await pressKey('ArrowLeft');
    await screen.findByText('Question text q1');
    expect(screen.getByTestId('floating-next')).toBeTruthy(); // q1 still has its chosen option
  });

  it('the floating buttons are large, thumb-sized tabs at the vertical centre of the left and right edges', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: /q1 alpha/ }));
    for (const id of ['floating-prev', 'floating-next']) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toMatch(/\babsolute\b/); // an overlay: takes no layout space
      expect(cls).toMatch(/\btop-1\/2\b/);
      expect(cls).toMatch(/-translate-y-1\/2/);
      expect(cls).toMatch(/\bw-10\b.*\bh-20\b/); // 40×80 on phones, larger from md
      expect(cls).toMatch(/(^|\s)opacity-20(\s|$)/); // almost transparent at rest, so the options underneath stay readable
      expect(cls).toMatch(/enabled:hover:opacity-100/); // fully opaque when hovered…
      expect(cls).toMatch(/enabled:active:opacity-100/); // …pressed…
      expect(cls).toMatch(/enabled:focus-visible:opacity-100/); // …or focused
      expect((screen.getByTestId(id) as HTMLElement).style.opacity).toBe(''); // no inline opacity that would defeat those classes
    }
    expect(screen.getByTestId('floating-prev').className).toMatch(/\bleft-0\b/);
    expect(screen.getByTestId('floating-next').className).toMatch(/\bright-0\b/);
  });

  it('the floating buttons overlay the content without changing its spacing (Test: px-3 sm:px-5 lg:px-8)', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    const content = screen.getByTestId('exam-question-area').querySelector('.exam-shell__content > div') as HTMLElement;
    const before = content.className;
    expect(before).toMatch(/\bpx-3\b.*\bsm:px-5\b.*\blg:px-8\b/);
    expect(before).not.toMatch(/px-10|px-14|md:px-16/);
    await userEvent.click(screen.getByRole('button', { name: /q1 alpha/ }));
    expect((screen.getByTestId('exam-question-area').querySelector('.exam-shell__content > div') as HTMLElement).className).toBe(before);
    expect(screen.getByTestId('exam-question-area').contains(screen.getByTestId('floating-next'))).toBe(false); // lives in the overlay layer, not in the content
  });

  it('arrow keys do not fire while typing in a field', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    const input = document.createElement('input'); document.body.appendChild(input); input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(position()).toMatch(/Q1 \/ 6/);
    input.remove();
  });

  it('an answer can be changed before submitting, and correctness is never shown', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: /q1 alpha/ }));
    expect(session().states[0].selectedAnswer).toBe('A');
    await userEvent.click(screen.getByRole('button', { name: /q1 gamma/ }));
    expect(session().states[0].selectedAnswer).toBe('C'); // changed
    expect(screen.queryByText(/Correct|Incorrect|Because q1/)).toBeNull();
    expect(document.querySelector('.reveal-correct, .selected-wrong')).toBeNull();
  });

  it('sidebar Submit Test asks for confirmation with the real counts, and only submits on Confirm', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: /q1 beta/ }));
    const sidebar = screen.getByRole('complementary', { name: 'Question palette' });
    await userEvent.click(within(sidebar).getByRole('button', { name: /Submit Test/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Submit Test?' });
    expect(within(dialog).getByTestId('submit-answered').textContent).toBe('1');
    expect(within(dialog).getByTestId('submit-unanswered').textContent).toBe('5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(session().isCompleted).toBe(false);
    await userEvent.click(within(sidebar).getByRole('button', { name: /Submit Test/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Submit Test?' })).getByRole('button', { name: 'Submit Test' }));
    await screen.findByText('RESULT PAGE');
    expect(session().isCompleted).toBe(true);
  });
});

describe('Practice mode', () => {
  it('an answer is final, feedback shows, and the floating buttons appear only once feedback is on screen', async () => {
    start({ ...base, mode: 'practice' });
    mount();
    await screen.findByText('Question text q1');
    expect(screen.queryByTestId('floating-next')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /q1 alpha/ }));
    expect(await screen.findByText('Incorrect')).toBeTruthy();
    expect(screen.getByTestId('floating-next')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /q1 beta/ })); // already revealed: cannot change
    expect(session().states[0].selectedAnswer).toBe('A');
  });
});

describe('Sectional timing', () => {
  const sectional = () => ({ ...base, ...resolveTiming({ kind: 'sectional', sectionMinutes: [1, 1] }, 6, undefined) } as PracticeConfiguration); // Q1–3, Q4–6, 60 s each

  it('shows the active section clock; the other section is closed in the palette and by the keyboard', async () => {
    start(sectional());
    mount();
    await screen.findByText('Question text q1');
    expect(screen.getByTestId('section-timer').textContent).toMatch(/Section 1 · 1\/2/);
    const sidebar = screen.getByRole('complementary', { name: 'Question palette' });
    const buttons = within(sidebar).getAllByRole('button').filter((b) => /^\d+$/.test(b.textContent ?? ''));
    expect(buttons.map((b) => b.getAttribute('aria-disabled'))).toEqual([null, null, null, 'true', 'true', 'true']);
    await userEvent.click(buttons[4]); // Q5 is locked
    expect(position()).toMatch(/Q1 \/ 6/);
    await pressKey('ArrowLeft');
    expect(position()).toMatch(/Q1 \/ 6/);
    // walk to the end of section 1: the arrow stops there and the button changes
    await pressKey('ArrowRight'); await pressKey('ArrowRight');
    await screen.findByText('Question text q3');
    await pressKey('ArrowRight');
    expect(position()).toMatch(/Q3 \/ 6/);
    expect(screen.getByRole('button', { name: /Finish Section/ })).toBeTruthy();
  });

  it('Finish Section asks first; confirming opens section 2 and closes section 1 for good', async () => {
    start(sectional());
    mount();
    await screen.findByText('Question text q1');
    await act(async () => { usePracticeSessionStore.getState().goToQuestion(2); });
    await userEvent.click(await screen.findByRole('button', { name: /Finish Section/ }));
    const dialog = await screen.findByRole('alertdialog', { name: /Finish Section 1\?/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(session().sectionStarts).toEqual([0]);
    await userEvent.click(screen.getByRole('button', { name: /Finish Section/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: /Finish Section 1\?/ })).getByRole('button', { name: 'Finish section' }));
    await waitFor(() => expect(position()).toMatch(/Q4 \/ 6/));
    expect(session().sectionStarts).toHaveLength(2);
    expect(screen.getByTestId('section-timer').textContent).toMatch(/Section 2 · 2\/2/);
    await pressKey('ArrowLeft'); // can't go back into section 1
    expect(position()).toMatch(/Q4 \/ 6/);
    expect(screen.queryByRole('button', { name: /Finish Section/ })).toBeNull(); // last section: Next → Submit flow
  });

  it('after an absence longer than section 1, the learner comes back in section 2 with the right time left (refresh-safe)', async () => {
    start(sectional(), { startedAtAgoSeconds: 80 }); // section 1 (60 s) ran out 20 s ago
    mount();
    await waitFor(() => expect(position()).toMatch(/Q4 \/ 6/));
    expect(session().sectionStarts).toEqual([0, 60]);
    const left = screen.getByTestId('section-timer').getAttribute('aria-label')!;
    expect(left).toMatch(/Section 2 of 2: 00:(39|40|41) left/); // 60 − 20 s
    // a "refresh": unmount and mount again from the persisted session — same section, same clock
    cleanup();
    mount();
    await waitFor(() => expect(position()).toMatch(/Q4 \/ 6/));
    expect(session().sectionStarts).toEqual([0, 60]);
  });

  it('when the last section runs out the test is submitted by itself', async () => {
    start(sectional(), { startedAtAgoSeconds: 200 }); // 120 s total, long gone
    mount();
    await screen.findByText('RESULT PAGE');
    expect(session().isCompleted).toBe(true);
  });

  it('overall and default timing are untouched: no section clock, free navigation', async () => {
    start({ ...base, ...resolveTiming({ kind: 'overall', minutes: 10 }, 6, undefined) } as PracticeConfiguration);
    mount();
    await screen.findByText('Question text q1');
    expect(screen.queryByTestId('section-timer')).toBeNull();
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Question palette' })).getByRole('button', { name: '6' }));
    await screen.findByText('Question text q6');
  });
});

describe('Marking with purposes (spec §7)', () => {
  const marks = async () => (await (await import('../services/db')).markedForReviewDB.getAll());

  beforeEach(async () => { await (await import('../services/db')).markedForReviewDB.deleteAll(); await (await import('../store/markedReviewStore')).useMarkedReviewStore.getState().load(); });

  it('opens a purpose sheet; one question can carry several purposes but is saved as ONE record', async () => {
    start({ ...base, mode: 'practice' });
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(4); // Doubtful, Further Practice, Revision, Mark for Review
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await waitFor(async () => expect(await marks()).toHaveLength(1));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Further Practice/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['doubtful', 'practice', 'revision']));
    const all = await marks();
    expect(all).toHaveLength(1);                       // never a duplicate record
    expect(all[0].id).toBe('universal:q1');
    expect(all[0].purpose).toBe('doubtful');           // first of the set, for older code
    expect(within(sheet).getByRole('checkbox', { name: /Doubtful/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('a purpose can be changed or removed later; removing the last one removes the saved question', async () => {
    start({ ...base, mode: 'practice' });
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ }));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['doubtful', 'revision']));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Doubtful/ })); // un-tick one
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['revision']));
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Revision/ })); // un-tick the last
    await waitFor(async () => expect(await marks()).toHaveLength(0));
  });

  it('Mark for Review stays in this test (not saved), alongside saved purposes; "Remove all" clears both', async () => {
    start({ ...base, mode: 'test' });
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    const sheet = await screen.findByRole('dialog', { name: /Mark question 1/ });
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Mark for Review/ }));
    expect(session().states[0].isMarkedForReview).toBe(true);
    expect(await marks()).toHaveLength(0);              // in-test only
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Further Practice/ }));
    await waitFor(async () => expect((await marks())[0].purposes).toEqual(['practice']));
    expect(session().states[0].isMarkedForReview).toBe(true);  // both are true at once
    expect(session().states[0].markPurpose).toBe('practice');
    await userEvent.click(within(sheet).getByRole('button', { name: /Remove all/ }));
    await waitFor(async () => expect(await marks()).toHaveLength(0));
    expect(session().states[0].isMarkedForReview).toBe(false);
    expect(session().states[0].markPurpose).toBeUndefined();
  });

  it('shows the purpose in the question palette', async () => {
    start({ ...base, mode: 'test' });
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark this question' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Mark question 1/ })).getByRole('checkbox', { name: /Doubtful/ }));
    const palette = screen.getByRole('complementary', { name: 'Question palette' });
    await waitFor(() => expect(within(palette).getByRole('button', { name: '1' }).textContent).toMatch(/\?/));
  });
});

describe('Option order', () => {
  // Fisher–Yates with Math.random() === 0 turns [alpha, beta, gamma, delta] into [beta, gamma, delta, alpha];
  // with 0.99 it leaves the order alone. `rnd` lets a test change that between visits.
  let rnd = 0;
  let spy: { mockRestore: () => void } | undefined;
  beforeEach(() => { rnd = 0; spy = vi.spyOn(Math, 'random').mockImplementation(() => rnd); });
  afterEach(() => { spy?.mockRestore(); spy = undefined; });

  const group = () => screen.getByRole('group', { name: 'Answer options' });
  const onScreen = () => within(group()).getAllByRole('button').map((b) => b.textContent!);

  it('shows the options in a random order, lettered by on-screen position (not the stored one)', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    const texts = onScreen();
    expect(texts).toHaveLength(4);
    expect(texts[0]).toMatch(/^A.*q1 beta/);
    expect(texts[1]).toMatch(/^B.*q1 gamma/);
    expect(texts[2]).toMatch(/^C.*q1 delta/);
    expect(texts[3]).toMatch(/^D.*q1 alpha/);
  });

  it('records and scores by option id, whatever position it is shown at (Practice)', async () => {
    start({ ...base, mode: 'practice' });
    mount();
    await screen.findByText('Question text q1');
    // "beta" (id B, the correct one) is shown FIRST, "alpha" (id A) LAST.
    await userEvent.click(within(group()).getAllByRole('button')[0]);
    expect(session().states[0].selectedAnswer).toBe('B');
    expect(await screen.findByText('Correct')).toBeTruthy();
  });

  it('records the id of the option tapped, not its position (Test)', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    await userEvent.click(within(group()).getAllByRole('button')[3]); // shown last = alpha = id A
    expect(session().states[0].selectedAnswer).toBe('A');
  });

  it('does not move the options while the question stays on screen (answering, re-rendering)', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    const before = onScreen().map((t) => t.slice(1));
    rnd = 0.99; // anything that reshuffled now would give a different order
    await userEvent.click(within(group()).getAllByRole('button')[1]);
    await userEvent.click(within(group()).getAllByRole('button')[2]); // change answer
    expect(onScreen().map((t) => t.slice(1))).toEqual(before);
  });

  it('shows a fresh order each time the question comes back on screen, and the chosen answer stays selected', async () => {
    start(base);
    mount();
    await screen.findByText('Question text q1');
    expect(onScreen()[0]).toMatch(/q1 beta/); // first visit (random = 0)
    await userEvent.click(within(group()).getAllByRole('button')[3]); // alpha → id A
    rnd = 0.99; // the next shuffles leave the order alone
    await pressKey('ArrowRight');
    await screen.findByText('Question text q2');
    await pressKey('ArrowLeft');
    await screen.findByText('Question text q1');
    const texts = onScreen();
    expect(texts[0]).toMatch(/^A.*q1 alpha/); // different order than the first visit
    expect(texts[3]).toMatch(/^D.*q1 delta/);
    expect(within(group()).getByRole('button', { name: /q1 alpha/ }).getAttribute('aria-pressed')).toBe('true');
    expect(session().states[0].selectedAnswer).toBe('A');
  });
});
