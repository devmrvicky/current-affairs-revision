// ─── ExamVerse: Universal Question Model ──────────────────────────────────────
// One question shape for every subject (Current Affairs, Reasoning, Maths, ...).
// Additive to the app: legacy `Question` (types/index.ts) is still what the
// quiz UI and existing stores use today. `legacyQuestionAdapter.ts` converts
// between the two so no existing page/store needs to change in this phase.

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionLanguage = 'en' | 'hi' | 'bilingual';

export interface UniversalQuestionOption {
  id: string; // "A" | "B" | "C" | "D" — stable within the question
  text: string;
}

export interface UniversalQuestion {
  /** Globally stable, never reused even if content is edited/reordered. */
  id: string;

  /** A question can legitimately belong to more than one exam's syllabus. */
  examIds: string[];

  subjectId: string;
  topicId?: string;
  subtopicId?: string;

  questionType: QuestionType;
  question: string;

  options: UniversalQuestionOption[];
  /** Matches an options[].id, e.g. "C" — NOT the option text. */
  correctAnswer: string;

  explanation?: string;
  difficulty: Difficulty;
  language?: QuestionLanguage;

  source?: string;
  year?: number;
  examSource?: string; // e.g. "SSC CHSL 2025 Tier 1 Shift 2"

  tags?: string[];

  /** Set only for questions sourced from a Mock Source File (product spec §89) — lets Review Center/analytics trace a question back to its mock and section without a second lookup. */
  sourceMockId?: string;
  sourceSectionId?: string;
  sourceSectionTitle?: string;

  isCurrentAffairs?: boolean;
  currentAffairDate?: string; // ISO date, e.g. "2026-06-27"
  currentAffairCategory?: string; // National, Sports, Appointments, ...

  createdAt?: string;
  updatedAt?: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────
// Per master-prompt §82: invalid content must be reported clearly, never
// silently rendered or silently dropped without a trace.

export interface QuestionValidationError {
  questionId: string;
  reason: string;
}

export function validateUniversalQuestion(q: UniversalQuestion): QuestionValidationError[] {
  const errors: QuestionValidationError[] = [];
  const fail = (reason: string) => errors.push({ questionId: q.id ?? '(missing id)', reason });

  if (!q.id) fail('missing id');
  if (!q.question?.trim()) fail('missing question text');
  if (!q.subjectId) fail('missing subjectId');
  if (!q.examIds || q.examIds.length === 0) fail('missing examIds (must belong to at least one exam)');
  if (!q.options || q.options.length === 0) fail('missing options');
  if (!q.correctAnswer) fail('missing correctAnswer');
  if (q.options && q.correctAnswer && !q.options.some((o) => o.id === q.correctAnswer)) {
    fail(`correctAnswer "${q.correctAnswer}" does not match any option id`);
  }
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) fail(`invalid difficulty "${q.difficulty}"`);

  return errors;
}
