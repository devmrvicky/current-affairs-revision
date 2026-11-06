// ─── Turning an explanation into something a speech engine can read ──────────
// Pure functions, no browser APIs: unit-testable in Node.
//
// Explanations are Markdown with optional KaTeX ($x^2$, $$…$$) — speaking the raw
// text would read out asterisks, hashes and TeX commands. This strips the markup
// down to prose, decides which language each sentence is in, and cuts the result
// into utterance-sized pieces (Chrome silently stops long utterances).

export type SpeechLang = 'hi' | 'en';

export interface SpeechSegment {
  lang: SpeechLang;
  text: string;
}

const DEVANAGARI = /[\u0900-\u097F]/g;
const LATIN = /[A-Za-z]/g;

/** Counts of letters by script. Digits, punctuation and symbols belong to neither. */
export function scriptCounts(text: string): { hi: number; en: number } {
  return { hi: (text.match(DEVANAGARI) ?? []).length, en: (text.match(LATIN) ?? []).length };
}

/**
 * The language that dominates the text, by letter count. Returns null when there are
 * no letters at all (e.g. only numbers) — the caller decides what to do, nothing is guessed.
 */
export function detectPrimaryLanguage(text: string): SpeechLang | null {
  const { hi, en } = scriptCounts(text);
  if (hi === 0 && en === 0) return null;
  return hi >= en ? 'hi' : 'en';
}

/** Removes Markdown / KaTeX / HTML syntax, leaving readable prose. */
export function toSpeakableText(markdown: string): string {
  let t = markdown ?? '';
  t = t.replace(/```[\s\S]*?```/g, ' ');                      // fenced code
  t = t.replace(/\$\$[\s\S]*?\$\$/g, ' ');                    // block math — not readable aloud
  t = t.replace(/\$([^$\n]+)\$/g, (_m, inner: string) => latexToWords(inner)); // inline math, best-effort
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');                // images
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');              // links → their text
  t = t.replace(/<[^>]+>/g, ' ');                             // HTML tags
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');                   // headings
  t = t.replace(/^\s*>\s?/gm, '');                            // blockquotes
  t = t.replace(/^\s*[-*+]\s+/gm, '');                        // bullets
  t = t.replace(/^\s*\d+[.)]\s+/gm, '');                      // numbered list markers
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');                   // bold
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');                      // italic
  t = t.replace(/`([^`]*)`/g, '$1');                          // inline code
  t = t.replace(/^\|?[\s:|-]+\|?$/gm, ' ');                   // table separators
  t = t.replace(/\|/g, ', ');                                 // table cells
  t = t.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return t;
}

/** Minimal, honest LaTeX → words: handles the common cases, drops what it can't read rather than mispronouncing it. */
export function latexToWords(tex: string): string {
  return tex
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2')
    .replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1')
    .replace(/\^\{?2\}?/g, ' squared')
    .replace(/\^\{?3\}?/g, ' cubed')
    .replace(/\^\{?([^}\s]+)\}?/g, ' to the power $1')
    .replace(/\\times|\\cdot/g, ' times ')
    .replace(/\\div/g, ' divided by ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\le(q)?\b/g, ' less than or equal to ')
    .replace(/\\ge(q)?\b/g, ' greater than or equal to ')
    .replace(/\\neq/g, ' not equal to ')
    .replace(/\\%/g, ' percent ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/=/g, ' equals ')
    .replace(/\+/g, ' plus ')
    .replace(/(?<=\s|^)-(?=\s|\d)/g, ' minus ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sentence split that understands the Devanagari danda (।) as well as . ! ? and newlines. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।॥])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Splits prose into runs of a single language. A sentence takes the language that dominates it;
 * a sentence with no letters (a bare number) joins the run before it. Adjacent same-language
 * sentences are merged so the engine gets fewer, more natural utterances.
 */
export function segmentByLanguage(text: string, fallback: SpeechLang = 'en'): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const sentence of splitSentences(text)) {
    const lang = detectPrimaryLanguage(sentence) ?? out[out.length - 1]?.lang ?? fallback;
    const last = out[out.length - 1];
    if (last && last.lang === lang) last.text += ' ' + sentence;
    else out.push({ lang, text: sentence });
  }
  return out;
}

/** Cuts a segment into pieces no longer than maxLen, preferring sentence then comma then word boundaries. */
export function chunkText(text: string, maxLen = 180): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    const window = rest.slice(0, maxLen);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('। '), window.lastIndexOf('! '), window.lastIndexOf('? '));
    if (cut < maxLen * 0.4) cut = Math.max(cut, window.lastIndexOf(', '), window.lastIndexOf('; '));
    if (cut < maxLen * 0.4) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = maxLen - 1; // one unbroken token: hard cut
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

export interface Utterance {
  lang: SpeechLang;
  text: string;
}

/** Markdown → ordered list of utterances, each in one language and short enough to be spoken reliably. */
export function planUtterances(markdown: string): Utterance[] {
  const prose = toSpeakableText(markdown);
  const primary = detectPrimaryLanguage(prose) ?? 'en';
  return segmentByLanguage(prose, primary).flatMap((seg) => chunkText(seg.text).map((text) => ({ lang: seg.lang, text })));
}
