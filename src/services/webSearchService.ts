// Powers the in-test "Search on Web" study assistant.
//
// Two independent sources are merged:
//
// 1. Wikipedia — public, keyless, CORS-enabled REST API. Works today with
//    zero setup. We do a quick full-text search first to resolve the best
//    matching article title from a natural-language question, then fetch
//    that article's summary.
//
// 2. General web results (incl. government-source detection) — real search
//    providers (Brave/Tavily/SerpAPI/etc.) require a secret key and mostly
//    block direct browser calls, so this goes through a Supabase Edge
//    Function instead. See supabase/functions/web-search/index.ts for the
//    one-time setup. Until that's deployed, this part is skipped gracefully
//    (Wikipedia still works) rather than erroring.
import { supabase, SUPABASE_ENABLED } from './supabaseClient';

export interface WikipediaSummary {
  title: string;
  extract: string;
  url: string;
  thumbnailUrl?: string;
}

export interface WebReference {
  title: string;
  url: string;
  snippet: string;
  source: string;
  isGovernmentSource?: boolean;
}

export interface WebSearchResult {
  query: string;
  wikipedia: WikipediaSummary | null;
  references: WebReference[];
  /** False if the web-search Edge Function isn't deployed/configured yet — Wikipedia may still be populated. */
  configured: boolean;
  fetchedAt: number;
}

// Session-only cache (cleared on reload) so re-opening the sheet for the
// same question doesn't re-fetch.
const cache = new Map<string, WebSearchResult>();

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function findWikipediaTitle(query: string, signal?: AbortSignal): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.query?.search?.[0]?.title ?? null;
}

async function fetchWikipediaSummary(query: string, signal?: AbortSignal): Promise<WikipediaSummary | null> {
  try {
    const title = await findWikipediaTitle(query, signal);
    if (!title) return null;
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === 'disambiguation' || !data.extract) return null;
    return {
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
      thumbnailUrl: data.thumbnail?.source,
    };
  } catch {
    // Network error, abort, or no matching page — this section is best-effort, fail quietly.
    return null;
  }
}

async function fetchWebReferences(query: string): Promise<{ references: WebReference[]; configured: boolean }> {
  if (!SUPABASE_ENABLED) return { references: [], configured: false };
  try {
    const { data, error } = await supabase.functions.invoke('web-search', { body: { query } });
    if (error || !data || data.error) return { references: [], configured: false };
    return { references: data.references ?? [], configured: true };
  } catch {
    return { references: [], configured: false };
  }
}

export async function searchWeb(query: string, signal?: AbortSignal): Promise<WebSearchResult> {
  const key = normalizeQuery(query);
  const cached = cache.get(key);
  if (cached) return cached;

  const [wikipedia, webResult] = await Promise.all([
    fetchWikipediaSummary(query, signal),
    fetchWebReferences(query),
  ]);

  const result: WebSearchResult = {
    query,
    wikipedia,
    references: webResult.references,
    configured: webResult.configured,
    fetchedAt: Date.now(),
  };
  cache.set(key, result);
  return result;
}

export function clearWebSearchCache(): void {
  cache.clear();
}
