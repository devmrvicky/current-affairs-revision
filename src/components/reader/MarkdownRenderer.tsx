import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Highlight } from '../../types';

interface MarkdownRendererProps {
  content: string;
  highlights?: Highlight[];
  fontSize?: number;
  fontFamily?: 'serif' | 'sans' | 'mono';
  lineHeight?: number;
  maxWidth?: number;
  searchQuery?: string;
}

const FONT_FAMILY_MAP: Record<string, string> = {
  serif: "'Georgia', 'Sora', serif",
  sans: "'DM Sans', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

/**
 * Applies <mark> wrapping for highlighted text spans and search matches.
 * Works on rendered text nodes by simple string replace — safe because
 * highlight text is always a verbatim substring of the source markdown.
 */
function wrapHighlightsInText(text: string, highlights: Highlight[], searchQuery?: string): React.ReactNode {
  if (highlights.length === 0 && !searchQuery) return text;

  // Build a list of {start, end, type, color} ranges within this text node
  type Range = { start: number; end: number; kind: 'highlight' | 'search'; color?: string; id?: string };
  const ranges: Range[] = [];

  highlights.forEach((h) => {
    const idx = text.indexOf(h.text);
    if (idx !== -1) {
      ranges.push({ start: idx, end: idx + h.text.length, kind: 'highlight', color: h.color, id: h.id });
    }
  });

  if (searchQuery && searchQuery.trim().length > 1) {
    const q = searchQuery.toLowerCase();
    const lower = text.toLowerCase();
    let pos = 0;
    while (true) {
      const idx = lower.indexOf(q, pos);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + searchQuery.length, kind: 'search' });
      pos = idx + searchQuery.length;
    }
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start < cursor) return; // skip overlapping
    if (r.start > cursor) nodes.push(text.slice(cursor, r.start));
    const segment = text.slice(r.start, r.end);
    if (r.kind === 'highlight') {
      nodes.push(
        <mark key={`${r.id}-${i}`} className={`reader-highlight reader-highlight-${r.color}`} data-highlight-id={r.id}>
          {segment}
        </mark>
      );
    } else {
      nodes.push(
        <mark key={`search-${i}`} className="reader-highlight reader-highlight-yellow" style={{ outline: '2px solid #f59e0b' }}>
          {segment}
        </mark>
      );
    }
    cursor = r.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return nodes;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  highlights = [],
  fontSize = 16,
  fontFamily = 'sans',
  lineHeight = 1.7,
  maxWidth = 720,
  searchQuery,
}: MarkdownRendererProps) {
  return (
    <div
      className="prose-reader mx-auto"
      style={{
        fontSize: `${fontSize}px`,
        fontFamily: FONT_FAMILY_MAP[fontFamily],
        lineHeight,
        maxWidth: `${maxWidth}px`,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          p: ({ children }) => (
            <p>
              {typeof children === 'string'
                ? wrapHighlightsInText(children, highlights, searchQuery)
                : children}
            </p>
          ),
          li: ({ children }) => (
            <li>
              {Array.isArray(children)
                ? children.map((c, i) =>
                    typeof c === 'string' ? (
                      <span key={i}>{wrapHighlightsInText(c, highlights, searchQuery)}</span>
                    ) : (
                      c
                    )
                  )
                : typeof children === 'string'
                ? wrapHighlightsInText(children, highlights, searchQuery)
                : children}
            </li>
          ),
          td: ({ children }) => (
            <td>
              {typeof children === 'string'
                ? wrapHighlightsInText(children, highlights, searchQuery)
                : children}
            </td>
          ),
          th: ({ children }) => (
            <th>
              {typeof children === 'string'
                ? wrapHighlightsInText(children, highlights, searchQuery)
                : children}
            </th>
          ),
          blockquote: ({ children }) => (
            <blockquote>
              {Array.isArray(children)
                ? children.map((c, i) =>
                    typeof c === 'string' ? (
                      <span key={i}>{wrapHighlightsInText(c, highlights, searchQuery)}</span>
                    ) : (
                      c
                    )
                  )
                : typeof children === 'string'
                ? wrapHighlightsInText(children, highlights, searchQuery)
                : children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong>
              {typeof children === 'string'
                ? wrapHighlightsInText(children, highlights, searchQuery)
                : children}
            </strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
