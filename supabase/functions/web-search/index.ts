// supabase/functions/web-search/index.ts
//
// Server-side proxy for the in-test "Search on Web" study assistant.
//
// This MUST run server-side: real search APIs (Brave, Tavily, SerpAPI, Bing,
// etc.) require a secret key that should never ship to the browser, and
// most don't allow direct cross-origin calls from a browser anyway.
//
// Ships wired to the Brave Search API as a concrete, working example —
// swap fetchSearchResults() for whichever provider you have a key for.
// The request/response contract with the frontend (webSearchService.ts)
// stays the same either way: POST { query } -> { query, references }.
//
// Setup:
//   1. Get an API key, e.g. from https://brave.com/search/api/
//   2. supabase secrets set BRAVE_SEARCH_API_KEY=your-key-here
//   3. supabase functions deploy web-search --no-verify-jwt
//      (--no-verify-jwt because this is usable while signed out, same as
//      the rest of this app's quiz-taking features)
//
// No database access needed here, so unlike delete-account this function
// doesn't need the service-role key at all.

const BRAVE_API_KEY = Deno.env.get('BRAVE_SEARCH_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RawReference {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

const GOV_SOURCE_PATTERN = /\.(gov|gov\.in|nic\.in|gov\.uk|europa\.eu)$/i;

async function fetchSearchResults(query: string): Promise<RawReference[]> {
  if (!BRAVE_API_KEY) return [];

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
    { headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_API_KEY } },
  );
  if (!res.ok) throw new Error(`Search provider error: ${res.status}`);

  const data = await res.json();
  const results = (data?.web?.results ?? []) as Array<{ title: string; url: string; description?: string }>;

  return results.slice(0, 8).map((r) => {
    let hostname = '';
    try { hostname = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
    return {
      title: r.title,
      url: r.url,
      // Brave wraps matched terms in <strong> tags in the description — strip them.
      snippet: (r.description ?? '').replace(/<[^>]+>/g, ''),
      source: hostname,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let query = '';
  try {
    const body = await req.json();
    query = String(body?.query ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing "query"' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  query = query.slice(0, 300); // guard against pathological input

  try {
    const raw = await fetchSearchResults(query);
    const references = raw.map((r) => ({
      ...r,
      isGovernmentSource: GOV_SOURCE_PATTERN.test(r.source),
    }));
    return new Response(JSON.stringify({ query, references }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Search failed' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
