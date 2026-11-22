import { describe, expect, it } from 'vitest';
import { buildQuestionOrder, isQuestionOrderPermutation } from './questionOrder';

const ids = ['q1', 'q2', 'q3', 'q4'];
const meta = new Map([
  ['q1', { difficulty: 'easy', questionType: 'mcq' }],
  ['q2', { difficulty: 'hard', questionType: 'true_false' }],
  ['q3', { difficulty: 'medium', questionType: 'mcq' }],
  ['q4', { difficulty: 'hard', questionType: 'fill_blank' }],
]);

describe('question order controls', () => {
  it('keeps the current and past questions fixed while sorting future questions hard-to-easy', () => {
    const result = buildQuestionOrder(ids, ids, meta, 'hard-to-easy', ['q3', 'q4']);
    expect(result).toEqual(['q1', 'q2', 'q4', 'q3']);
  });

  it('sorts future questions easy-to-hard', () => {
    const result = buildQuestionOrder(ids, ids, meta, 'easy-to-hard', ['q2', 'q3', 'q4']);
    expect(result).toEqual(['q1', 'q3', 'q2', 'q4']);
  });

  it('restores the original order after a shuffle', () => {
    const shuffled = buildQuestionOrder(ids, ids, meta, 'shuffle', ['q2', 'q3', 'q4'], () => 0);
    expect(shuffled).toEqual(['q1', 'q3', 'q4', 'q2']);
    expect(buildQuestionOrder(shuffled, ids, meta, 'original', ['q2', 'q3', 'q4'])).toEqual(ids);
  });

  it('avoids a no-op shuffle when randomness returns the identity order', () => {
    const result = buildQuestionOrder(ids, ids, meta, 'shuffle', ['q2', 'q3', 'q4'], () => 1);
    expect(result).not.toEqual(ids);
    expect(isQuestionOrderPermutation(ids, result)).toBe(true);
  });

  it('does not move locked or non-reorderable question positions', () => {
    expect(buildQuestionOrder(ids, ids, meta, 'hard-to-easy', ['q4'])).toEqual(ids);
  });

  it('rejects duplicate or incomplete permutations', () => {
    expect(isQuestionOrderPermutation(ids, ['q1', 'q2', 'q3', 'q4'])).toBe(true);
    expect(isQuestionOrderPermutation(ids, ['q1', 'q2', 'q2', 'q4'])).toBe(false);
    expect(isQuestionOrderPermutation(ids, ['q1', 'q2', 'q3'])).toBe(false);
  });

});
