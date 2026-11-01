// ─── Question content classification (pure) ──────────────────────────────────
// Question, option and explanation strings come from many authors and eras. Most are
// plain text — which happens to contain characters Markdown treats as syntax:
//   "$1 is similar to … $1.06 million"   → read as an inline-math span
//   "# ∇ H $ % @"                        → read as a heading
//   "Y*Z का अर्थ है … A * B $ C"          → read as emphasis / math
// so pushing every string through a Markdown+math parser would silently corrupt content that
// renders correctly today. Instead each string is classified first:
//
//   'plain'    — shown exactly as written (line breaks kept, Hindi/Unicode untouched), no parsing.
//   'markdown' — carries unambiguous formatting or math, so it goes through the Markdown + KaTeX
//                pipeline, after currency-style `$` signs have been protected.
//
// Detection is deliberately conservative: when in doubt, plain. Raw HTML is never enabled
// (react-markdown renders it as inert text), so nothing here needs sanitising.

export type ContentKind = 'plain' | 'markdown';

/** True when the text between two `$` looks like a math expression rather than prose between two prices. */
export function looksLikeMath(inner: string): boolean {
  if (inner.length === 0 || inner.length > 160) return false;
  if (/^\s|\s$/.test(inner)) return false; // "$ 5 and $" — spaces hugging the delimiters means currency, not math
  if (/\\[a-zA-Z]+/.test(inner)) return true; // \frac, \sqrt, \times …
  if (/[\^_{}]/.test(inner)) return true; // x^2, a_1, {…}
  // A short, space-free-ish expression of symbols, digits and single letters: "2+3", "x=5", "a/b".
  const words = inner.split(/\s+/).filter(Boolean);
  const hasLongWord = words.some((w) => /[\p{L}]{3,}/u.test(w));
  return !hasLongWord && words.length <= 6 && /[=+\-−×÷*/<>≤≥]/.test(inner) && /[A-Za-z0-9]/.test(inner);
}

const DISPLAY_MATH = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/;
const INLINE_DOLLAR = /\$([^\n$]+?)\$/g;

function hasRealInlineMath(text: string): boolean {
  for (const m of text.matchAll(INLINE_DOLLAR)) if (looksLikeMath(m[1])) return true;
  return false;
}

const MARKDOWN_SIGNALS: RegExp[] = [
  /\*\*[^\s*][^*\n]*\*\*/, // **bold**
  /__[^\s_][^_\n]*__/, // __bold__
  /(^|[\s(])\*[^\s*][^*\n]*[^\s*]\*(?=$|[\s).,;:!?])/m, // *italic* (opening star must hug text — "A * B" doesn't count)
  /~~[^~\n]+~~/, // ~~strike~~
  /```/, // fenced code
  /(^|\n)\s*\|.+\|\s*\n\s*\|?\s*:?-{2,}/, // table with a header rule
  /!\[[^\]]*\]\([^)]+\)/, // image
  /\[[^\]\n]+\]\((https?:\/\/|asset:)[^)\s]+\)/, // link
  /(^|\n)>\s+\S/, // blockquote
];

/** A heading or bulleted list only counts when there is more than one line to give it structure. */
function hasBlockStructure(text: string): boolean {
  if (!text.includes('\n')) return false;
  return /(^|\n)#{1,6}\s+\S/.test(text) || /(^|\n)\s*[-*+]\s+\S[^\n]*\n\s*[-*+]\s+\S/.test(text);
}

export function classifyContent(text: string): ContentKind {
  if (!text) return 'plain';
  if (DISPLAY_MATH.test(text)) return 'markdown';
  if (hasRealInlineMath(text)) return 'markdown';
  if (MARKDOWN_SIGNALS.some((re) => re.test(text))) return 'markdown';
  if (hasBlockStructure(text)) return 'markdown';
  return 'plain';
}

/**
 * Markdown-bound text: every `$…$` pair that is NOT real math (currency, "$1 and $2") is escaped so the
 * math parser leaves it alone. Display math (`$$…$$`) is left exactly as authored.
 */
export function protectCurrency(text: string): string {
  return text.replace(/(\$\$[\s\S]+?\$\$)|\$([^\n$]+?)\$/g, (match, display: string | undefined, inner: string | undefined) => {
    if (display) return match;
    return looksLikeMath(inner ?? '') ? match : match.replace(/\$/g, '\\$');
  });
}

/**
 * Authors write display math as a single line — `$$\frac{a}{b}$$` on a line of its own — but the math parser
 * only treats `$$` as a *block* when the fences sit on their own lines (a one-line `$$…$$` is read as inline math
 * and loses its display size). A `$$…$$` that fills a whole line is expanded to the fenced form.
 */
export function expandDisplayMath(text: string): string {
  return text.replace(/(^|\n)[ \t]*\$\$([^\n$][^\n]*?)\$\$[ \t]*(?=\n|$)/g, (_m, lead: string, body: string) => `${lead}$$\n${body}\n$$`);
}

/** Everything Markdown-bound text needs before parsing: currency protected, one-line display math expanded. */
export function prepareMarkdown(text: string): string {
  return expandDisplayMath(protectCurrency(text));
}
