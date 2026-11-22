import { describe, expect, it } from 'vitest';
import { matchesQuestionOwnership, questionOwnershipFromId } from './questionOwnership';

describe('question ownership', () => {
  it('classifies local bank questions as personal by their stable namespaced id', () => {
    expect(questionOwnershipFromId('qb:local:my-test:q001')).toBe('personal');
    expect(matchesQuestionOwnership('qb:local:my-test:q001', 'personal')).toBe(true);
    expect(matchesQuestionOwnership('qb:local:my-test:q001', 'original')).toBe(false);
  });

  it('classifies GitHub-published and bundled questions as ExamVerse Original', () => {
    expect(questionOwnershipFromId('qb:remote:official-test:q001')).toBe('original');
    expect(questionOwnershipFromId('ssc-chsl-2026-mathematics-q001')).toBe('original');
    expect(matchesQuestionOwnership('qb:remote:official-test:q001', 'original')).toBe(true);
  });

  it('keeps all questions when the All filter is selected', () => {
    expect(matchesQuestionOwnership('qb:local:t:q', 'all')).toBe(true);
    expect(matchesQuestionOwnership('qb:remote:t:q', 'all')).toBe(true);
  });
});
