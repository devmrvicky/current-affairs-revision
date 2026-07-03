// Powers the "✨ Generate Summary" reader feature.
//
// Generation itself happens server-side (supabase/functions/ai-summary) so
// the OpenRouter API key never ships to the browser — see that file for
// setup. This module owns:
//   - Persistent caching (IndexedDB, via aiSummaryDB) keyed by contentKey,
//     invalidated only when the source markdown's hash changes.
//   - Mapping every failure mode (offline, not configured, rate limited,
//     timeout, invalid key, empty/unparseable response, cancellation) to a
//     distinct status the UI can show a tailored message for.
import type { AiSummaryContent } from '../types';
import { supabase, SUPABASE_ENABLED } from './supabaseClient';
import { aiSummaryDB } from './db';
import { hashString } from '../utils';

export type AiSummaryStatus =
  | 'success'
  | 'no_internet'
  | 'not_configured'
  | 'invalid_key'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_error'
  | 'empty_response'
  | 'cancelled'
  | 'unknown_error';

export interface AiSummaryOutcome {
  status: AiSummaryStatus;
  summary: AiSummaryContent | null;
  /** True if this came from the local cache rather than a fresh API call. */
  fromCache: boolean;
  generatedAt: number | null;
}

const FRIENDLY_MESSAGES: Record<Exclude<AiSummaryStatus, 'success'>, string> = {
  no_internet: "You're offline. Connect to the internet and try again.",
  not_configured: 'AI Summary isn\'t set up yet — this needs an OpenRouter API key configured on the server.',
  invalid_key: 'The AI service isn\'t configured correctly (invalid API key). Please check the server setup.',
  rate_limited: 'Too many requests right now. Please wait a moment and try again.',
  timeout: 'The AI took too long to respond. Please try again.',
  upstream_error: 'The AI service is temporarily unavailable. Please try again shortly.',
  empty_response: "The AI didn't return a usable summary. Please try again.",
  cancelled: 'Cancelled.',
  unknown_error: 'Something went wrong generating the summary. Please try again.',
};

export function friendlyAiSummaryMessage(status: AiSummaryStatus): string {
  return status === 'success' ? '' : FRIENDLY_MESSAGES[status];
}

/**
 * Generate (or return a cached) AI summary for a piece of markdown content.
 *
 * @param contentKey  Stable identifier for this piece of content — reuse the
 *                     same reader key already used for highlights/notes/progress
 *                     (e.g. chapterName, or issueReaderKey(issue.issueKey)).
 * @param title        Short display title, passed to the model for context.
 * @param markdown     The raw markdown to summarize.
 * @param options.forceRegenerate  Bypass the cache even if it's still fresh.
 * @param options.signal            AbortSignal for cancellation (e.g. sheet closed mid-request).
 */
export async function getAiSummary(
  contentKey: string,
  title: string,
  markdown: string,
  options: { forceRegenerate?: boolean; signal?: AbortSignal } = {}
): Promise<AiSummaryOutcome> {
  const contentHash = hashString(markdown);

  if (!options.forceRegenerate) {
    const cached = await aiSummaryDB.get(contentKey);
    if (cached && cached.contentHash === contentHash) {
      return { status: 'success', summary: cached.summary, fromCache: true, generatedAt: cached.generatedAt };
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'no_internet', summary: null, fromCache: false, generatedAt: null };
  }

  if (!SUPABASE_ENABLED) {
    return { status: 'not_configured', summary: null, fromCache: false, generatedAt: null };
  }

  if (options.signal?.aborted) {
    return { status: 'cancelled', summary: null, fromCache: false, generatedAt: null };
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai-summary', {
      body: { content: markdown, title },
      signal: options.signal,
    });

    if (options.signal?.aborted) {
      return { status: 'cancelled', summary: null, fromCache: false, generatedAt: null };
    }
    if (error || !data) {
      return { status: 'upstream_error', summary: null, fromCache: false, generatedAt: null };
    }
    if (data.error) {
      const status: AiSummaryStatus = isKnownStatus(data.code) ? data.code : 'unknown_error';
      return { status, summary: null, fromCache: false, generatedAt: null };
    }
    if (!data.summary) {
      return { status: 'empty_response', summary: null, fromCache: false, generatedAt: null };
    }

    const generatedAt = Date.now();
    await aiSummaryDB.upsert({
      contentKey,
      contentHash,
      summary: data.summary,
      model: data.model ?? 'openrouter/free',
      generatedAt,
    });

    return { status: 'success', summary: data.summary, fromCache: false, generatedAt };
  } catch (err) {
    if (options.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { status: 'cancelled', summary: null, fromCache: false, generatedAt: null };
    }
    return { status: 'unknown_error', summary: null, fromCache: false, generatedAt: null };
  }
}

function isKnownStatus(code: unknown): code is AiSummaryStatus {
  return typeof code === 'string' && code in FRIENDLY_MESSAGES;
}

/** Formats a summary into plain text for Copy / Save-as-note. */
export function formatAiSummaryAsText(summary: AiSummaryContent): string {
  const section = (title: string, lines: string[]) =>
    lines.length ? `${title}\n${lines.map((l) => `• ${l}`).join('\n')}\n` : '';

  return [
    summary.shortSummary && `${summary.shortSummary}\n`,
    section('Key Points', summary.keyPoints),
    section('Exam Highlights', summary.examHighlights),
    section('Important Facts', summary.importantFacts),
    summary.revisionNotes && `Revision Notes\n${summary.revisionNotes}`,
  ].filter(Boolean).join('\n').trim();
}
