import { describe, expect, it } from 'vitest';
import type { UniversalQuestion } from '../types/universalQuestion';
import { buildPracticeTests } from './testLibraryBuilder';

const sharedSource = 'chapter:english/vocabulary/Synonyms.json';

function question(id: string): UniversalQuestion {
  return {
    id,
    examIds: ['ssc-chsl'],
    subjectId: 'english',
    topicId: 'vocabulary',
    questionType: 'mcq',
    question: `Question ${id}`,
    options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Incorrect' }],
    correctAnswer: 'A',
    difficulty: 'medium',
    source: sharedSource,
  };
}

describe('Practice test source identity', () => {
  it('keeps Original and Personal questions separate even when their source path and file name match', () => {
    const tests = buildPracticeTests('ssc-chsl', 'english', [
      question('original-q1'),
      question('qb:local:my-copy:personal-q1'),
    ], {
      chapter: () => ({ title: 'Vocabulary' }),
      topicTitle: () => 'Vocabulary',
    });

    expect(tests).toHaveLength(2);
    const original = tests.find((test) => test.questionOwnership === 'original');
    const personal = tests.find((test) => test.questionOwnership === 'personal');
    expect(original?.questionIds).toEqual(['original-q1']);
    expect(personal?.questionIds).toEqual(['qb:local:my-copy:personal-q1']);
    expect(original?.id).not.toBe(personal?.id);
    expect(original?.title).toContain('ExamVerse Original');
    expect(personal?.title).toContain('My Questions');
  });
});


describe('local folder-backed Practice labels', () => {
  it('uses the selected human folder path instead of exposing the internal Author folder id', () => {
    const source = 'chapter:english/author-folder-folder-123/Questions (Local)';
    const localQuestion: UniversalQuestion = {
      ...question('qb:local:author-file-123:q1'),
      source,
      sourceChapterTitle: 'Fixed Preposition / My Revision Set',
    };
    const tests = buildPracticeTests('ssc-chsl', 'english', [localQuestion], {
      chapter: () => undefined,
      topicTitle: () => 'Fixed Preposition',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].chapterTitle).toBe('Fixed Preposition / My Revision Set');
    expect(tests[0].chapterTitle).not.toContain('author-folder-');
  });
});
