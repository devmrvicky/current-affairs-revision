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
import { normalizePurposes, savedPurposes, type MarkPurpose } from '../types/questionMark';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MarkedReviewQuestion } from '../types';

export function savedMarkId(universalQuestionId: string): string {
  return `universal:${universalQuestionId}`;
}

/**
 * Persists (or removes) the Review Center record for a question. `purposes` is the question's whole set; only the ones that
 * outlive the test (Doubtful / Further Practice / Revision) are saved. One record per question: re-marking or adding another
 * purpose updates it in place, and clearing every saved purpose deletes it. Resolves to true when a record now exists.
 * Throws if storage fails.
 */
export async function syncQuestionMark(question: UniversalQuestion, purposes: MarkPurpose | MarkPurpose[] | null, sourceLabel: string): Promise<boolean> {
  const id = savedMarkId(question.id);
  const set = savedPurposes({ purposes: normalizePurposes(Array.isArray(purposes) ? purposes : purposes ? [purposes] : []) });

  if (set.length === 0) {
    if (await markedForReviewDB.getById(id)) await markedForReviewDB.delete(id);
    await useMarkedReviewStore.getState().load();
    return false;
  }

  const existing = await markedForReviewDB.getById(id);
  const correct = question.options.find((o) => o.id === question.correctAnswer);
  const record: MarkedReviewQuestion = {
    id,
    questionId: 0,
    universalQuestionId: question.id,
    question: question.question,
    options: question.options.map((o) => o.text),
    correctAnswer: correct?.text ?? question.correctAnswer,
    explanation: question.explanation ?? '',
    sourceFileName: existing?.sourceFileName ?? sourceLabel,
    sourceDate: existing?.sourceDate ?? new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    markedAt: existing?.markedAt ?? Date.now(), // the day it was first saved doesn't change when another purpose is added
    purpose: set[0],
    purposes: set,
  };
  await markedForReviewDB.upsert(record);
  await useMarkedReviewStore.getState().load();
  return true;
}
