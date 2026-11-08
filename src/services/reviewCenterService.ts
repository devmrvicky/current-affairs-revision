// Loads everything the Review Center shows, from the learner's own stored data, and edits saved purposes.
// Reading never writes; the only writes here are the explicit "change/remove a purpose" edits.

import { markedForReviewDB, universalAttemptsDB, wrongQuestionsDB } from './db';
import { resolveQuestionsByIds } from './questionRepository';
import { getAllMonthlyMagazineTestPaths } from './monthlyMagazineRepository';
import { buildQuestionHistories } from './reviewAnalytics';
import { buildReviewItems, type QuestionInfo, type ReviewItem } from './reviewItems';
import { normalizePurposes, savedPurposes, type MarkPurpose } from '../types/questionMark';
import { useMarkedReviewStore } from '../store/markedReviewStore';

export async function loadReviewItems(now: number = Date.now()): Promise<ReviewItem[]> {
  const [attempts, saved, legacyWrong] = await Promise.all([universalAttemptsDB.getAll(), markedForReviewDB.getAll(), wrongQuestionsDB.getAll()]);

  // Question details are only needed for universal questions that are wrong or saved (to filter by subject/topic/difficulty).
  const ids = new Set<string>();
  for (const h of buildQuestionHistories(attempts).values()) if (h.wrong > 0) ids.add(h.questionId);
  for (const m of saved) if (m.universalQuestionId) ids.add(m.universalQuestionId);
  const found = ids.size > 0 ? await resolveQuestionsByIds(Array.from(ids)) : [];
  const questions = new Map<string, QuestionInfo>(
    found.map((q) => [q.id, {
      id: q.id, question: q.question, options: q.options.map((o) => o.text), correctAnswer: q.options.find((o) => o.id === q.correctAnswer)?.text ?? q.correctAnswer,
      explanation: q.explanation ?? '', subjectId: q.subjectId, topicId: q.topicId, subtopicId: q.subtopicId, difficulty: q.difficulty,
    }]),
  );
  return buildReviewItems({ attempts, saved, legacyWrong, questions, monthlyPaths: getAllMonthlyMagazineTestPaths(), now });
}

/**
 * Changes the purposes saved on a question. The record is edited in place — never copied — and when the last purpose is
 * removed the saved record goes with it. (Wrong-answer history is separate and is not touched.)
 */
export async function setSavedPurposes(savedId: string, purposes: MarkPurpose[]): Promise<void> {
  const record = await markedForReviewDB.getById(savedId);
  if (!record) return;
  const next = savedPurposes({ purposes: normalizePurposes(purposes) });
  if (next.length === 0) await markedForReviewDB.delete(savedId);
  else await markedForReviewDB.upsert({ ...record, purpose: next[0], purposes: next });
  await useMarkedReviewStore.getState().load();
}
