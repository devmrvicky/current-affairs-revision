// ─── Canonical chapter-file normalizer ───────────────────────────────────────
// Pure helpers (no import.meta.glob, no I/O) that turn whatever shape a chapter
// test file was authored in into the one shape the universal pool needs.
//
// Two container shapes exist in src/data/chapters/**:
//   1. A bare array of questions (the native universal shape).
//   2. The older "quiz" shape — `{ date?, topic?, questions: [...] }` — whose
//      options are plain strings and whose `correctAnswer` is the option TEXT.
//      These files used to be read by the Current Affairs loaders and were left
//      stranded when their folders became ordinary General Awareness chapters,
//      so the canonical loader has to understand them too, otherwise a test
//      file that the Chapters screen lists shows up with zero questions.
//
// Nothing here guesses: an answer that cannot be matched to an option is passed
// through unchanged so `validateUniversalQuestion` / `isPlayableQuestion` can
// flag it, instead of silently defaulting to option A.

import type { UniversalQuestionOption } from '../types/universalQuestion';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function letterFor(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

/** Accepts a bare array or a `{ questions: [] }` wrapper. Anything else is not a question file. */
export function unwrapQuestionFile(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const inner = (raw as { questions?: unknown }).questions;
    if (Array.isArray(inner)) return inner;
  }
  return null;
}

/** String options get stable letter ids in array order; object options keep the id they were authored with. */
export function normalizeOptions(raw: unknown): UniversalQuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((option, index) => {
    if (typeof option === 'string') return { id: letterFor(index), text: option };
    if (option && typeof option === 'object') {
      const o = option as { id?: unknown; text?: unknown; image?: unknown };
      if (typeof o.id === 'string' && o.id.length > 0 && typeof o.text === 'string') return option as UniversalQuestionOption;
      return {
        id: typeof o.id === 'string' && o.id.length > 0 ? o.id : letterFor(index),
        text: typeof o.text === 'string' ? o.text : '',
        image: typeof o.image === 'string' ? o.image : undefined,
      };
    }
    return { id: letterFor(index), text: String(option ?? '') };
  });
}

/**
 * `correctAnswer` may be an option id ("B"), the option text, or a bare letter.
 * Returns the matching option id, or the original value (as a string) when
 * nothing matches — never a guess.
 */
export function resolveCorrectAnswer(options: UniversalQuestionOption[], raw: unknown): string {
  if (typeof raw !== 'string') return raw === null || raw === undefined ? '' : String(raw);
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  const byId = options.find((o) => o.id === trimmed);
  if (byId) return byId.id;

  const byText = options.find((o) => o.text.trim() === trimmed);
  if (byText) return byText.id;

  const byIdIgnoringCase = options.find((o) => o.id.toLowerCase() === trimmed.toLowerCase());
  if (byIdIgnoringCase) return byIdIgnoringCase.id;

  return raw;
}
