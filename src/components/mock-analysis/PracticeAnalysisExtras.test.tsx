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
  it('shows the questions you keep getting wrong, as a table', async () => {
    await (await getDB()).clear('universalAttempts' as never);
    await universalAttemptsDB.recordMany([{ id: 'old1', universalQuestionId: 'q1', examId: 'e', subjectId: 'mathematics', topicId: 'average', isCorrect: false, wasAnswered: true, timeTaken: 9, attemptedAt: 5, sessionId: 'older', sourceFileName: 'universal-session-older' }]);
    render(<PracticeAnalysisExtras session={session(true)} questionsById={questionsById} />);
    const table = await screen.findByRole('region', { name: 'Repeated mistakes' });
    const repeated = within(table).getAllByTestId('repeated-mistake');
    expect(repeated).toHaveLength(1);
    expect(repeated[0].textContent).toMatch(/Text q1/);
    const row = repeated[0].closest('tr') as HTMLElement;
    expect(within(row).getByText('1 time')).toBeTruthy(); // wrong once before
    expect(within(table).getByRole('columnheader', { name: 'Wrong before' })).toBeTruthy();
  });

  it('shows nothing at all when there is nothing to report', async () => {
    await (await getDB()).clear('universalAttempts' as never);
    render(<PracticeAnalysisExtras session={session(false)} questionsById={questionsById} />);
    await waitFor(() => expect(screen.getByTestId('practice-analysis-extras')).toBeTruthy());
    expect(screen.queryByTestId('repeated-mistake')).toBeNull();
  });
});
