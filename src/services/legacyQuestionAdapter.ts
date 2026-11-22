// ─── Legacy → Universal Question Adapter ──────────────────────────────────────
// Converts the existing `DailyQuiz` / `Question` shape (types/index.ts,
// per-file numeric ids) into `UniversalQuestion` (types/universalQuestion.ts,
// globally stable string ids). This is additive: existing legacy quiz data and
// stores keep their original shape while the universal session engine reuses it.

import type { DailyQuiz, Question as LegacyQuestion } from '../types';
import type {
  Difficulty,
  QuestionType,
  UniversalQuestion,
  UniversalQuestionOption,
} from '../types/universalQuestion';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function toUniversalOptions(legacyOptions: string[]): UniversalQuestionOption[] {
  return legacyOptions.map((text, index) => ({
    id: OPTION_LETTERS[index] ?? String(index),
    text,
  }));
}

function resolveCorrectAnswerId(
  options: UniversalQuestionOption[],
  legacyCorrectAnswerText: string,
): string {
  const match = options.find((option) => option.text === legacyCorrectAnswerText);
  if (match) return match.id;
  // Keep malformed legacy data answerable rather than returning an unknown id.
  return options[0]?.id ?? 'A';
}

function isQuestionType(value: string | undefined): value is QuestionType {
  return value === 'mcq' || value === 'true_false' || value === 'fill_blank';
}

function parseDifficulty(value: string | undefined): Difficulty | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') {
    return normalized;
  }
  return undefined;
}

export interface LegacyToUniversalOptions {
  /** Stable prefix for generated ids, e.g. "current-affairs-2026-06-27". */
  idPrefix: string;
  examIds: string[];
  subjectId: string;
  topicId?: string;
  isCurrentAffairs?: boolean;
  currentAffairDate?: string;
  currentAffairCategory?: string;
  difficulty?: Difficulty;
  language?: 'hi' | 'en' | 'bilingual';
  source?: string;
}

export function convertLegacyQuestion(
  legacy: LegacyQuestion,
  index: number,
  opts: LegacyToUniversalOptions,
): UniversalQuestion {
  const options = toUniversalOptions(legacy.options);
  const difficulty = parseDifficulty(legacy.difficulty) ?? opts.difficulty ?? 'medium';

  return {
    id: `${opts.idPrefix}-${String(index + 1).padStart(4, '0')}`,
    examIds: opts.examIds,
    subjectId: opts.subjectId,
    topicId: opts.topicId,
    questionType: isQuestionType(legacy.questionType) ? legacy.questionType : 'mcq',
    question: legacy.question,
    options,
    correctAnswer: resolveCorrectAnswerId(options, legacy.correctAnswer),
    explanation: legacy.explanation,
    difficulty,
    language: opts.language ?? 'hi',
    source: opts.source,
    isCurrentAffairs: opts.isCurrentAffairs,
    currentAffairDate: opts.currentAffairDate,
    currentAffairCategory: opts.currentAffairCategory,
  };
}

export function convertDailyQuiz(
  quiz: DailyQuiz,
  opts: LegacyToUniversalOptions,
): UniversalQuestion[] {
  return quiz.questions.map((question, index) => convertLegacyQuestion(question, index, opts));
}

/** Inverse mapping for legacy quiz-session/store code. */
export function toLegacyQuestion(universalQuestion: UniversalQuestion): LegacyQuestion {
  const correctOption = universalQuestion.options.find(
    (option) => option.id === universalQuestion.correctAnswer,
  );

  return {
    id: hashToLegacyId(universalQuestion.id),
    question: universalQuestion.question,
    options: universalQuestion.options.map((option) => option.text),
    correctAnswer: correctOption?.text ?? universalQuestion.options[0]?.text ?? '',
    explanation: universalQuestion.explanation ?? '',
    universalId: universalQuestion.id,
    subjectId: universalQuestion.subjectId,
    topicId: universalQuestion.topicId,
    examId: universalQuestion.examIds[0],
    difficulty: universalQuestion.difficulty,
    questionType: universalQuestion.questionType,
  };
}

/** Deterministic numeric hash for legacy interop; not used as the universal id. */
function hashToLegacyId(stableId: string): number {
  let hash = 0;
  for (let index = 0; index < stableId.length; index += 1) {
    hash = (hash * 31 + stableId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
