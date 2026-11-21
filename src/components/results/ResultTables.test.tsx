// @vitest-environment jsdom
// The shared result tables, rendered: every table shows the exact numbers worked out by hand in test/resultFixtures.ts,
// sorting / filtering / paging work, and missing data gets an honest empty state — never a made-up value.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultTables } from './ResultTables';
import { analyzePracticeSession } from '../../services/practiceAnalysisService';
import { practiceResultContext } from '../../services/resultContext';
import { ledger, question, questionsById, session } from '../../test/resultFixtures';
import type { PracticeSession } from '../../types/practiceSession';
import type { UniversalQuestion } from '../../types/universalQuestion';

afterEach(cleanup);

const s = session();
const analysis = analyzePracticeSession(s, questionsById);
const context = practiceResultContext(s, questionsById, ledger);
const mountWorked = () => render(<ResultTables analysis={analysis} context={context} />);
const open = (title: RegExp) => userEvent.click(screen.getByRole('button', { name: title })); // collapsed sections expand on tap
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
const rowOf = (table: HTMLElement, text: string | RegExp) => within(table).getAllByRole('row').find((r) => (typeof text === 'string' ? r.textContent!.includes(text) : text.test(r.textContent!)))!;
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);

describe('scorecard', () => {
  it('shows score, marking scheme, accuracy, attempt rate, counts, marked, time vs allotted and average time', () => {
    mountWorked();
    const text = (key: string) => screen.getByTestId(`score-${key}`).textContent;
    expect(text('score')).toBe('5 / 12');
    expect(text('marking')).toBe('+2 correct · −0.5 incorrect');
    expect(text('accuracy')).toBe('60%');
    expect(text('attemptRate')).toBe('83.3%');
    expect(text('attempted')).toBe('5 / 6');
    expect(text('correct')).toBe('3');
    expect(text('incorrect')).toBe('2');
    expect(text('unattempted')).toBe('1');
    expect(text('marked')).toBe('1');
    expect(text('time')).toBe('06:40 of 10:00');
    expect(text('avgTime')).toBe('53s');
  });
});

describe('structure and accessibility', () => {
  it('every table is a labelled region that scrolls inside itself, with a pinned first column and real column headers', () => {
    mountWorked();
    const table = screen.getByTestId('table-subjects');
    expect(table.className).toMatch(/\boverflow-x-auto\b/); // wide tables scroll in their own container, not the page
    expect(table.getAttribute('aria-label')).toBe('Subject-wise results');
    expect(within(table).getByRole('table', { name: 'Subject-wise results' })).toBeTruthy();
    for (const h of ['Subject', 'Questions', 'Attempted', 'Correct', 'Wrong', 'Skipped', 'Accuracy', 'Time', 'Marks', 'Strength']) expect(within(table).getByRole('columnheader', { name: h })).toBeTruthy();
    const first = within(table).getAllByRole('columnheader')[0];
    expect(first.className).toMatch(/\bsticky\b.*\bleft-0\b/);
    expect(cells(bodyRows(table)[0]).length).toBe(10);
    expect(within(bodyRows(table)[0]).getAllByRole('cell')[0].className).toMatch(/\bsticky\b/);
  });
  it('numbers are right-aligned; text is not', () => {
    mountWorked();
    const row = bodyRows(screen.getByTestId('table-subjects'))[0];
    const [name, questions, , , , , accuracy] = within(row).getAllByRole('cell');
    expect(name.className).toMatch(/text-left/);
    expect(questions.className).toMatch(/text-right/);
    expect(accuracy.className).toMatch(/text-right.*tabular-nums|tabular-nums.*text-right/);
  });
  it('shows no rank, percentile, topper comparison or cut-off figure', async () => {
    mountWorked();
    await open(/Compared with your earlier attempts/);
    expect(screen.queryByText(/all india rank|topper/i)).toBeNull();
    expect(screen.getByText(/No rank, percentile or cut-off is shown/)).toBeTruthy(); // says why, instead of inventing one
  });
});

