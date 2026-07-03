// supabase/functions/ai-summary/index.ts
//
// Server-side proxy for the "✨ Generate Summary" reader feature.
//
// This MUST run server-side: the OpenRouter API key is a secret that should
// never ship to the browser (Vite inlines any VITE_-prefixed env var into
// the public JS bundle, so it can't live there).
//
// Uses OpenRouter's Free Models Router (`openrouter/free`) rather than a
// specific `:free`-suffixed model — OpenRouter's free-model catalog churns
// frequently (specific models are added/removed on the order of weeks), so
// hardcoding one is a maintenance trap. The router automatically picks a
// currently-available free model for each request instead.
//
// Setup:
//   1. Create a key at https://openrouter.ai/settings/keys (free, no card)
//   2. supabase secrets set OPENROUTER_API_KEY=your-key-here
//   3. supabase functions deploy ai-summary --no-verify-jwt
//      (--no-verify-jwt because this is usable while signed out, same as
//      the rest of this app's quiz-taking features)
//
// No database access needed here, so this function doesn't need the
// service-role key at all — same shape as web-search/index.ts.

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_MODEL = 'openrouter/free';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_INPUT_CHARS = 16_000; // generous for a revision note, bounded against pathological input

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AiSummaryContent {
  shortSummary: string;
  keyPoints: string[];
  examHighlights: string[];
  importantFacts: string[];
  revisionNotes: string;
}

type ErrorCode =
  | 'invalid_input' | 'not_configured' | 'invalid_key'
  | 'rate_limited' | 'timeout' | 'upstream_error' | 'empty_response';

function errorResponse(code: ErrorCode, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `You are an expert study assistant for Indian competitive government exam preparation (SSC, Railway, Banking, UPSC, State PCS, and similar exams). You will be given revision notes in Markdown. Produce a structured summary to help a student revise quickly before an exam.

Respond in the SAME language as the source notes (if they're in Hindi, respond in Hindi; if English, respond in English).

Return ONLY a single JSON object with exactly this shape, no other text before or after it:
{
  "shortSummary": "a 2-3 sentence overview of the material",
  "keyPoints": ["concise bullet point", "..."],
  "examHighlights": ["facts or angles especially likely to appear as exam questions", "..."],
  "importantFacts": ["specific dates, numbers, names, or figures worth memorizing", "..."],
  "revisionNotes": "a short, dense block of text suitable for last-minute revision"
}

Keep keyPoints, examHighlights, and importantFacts to at most 8 items each. Only use facts present in the source material — never invent or guess at content that isn't there.`;

/** Best-effort JSON extraction from a chat completion's text. Model output
 * is occasionally wrapped in a markdown code fence, or has stray text
 * around the JSON object — this recovers from both before giving up. */
function extractJson(raw: string): unknown | null {
  const attempts = [
    raw.trim(),
    raw.replace(/```json\s*|```\s*/gi, '').trim(),
    raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1),
  ];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try { return JSON.parse(attempt); } catch { /* try next */ }
  }
  return null;
}

function normalizeSummary(parsed: unknown, rawFallback: string): AiSummaryContent {
  const obj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : null;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : [];

  if (!obj) {
    // Model didn't return valid JSON at all — degrade gracefully rather than
    // erroring: surface its raw text as the revision notes so the feature
    // still produces *something* usable instead of a hard failure.
    return { shortSummary: '', keyPoints: [], examHighlights: [], importantFacts: [], revisionNotes: rawFallback.trim() };
  }
  return {
    shortSummary: typeof obj.shortSummary === 'string' ? obj.shortSummary : '',
    keyPoints: asStringArray(obj.keyPoints),
    examHighlights: asStringArray(obj.examHighlights),
    importantFacts: asStringArray(obj.importantFacts),
    revisionNotes: typeof obj.revisionNotes === 'string' ? obj.revisionNotes : '',
  };
}

async function callOpenRouter(content: string, title: string): Promise<AiSummaryContent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'Current Affairs Revision App',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Title: ${title || '(untitled)'}\n\n${content}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw Object.assign(new Error('Request to OpenRouter timed out'), { code: 'timeout' as ErrorCode });
    }
    throw Object.assign(new Error('Could not reach OpenRouter'), { code: 'upstream_error' as ErrorCode });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('OpenRouter rejected the API key'), { code: 'invalid_key' as ErrorCode });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('OpenRouter rate limit reached — please wait a moment and try again'), { code: 'rate_limited' as ErrorCode });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`OpenRouter error: ${res.status}`), { code: 'upstream_error' as ErrorCode });
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw Object.assign(new Error('OpenRouter returned an empty response'), { code: 'empty_response' as ErrorCode });
  }

  const parsed = extractJson(text);
  return normalizeSummary(parsed, text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse('invalid_input', 'Method not allowed', 405);
  }

  if (!OPENROUTER_API_KEY) {
    return errorResponse('not_configured', 'AI Summary is not configured on the server yet.', 500);
  }

  let content = '';
  let title = '';
  try {
    const body = await req.json();
    content = String(body?.content ?? '').trim();
    title = String(body?.title ?? '').trim();
  } catch {
    return errorResponse('invalid_input', 'Invalid JSON body', 400);
  }

  if (!content) {
    return errorResponse('invalid_input', 'Missing "content"', 400);
  }
  content = content.slice(0, MAX_INPUT_CHARS);

  try {
    const summary = await callOpenRouter(content, title);
    return new Response(JSON.stringify({ summary, model: OPENROUTER_MODEL }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const code = (err as { code?: ErrorCode })?.code ?? 'upstream_error';
    const message = err instanceof Error ? err.message : 'Failed to generate summary';
    const status = code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : 502;
    return errorResponse(code, message, status);
  }
});
