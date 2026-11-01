// ─── Saved question marks ────────────────────────────────────────────────────
// "Doubtful", "Further Practice" and "Revision" marks outlive the test they were made in, so choosing one
// writes a record into the Review Center's existing store (markedForReview) immediately — the learner is
// only told a question was saved after that write has actually succeeded. "Mark for Review" is different:
// it means "revisit before submitting THIS test", so it stays on the session and isn't saved here.
//
// One record per question (`universal:<id>`): marking the same question again, or changing its purpose,
// updates that record rather than adding another; removing the mark deletes it.

import { markedForReviewDB } from './db';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { getMarkPurposeInfo, type MarkPurpose } from '../types/questionMark';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MarkedReviewQuestion } from '../types';

export function savedMarkId(universalQuestionId: string): string {
  return `universal:${universalQuestionId}`;
}

/** Persists (or removes) the Review Center record for a question. Resolves to true when a record now exists. Throws if storage fails. */
export async function syncQuestionMark(question: UniversalQuestion, purpose: MarkPurpose | null, sourceLabel: string): Promise<boolean> {
  const id = savedMarkId(question.id);
  const saves = purpose !== null && getMarkPurposeInfo(purpose)?.savesToReviewCenter;

  if (!saves) {
    if (await markedForReviewDB.getById(id)) await markedForReviewDB.delete(id);
    await useMarkedReviewStore.getState().load();
    return false;
  }

  const correct = question.options.find((o) => o.id === question.correctAnswer);
  const record: MarkedReviewQuestion = {
    id,
    questionId: 0,
    universalQuestionId: question.id,
    question: question.question,
    options: question.options.map((o) => o.text),
    correctAnswer: correct?.text ?? question.correctAnswer,
    explanation: question.explanation ?? '',
    sourceFileName: sourceLabel,
    sourceDate: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    markedAt: Date.now(),
    purpose,
  };
  await markedForReviewDB.upsert(record);
  await useMarkedReviewStore.getState().load();
  return true;
}