describe('section-wise table', () => {
  it('has a row per section with questions, attempted, correct, wrong, skipped, score, accuracy and time spent / allotted', () => {
    mountWorked();
    const t = screen.getByTestId('table-sections');
    const rows = bodyRows(t).map(cells);
    expect(rows[0]).toEqual(['Section 1', '3', '3', '2', '1', '0', '3.5 / 6', '66.7%', '02:40 / 05:00']);
    expect(rows[1]).toEqual(['Section 2', '3', '2', '1', '1', '1', '1.5 / 6', '50%', '01:45 / 05:00']);
  });
  it('is not shown for a test without sections', () => {
    const plain = session({ timing: undefined, durationSeconds: undefined });
    render(<ResultTables analysis={analyzePracticeSession(plain, questionsById)} context={practiceResultContext(plain, questionsById, [])} />);
    expect(screen.queryByTestId('table-sections')).toBeNull();
  });
});

describe('subject-wise and topic-wise tables', () => {
  it('count attempted / correct / wrong / skipped with accuracy, time and marks; strength follows the 10-answer rule', () => {
    mountWorked();
    const subjects = screen.getByTestId('table-subjects');
    expect(cells(rowOf(subjects, /^Mathematics|^Math/))).toEqual([expect.stringMatching(/^Math/), '4', '3', '2', '1', '1', '66.7%', '02:40', '3.5', 'Insufficient data']);
    expect(cells(bodyRows(subjects)[1]).slice(1)).toEqual(['2', '2', '1', '1', '0', '50%', '01:45', '1.5', 'Insufficient data']);
    const topics = screen.getByTestId('table-topics');
    expect(bodyRows(topics)).toHaveLength(3);
    expect(cells(bodyRows(topics)[1]).slice(1)).toEqual(['2', '1', '1', '0', '1', '100%', '00:40', '2', 'Insufficient data']);
    expect(screen.getByText(/only given from 10 answered questions/)).toBeTruthy();
  });
  it('rates a subject Weak / Average / Strong once it has 10 answered questions', () => {
    const many = Array.from({ length: 10 }, (_, i) => `w${i}`);
    const qs = new Map<string, UniversalQuestion>(many.map((id) => [id, { ...question('q1'), id }]));
    const big = { ...s, questionIds: many, config: { ...s.config, timing: undefined, durationSeconds: undefined },
      states: many.map((id, i) => ({ questionId: id, selectedAnswer: i < 3 ? 'A' : 'B', isMarkedForReview: false, timeTaken: 5 })) } as unknown as PracticeSession; // 3 right of 10 = 30 %
    render(<ResultTables analysis={analyzePracticeSession(big, qs)} context={practiceResultContext(big, qs, [])} />);
    expect(within(bodyRows(screen.getByTestId('table-subjects'))[0]).getByText('Weak')).toBeTruthy();
  });
});

describe('difficulty-wise and time analysis tables', () => {
  it('difficulty rows for easy / medium / hard', async () => {
    mountWorked();
    await open(/Difficulty-wise/);
    const t = screen.getByTestId('table-difficulty');
    expect(bodyRows(t).map((r) => cells(r).slice(0, 3))).toEqual([['Easy', '2', '2'], ['Medium', '2', '1'], ['Hard', '2', '2']]);
    expect(cells(bodyRows(t)[0])).toEqual(['Easy', '2', '2', '1', '1', '0', '50%', '02:00', '1.5']);
  });
  it('time by outcome, fastest, slowest and over the 90 s threshold', async () => {
    mountWorked();
    await open(/Time analysis/);
    expect(bodyRows(screen.getByTestId('table-time-outcome')).map(cells)).toEqual([['Correct', '3', '52s', '02:35'], ['Wrong', '2', '55s', '01:50'], ['Skipped', '1', 'Not recorded', '00:00']]);
    expect(bodyRows(screen.getByTestId('table-time-fastest')).map((r) => cells(r)[0] + ':' + cells(r)[3])).toEqual(['5:10s', '1:20s', '3:40s']);
    expect(bodyRows(screen.getByTestId('table-time-slowest')).map((r) => cells(r)[0] + ':' + cells(r)[3])).toEqual(['2:100s', '6:95s', '3:40s']);
    expect(bodyRows(screen.getByTestId('table-time-over')).map((r) => cells(r)[0])).toEqual(['2', '6']);
    expect(screen.getByText(/Questions over 90s \(2\)/)).toBeTruthy();
  });
});

