// ─── Legacy → Universal Question Adapter ──────────────────────────────────────
// Converts the existing `DailyQuiz` / `Question` shape (types/index.ts,
// per-file numeric ids) into `UniversalQuestion` (types/universalQuestion.ts,
// globally stable string ids). Nothing about the legacy stores/pages changes —
// this is purely additive so the new question-centric engine (Practice, Test,
// Analytics) can operate over the SAME underlying content the app already has.

import type { DailyQuiz, Question as LegacyQuestion } from '../types';
import type { UniversalQuestion, UniversalQuestionOption, Difficulty } from '../types/universalQuestion';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Legacy questions store `correctAnswer` as the option TEXT, not an option id.
 * The universal model always stores `correctAnswer` as an option id, so we
 * assign stable letter ids in array order and resolve the match by text.
 */
function toUniversalOptions(legacyOptions: string[]): UniversalQuestionOption[] {
  return legacyOptions.map((text, i) => ({ id: OPTION_LETTERS[i] ?? String(i), text }));
}

function resolveCorrectAnswerId(options: UniversalQuestionOption[], legacyCorrectAnswerText: string): string {
  const match = options.find((o) => o.text === legacyCorrectAnswerText);
  if (match) return match.id;
  // Defensive fallback: legacy data should always match by text, but if it
  // doesn't (whitespace/encoding drift), keep the option list valid rather
  // than silently producing an unanswerable question.
  return options[0]?.id ?? 'A';
}

export interface LegacyToUniversalOptions {
  /** Stable prefix for generated ids, e.g. "current-affairs-2026-06-27" or "current-affairs-budget". */
  idPrefix: string;
  examIds: string[];
  subjectId: string;
  topicId?: string;
  isCurrentAffairs?: boolean;
  currentAffairDate?: string; // ISO date
  currentAffairCategory?: string;
  difficulty?: Difficulty; // legacy data has no difficulty field — default to 'medium'
  language?: 'hi' | 'en' | 'bilingual';
  source?: string;
}

export function convertLegacyQuestion(
  legacy: LegacyQuestion,
  index: number,
  opts: LegacyToUniversalOptions
): UniversalQuestion {
  const options = toUniversalOptions(legacy.options);
  return {
    id: `${opts.idPrefix}-${String(index + 1).padStart(4, '0')}`,
    examIds: opts.examIds,
    subjectId: opts.subjectId,
    topicId: opts.topicId,
    questionType: 'mcq',
    question: legacy.question,
    options,
    correctAnswer: resolveCorrectAnswerId(options, legacy.correctAnswer),
    explanation: legacy.explanation,
    difficulty: opts.difficulty ?? 'medium',
    language: opts.language ?? 'hi',
    source: opts.source,
    isCurrentAffairs: opts.isCurrentAffairs,
    currentAffairDate: opts.currentAffairDate,
    currentAffairCategory: opts.currentAffairCategory,
  };
}

export function convertDailyQuiz(
  quiz: DailyQuiz,
  opts: LegacyToUniversalOptions
): UniversalQuestion[] {
  return quiz.questions.map((q, i) => convertLegacyQuestion(q, i, opts));
}

/** Inverse mapping, used when handing a UniversalQuestion to legacy quiz-session/store code that still expects the old shape. */
export function toLegacyQuestion(uq: UniversalQuestion): LegacyQuestion {
  const correctOption = uq.options.find((o) => o.id === uq.correctAnswer);
  return {
    id: hashToLegacyId(uq.id),
    question: uq.question,
    options: uq.options.map((o) => o.text),
    correctAnswer: correctOption?.text ?? uq.options[0]?.text ?? '',
    explanation: uq.explanation ?? '',
    // Carried through so the attempt ledger can link back to this exact
    // universal question — see Question.universalId in types/index.ts.
    universalId: uq.id,
    subjectId: uq.subjectId,
    topicId: uq.topicId,
    examId: uq.examIds[0],
  };
}

/** Legacy `Question.id` is a number (scoped to one file). Deterministic numeric hash for interop only — never used as the universal id. */
function hashToLegacyId(stableId: string): number {
  let hash = 0;
  for (let i = 0; i < stableId.length; i++) {
    hash = (hash * 31 + stableId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
