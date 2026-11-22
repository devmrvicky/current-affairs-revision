import { describe, expect, it } from 'vitest';
import {
  applyLibraryFilters,
  buildLibrary,
  DEFAULT_FILTERS,
  type PracticeTestDefinition,
} from './testLibraryBuilder';

function definition(id: string, questionOwnership: 'original' | 'personal'): PracticeTestDefinition {
  return {
    id,
    examId: 'ssc-chsl',
    subjectId: 'english',
    topicIds: ['synonyms'],
    title: id,
    questionIds: [`${id}-q1`],
    source: 'chapter',
    questionCount: 1,
    difficulty: 'easy',
    isFixedMock: false,
    rawSource: `chapter:english/vocabulary/${id}`,
    scope: 'paper',
    topicCount: 1,
    skippedQuestionCount: 0,
    questionOwnership,
  };
}

const activity = () => undefined;

function library() {
  return buildLibrary('ssc-chsl', 'english', [
    definition('original-set', 'original'),
    definition('personal-set', 'personal'),
  ], { topicTitle: (_subjectId, topicId) => topicId });
}

describe('Practice source filter', () => {
  it('shows both sources by default', () => {
    const result = applyLibraryFilters(library(), DEFAULT_FILTERS, activity);
    expect(result.testCount).toBe(2);
  });

  it('shows only ExamVerse Original tests when selected', () => {
    const result = applyLibraryFilters(library(), { ...DEFAULT_FILTERS, questionSource: 'original' }, activity);
    expect(result.testCount).toBe(1);
    expect(result.chapters.flatMap((chapter) => chapter.chapterTests).map((test) => test.id)).toEqual(['original-set']);
  });

  it('shows only My Questions tests when selected', () => {
    const result = applyLibraryFilters(library(), { ...DEFAULT_FILTERS, questionSource: 'personal' }, activity);
    expect(result.testCount).toBe(1);
    expect(result.chapters.flatMap((chapter) => chapter.chapterTests).map((test) => test.id)).toEqual(['personal-set']);
  });
});
