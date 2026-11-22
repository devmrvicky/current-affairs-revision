/**
 * User-facing ownership of questions in the shared Practice pool.
 *
 * Bundled app content and GitHub-published bank tests are ExamVerse Original.
 * Tests saved in the local bank (including files published from Author Studio)
 * belong to the learner and are My Questions.
 *
 * The namespace is part of the stable question id, so this classification does
 * not depend on a display name, folder path, or a filename that may be shared.
 */
export type QuestionOwnership = 'original' | 'personal';
export type QuestionOwnershipFilter = 'all' | QuestionOwnership;

export function questionOwnershipFromId(questionId: string): QuestionOwnership {
  return questionId.startsWith('qb:local:') ? 'personal' : 'original';
}

export function matchesQuestionOwnership(questionId: string, filter: QuestionOwnershipFilter): boolean {
  return filter === 'all' || questionOwnershipFromId(questionId) === filter;
}
