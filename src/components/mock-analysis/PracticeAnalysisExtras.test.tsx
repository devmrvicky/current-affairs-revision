// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { PracticeAnalysisExtras } from './PracticeAnalysisExtras';
import { getDB, universalAttemptsDB } from '../../services/db';
import { resolveTiming } from '../../services/sessionTiming';
import type { PracticeSession } from '../../types/practiceSession';
import type { UniversalQuestion } from '../../types/universalQuestion';

const q = (id: string): UniversalQuestion => ({ id, examIds: ['e'], subjectId: 'mathematics', topicId: 'average', questionType: 'mcq', question: `Text ${id}`, difficulty: 'easy', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', explanation: '' });
const ids = ['q1', 'q2', 'q3', 'q4'];
const questionsById = new Map(ids.map((i) => [i, q(i)]));
const session = (sectional: boolean): PracticeSession => ({
  id: 'now', config: { examId: 'e', subjectIds: ['mathematics'], questionCount: 4, mode: 'test', label: 'T', ...(sectional ? resolveTiming({ kind: 'sectional', sectionMinutes: [5, 5] }, 4, undefined) : {}) }, questionIds: ids,
  states: [['B', 20], ['A', 30], ['B', 10], [null, 0]].map(([selectedAnswer, timeTaken], i) => ({ questionId: ids[i], selectedAnswer: selectedAnswer as string | null, isMarkedForReview: false, timeTaken: timeTaken as number })),
  currentIndex: 0, startedAt: 0, lastActiveAt: 0, isCompleted: true, completedAt: 1, totalPausedTime: 0, visitedIndices: [0, 1, 2, 3],
}) as PracticeSession;

afterEach(cleanup);

describe('practice analysis extras on screen', () => {
  it('shows each section of a sectional test and the questions you keep getting wrong', async () => {
    await (await getDB()).clear('universalAttempts' as never);
    await universalAttemptsDB.recordMany([{ id: 'old1', universalQuestionId: 'q1', examId: 'e', subjectId: 'mathematics', topicId: 'average', isCorrect: false, wasAnswered: true, timeTaken: 9, attemptedAt: 5, sessionId: 'older', sourceFileName: 'universal-session-older' }]);
    render(<PracticeAnalysisExtras session={session(true)} questionsById={questionsById} />);
    const sections = await screen.findAllByTestId('section-result');
    expect(sections).toHaveLength(2);
    expect(within(sections[0]).getByText(/1 correct · 1 wrong · 0 skipped of 2/)).toBeTruthy();
    expect(within(sections[1]).getByText(/0 correct · 1 wrong · 1 skipped of 2/)).toBeTruthy();
    expect(within(sections[0]).getByText(/Time: 00:50 of 05:00 allotted/)).toBeTruthy();
    const repeated = await screen.findAllByTestId('repeated-mistake');
    expect(repeated).toHaveLength(1);
    expect(repeated[0].textContent).toMatch(/Text q1/);
    expect(repeated[0].textContent).toMatch(/1 time before/);
  });

  it('shows no section block for an ordinary test, and nothing at all when there is nothing to report', async () => {
    await (await getDB()).clear('universalAttempts' as never);
    render(<PracticeAnalysisExtras session={session(false)} questionsById={questionsById} />);
    await waitFor(() => expect(screen.getByTestId('practice-analysis-extras')).toBeTruthy());
    expect(screen.queryByTestId('section-result')).toBeNull();
    expect(screen.queryByTestId('repeated-mistake')).toBeNull();
  });
});