describe('question-wise table', () => {
  const table = () => screen.getByRole('region', { name: 'Question-wise results' });
  const order = () => bodyRows(table()).map((r) => cells(r)[0].replace(/\D/g, ''));

  it('has a row per question: section, subject › topic, difficulty, status, answers as text, time and +/− marks', () => {
    mountWorked();
    expect(order()).toEqual(['1', '2', '3', '4', '5', '6']);
    const q2 = cells(bodyRows(table())[1]);
    expect(q2[1]).toBe('Section 1');
    expect(q2[2]).toMatch(/Math.* › /);
    expect(q2.slice(3)).toEqual(['Easy', 'Wrong', 'q2-opt-b', 'q2-opt-a', '100s', '−0.5']);
    expect(cells(bodyRows(table())[3]).slice(4)).toEqual(['Skipped', '—', 'q4-opt-a', '—', '0']); // skipped: no answer, no time
    expect(cells(bodyRows(table())[0])[8]).toBe('+2');
  });
  it('writes the status out — never colour alone — and shows Marked as text', () => {
    mountWorked();
    expect(within(bodyRows(table())[5]).getByText('Marked')).toBeTruthy();
    expect(within(bodyRows(table())[0]).getByText('Correct')).toBeTruthy();
    expect(within(bodyRows(table())[1]).getByText('Wrong')).toBeTruthy();
  });
  it('filters by status and Marked, with counts on the filters', async () => {
    mountWorked();
    expect(screen.getByRole('button', { name: 'Wrong (2)' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Wrong (2)' }));
    expect(order()).toEqual(['2', '5']);
    await userEvent.click(screen.getByRole('button', { name: 'Marked (1)' }));
    expect(order()).toEqual(['6']);
    await userEvent.click(screen.getByRole('button', { name: 'All (6)' }));
    expect(order()).toHaveLength(6);
  });
  it('sorts by a column header (ascending, then descending), and says which column is sorted', async () => {
    mountWorked();
    const timeHeader = () => within(table()).getByRole('columnheader', { name: /Time/ });
    await userEvent.click(within(timeHeader()).getByRole('button'));
    expect(order()).toEqual(['5', '1', '3', '6', '2', '4']);
    expect(timeHeader().getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(within(timeHeader()).getByRole('button'));
    expect(order()).toEqual(['2', '6', '3', '1', '5', '4']);
    expect(timeHeader().getAttribute('aria-sort')).toBe('descending');
    await userEvent.click(within(within(table()).getByRole('columnheader', { name: /Marks/ })).getByRole('button'));
    expect(order()).toEqual(['2', '5', '4', '1', '3', '6']); // −0.5, −0.5, 0, +2, +2, +2 — ties keep test order
  });
  it('a row opens its solution — the explanation with a Listen button — and closes again', async () => {
    mountWorked();
    await userEvent.click(screen.getByRole('button', { name: 'Open solution for question 2' }));
    const sol = await screen.findByTestId('question-solution');
    expect(within(sol).getByText('Because q2')).toBeTruthy();
    expect(within(sol).getByRole('button', { name: /read/i })).toBeTruthy(); // the Listen button ("Read the explanation aloud")
    expect(within(sol).getByText('Listen')).toBeTruthy();
    expect(sol.textContent).toMatch(/Your answer: q2-opt-b/);
    expect(sol.textContent).toMatch(/Correct answer: q2-opt-a/);
    await userEvent.click(screen.getByRole('button', { name: 'Hide solution for question 2' }));
    expect(screen.queryByTestId('question-solution')).toBeNull();
  });
  it('pages through a long test, 25 at a time', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i + 1}`);
    const qs = new Map<string, UniversalQuestion>(ids.map((id) => [id, { ...question('q1'), id }]));
    const long = { ...s, questionIds: ids, config: { ...s.config, timing: undefined, durationSeconds: undefined },
      states: ids.map((id, i) => ({ questionId: id, selectedAnswer: i % 2 ? 'B' : 'A', isMarkedForReview: false, timeTaken: 3 })) } as unknown as PracticeSession;
    render(<ResultTables analysis={analyzePracticeSession(long, qs)} context={practiceResultContext(long, qs, [])} />);
    expect(order()).toHaveLength(25);
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(order()).toEqual(['26', '27', '28', '29', '30']);
    expect(screen.getByText('Showing 26–30 of 30')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(true);
  });
  it('says so when a filter matches nothing', async () => {
    const clean = { ...s, states: s.states.map((st) => ({ ...st, isMarkedForReview: false, markPurpose: undefined })) } as PracticeSession;
    render(<ResultTables analysis={analyzePracticeSession(clean, questionsById)} context={practiceResultContext(clean, questionsById, [])} />);
    await userEvent.click(screen.getByRole('button', { name: 'Marked (0)' }));
    expect(screen.getByText('No questions match this filter.')).toBeTruthy();
  });
});

describe('comparison with earlier attempts', () => {
  it('lists this attempt and the earlier attempt of the same test', async () => {
    mountWorked();
    await open(/Compared with your earlier attempts/);
    const t = screen.getByTestId('table-comparison');
    expect(bodyRows(t).map((r) => [cells(r)[0], cells(r)[2], cells(r)[3], cells(r)[4]])).toEqual([['This attempt', '5 / 12', '60%', '5'], ['Attempt 1', '1.5 / 6', '50%', '2']]);
  });
});

describe('honest empty states', () => {
  const blank = { ...s, states: s.states.map((st) => ({ ...st, selectedAnswer: null, timeTaken: 0, isMarkedForReview: false, markPurpose: undefined })), config: { ...s.config, marking: undefined, timing: undefined, durationSeconds: undefined } } as PracticeSession;
  const noDifficulty = new Map<string, UniversalQuestion>([...questionsById].map(([id, q]) => [id, { ...q, difficulty: undefined } as unknown as UniversalQuestion]));

  it('no time recorded, no difficulty, first attempt, nothing attempted: each table says so instead of showing zeros or guesses', async () => {
    render(<ResultTables analysis={analyzePracticeSession(blank, noDifficulty)} context={practiceResultContext(blank, noDifficulty, [])} />);
    expect(screen.getByTestId('score-accuracy').textContent).toBe('Not available');
    expect(screen.getByTestId('score-marking').textContent).toBe('No marking scheme');
    expect(screen.getByTestId('score-avgTime').textContent).toBe('Not recorded');
    expect(screen.getByTestId('score-time').textContent).toMatch(/\(no time limit\)$/);
    await open(/Difficulty-wise/);
    expect(screen.getByText(/Difficulty isn't recorded/)).toBeTruthy();
    expect(screen.queryByTestId('table-difficulty')).toBeNull();
    await open(/Time analysis/);
    expect(screen.getByText(/Per-question time wasn't recorded/)).toBeTruthy();
    expect(screen.queryByTestId('table-time-outcome')).toBeNull();
    await open(/Compared with your earlier attempts/);
    expect(screen.getByText(/first recorded attempt of this test/)).toBeTruthy();
    expect(within(bodyRows(screen.getByTestId('table-subjects'))[0]).getAllByRole('cell')[6].textContent).toBe('—'); // accuracy: not 0 %
  });
});
