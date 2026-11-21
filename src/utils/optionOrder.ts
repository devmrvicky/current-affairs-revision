import { shuffleArray } from './index';

/**
 * Display-order logic for answer options.
 *
 * Every time a question comes on screen its options are shown in a fresh random
 * order, so the right answer lands on a different position each time. This is a
 * DISPLAY concern only: answers are still stored and scored by option id (or
 * option text on the legacy quiz), never by position, so nothing stored or
 * scored changes.
 *
 * Some options only make sense in a fixed place, and shuffling them would make
 * the question wrong. Each option text is classified:
 *
 *  - 'positional'  points at OTHER options by position ("Option B", "Both of the
 *                  above", "Both options"). The question is left in its original
 *                  order — there is no correct way to reorder it.
 *  - 'pinned'      order-independent catch-alls ("All of the above", "None of
 *                  these", "Cannot be determined", "इनमें से कोई नहीं"). They stay
 *                  at the end, in their original order, while the rest shuffle.
 *  - 'free'        everything else — shuffled.
 *
 * Known limit: an option written as a bare "Both A and B" / "(a) and (c)" cannot
 * be told apart from one that points at items in the question stem, so it is
 * treated as a normal option.
 */

export type OptionKind = 'free' | 'pinned' | 'positional';

// JS `\b` is ASCII-only, so Hindi patterns avoid it and use Unicode lookaheads instead.
const PINNED: RegExp[] = [
  /\b(?:all|any)\s+of\s+(?:the\s+)?(?:above|these|them|those)\b/i,
  /\ball\s+(?:the\s+)?above\b/i,
  /\bnone\s+of\s+(?:the\s+)?(?:above|these|them|those)\b/i,
  /\bneither\s+of\s+(?:the\s+)?(?:above|these)\b/i,
  /\babove\s+(?:all|none)\b/i,
  /\b(?:cannot|can\s*not|can't)\s+be\s+(?:determined|said|found|decided)\b/i,
  /\b(?:data|information)\s+(?:is\s+|are\s+)?(?:inadequate|insufficient|not\s+sufficient)\b/i,
  /(?:उपरोक्त|उपर्युक्त)\s*(?:सभी|में\s*से\s*(?:कोई|सभी))/u,
  /सभी\s*(?:उपरोक्त|उपर्युक्त)/u,
  /ऊपर\s*(?:के|में\s*से)\s*(?:सभी|कोई)/u,
  /इनमे[ंँ]?\s*से\s*(?:कोई|सभी)/u,
  /निर्धारित\s*नहीं/u,
  /(?:डेटा|आंकड़े|आँकड़े)\s*अपर्याप्त/u,
];

const POSITIONAL: RegExp[] = [
  /\b(?:options?|choices?)\s*\(?\s*(?:[a-d]|[1-4]|iv|i{1,3})\s*\)?(?![\p{L}\p{N}])/iu,
  /\b(?:all|both|neither|none|either)\s+(?:of\s+)?(?:the\s+)?(?:options?|choices?)\b/i,
  /\b(?:first|second|third|fourth|last)\s+(?:(?:two|three)\s+)?(?:options?|choices?)\b/i,
  /\bboth\s+(?:of\s+)?(?:the\s+)?(?:above|these|them|those)\b/i,
  /विकल्प\s*\(?\s*(?:[a-dA-D]|[1-4]|[१-४])\s*\)?(?![\p{L}\p{N}])/u,
  /(?:सभी|दोनों|पहला|दूसरा|तीसरा|चौथा|अंतिम|आखिरी)\s*विकल्प/u,
  // Any other "above" in Hindi is a reference to the options listed before it.
  /उपरोक्त|उपर्युक्त/u,
];

export function classifyOptionText(text: string): OptionKind {
  if (PINNED.some((re) => re.test(text))) return 'pinned';
  if (POSITIONAL.some((re) => re.test(text))) return 'positional';
  return 'free';
}

/**
 * A fresh random display order, as a permutation of indices into `texts`
 * (result[displayPosition] = originalIndex). Uniform (Fisher–Yates) over the
 * shuffle-able options; falls back to the original order when any option is
 * positional. Never drops or duplicates an index.
 */
export function displayOrder(texts: readonly string[]): number[] {
  const indices = texts.map((_, i) => i);
  if (indices.length < 2) return indices;
  const kinds = texts.map(classifyOptionText);
  if (kinds.includes('positional')) return indices;
  const free = indices.filter((i) => kinds[i] === 'free');
  const pinned = indices.filter((i) => kinds[i] === 'pinned');
  return [...shuffleArray(free), ...pinned];
}

/** `options` in a fresh random display order. Returns a new array; never mutates `options`. */
export function shuffleOptionsForDisplay<T>(options: readonly T[], getText: (option: T) => string): T[] {
  return displayOrder(options.map(getText)).map((i) => options[i]);
}
