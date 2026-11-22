import { describe, expect, it } from 'vitest';
import {
  availablePaletteQuestionTypes,
  filterPaletteQuestionIndices,
  type QuestionPaletteFilterState,
  type QuestionPaletteItemMeta,
} from './QuestionPaletteFilters';

const items: QuestionPaletteItemMeta[] = [
  { index: 0, answered: false, difficulty: 'easy', questionType: 'mcq' },
  { index: 1, answered: true, difficulty: 'hard', questionType: 'true_false' },
  { index: 2, answered: true, difficulty: 'medium', questionType: 'mcq' },
  { index: 3, answered: false, difficulty: 'hard', questionType: 'fill_blank' },
  { index: 4, answered: true, difficulty: 'easy', questionType: 'mcq' },
];

const filters = (over: Partial<QuestionPaletteFilterState> = {}): QuestionPaletteFilterState => ({
  solvedOnly: false,
  difficultyOrder: 'original',
  questionType: 'all',
  ...over,
});

describe('question palette filters', () => {
  it('shows only answered questions when Solved is enabled without renumbering', () => {
    expect(filterPaletteQuestionIndices(items, filters({ solvedOnly: true }))).toEqual([1, 2, 4]);
  });

  it('sorts hard to easy while retaining stable original order for equal difficulty', () => {
    expect(filterPaletteQuestionIndices(items, filters({ difficultyOrder: 'hard-to-easy' }))).toEqual([1, 3, 2, 0, 4]);
  });

  it('sorts easy to hard while retaining stable original order for equal difficulty', () => {
    expect(filterPaletteQuestionIndices(items, filters({ difficultyOrder: 'easy-to-hard' }))).toEqual([0, 4, 2, 1, 3]);
  });

  it('combines solved, difficulty order and question type filters', () => {
    expect(filterPaletteQuestionIndices(items, filters({ solvedOnly: true, difficultyOrder: 'hard-to-easy', questionType: 'mcq' }))).toEqual([2, 4]);
  });

  it('lists only question types present in the active set', () => {
    expect(availablePaletteQuestionTypes(items)).toEqual(['mcq', 'true_false', 'fill_blank']);
    expect(availablePaletteQuestionTypes(items.slice(0, 1))).toEqual(['mcq']);
  });

  it('keeps unknown difficulty values at the end rather than guessing', () => {
    const withUnknown = [...items, { index: 5, answered: false, questionType: 'mcq' as const }];
    expect(filterPaletteQuestionIndices(withUnknown, filters({ difficultyOrder: 'hard-to-easy' }))).toEqual([1, 3, 2, 0, 4, 5]);
  });
});
