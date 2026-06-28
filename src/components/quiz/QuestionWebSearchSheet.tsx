import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Landmark, Globe, BookOpen } from 'lucide-react';
import { searchWeb, type WebSearchResult, type WebReference } from '../../services/webSearchService';

interface QuestionWebSearchSheetProps {
  isOpen: boolean;
  query: string;
  onClose: () => void;
}

function ReferenceCard({ item, accent }: { item: WebReference; accent: 'emerald' | 'brand' }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-xl border transition-colors hover:border-brand-300 dark:hover:border-brand-700"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <p className="text-sm font-medium mb-0.5 line-clamp-2" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
      {item.snippet && (
        <p className="text-xs mb-1.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{item.snippet}</p>
      )}
      <span className={`text-[11px] font-medium ${accent === 'emerald' ? 'text-emerald-500' : 'text-brand-500'}`}>
        {item.source} <ExternalLink size={9} className="inline -translate-y-px" />
      </span>
    </a>
  );
}

/**
 * In-app "Search on Web" assistant for the question currently being
 * attempted. Stays entirely within the quiz — never navigates away, never
 * touches quiz/session state. Draggable down to close, drag up to expand.
 */
export function QuestionWebSearchSheet({ isOpen, query, onClose }: QuestionWebSearchSheetProps) {
  const [result, setResult] = useState<WebSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen || !query) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    searchWeb(query, controller.signal).then((r) => {
      if (!cancelled) {
        setResult(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) setExpanded(false);
  }, [isOpen]);

  const govSources = result?.references.filter((r) => r.isGovernmentSource) ?? [];
  const otherSources = result?.references.filter((r) => !r.isGovernmentSource) ?? [];
  const isEmpty = !loading && result && !result.wikipedia && result.references.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.15, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
              else if (info.offset.y < -80) setExpanded(true);
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0, height: expanded ? '92vh' : '65vh' }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--card)' }}
          >
            <button
              onClick={() => setExpanded((v) => !v)}
              className="pt-3 pb-1 flex justify-center flex-shrink-0 w-full"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </button>
            <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Globe size={16} className="text-brand-500 flex-shrink-0" />
                <h3 className="font-display font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  Search on Web
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
              <p className="text-xs px-3 py-2 rounded-xl line-clamp-2" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
                {query}
              </p>

              {loading && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <div className="w-8 h-8 border-[3px] border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Searching the web…</p>
                </div>
              )}

              {!loading && result && (
                <>
                  {result.wikipedia && (
                    <div className="card p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen size={14} className="text-blue-500" />
                        <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>WIKIPEDIA</span>
                      </div>
                      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{result.wikipedia.title}</p>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.wikipedia.extract}</p>
                      <a
                        href={result.wikipedia.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-brand-500"
                      >
                        Read full article <ExternalLink size={11} />
                      </a>
                    </div>
                  )}

                  {govSources.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Landmark size={13} className="text-emerald-500" />
                        <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>GOVERNMENT SOURCES</span>
                      </div>
                      {govSources.map((r) => <ReferenceCard key={r.url} item={r} accent="emerald" />)}
                    </div>
                  )}

                  {otherSources.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Globe size={13} className="text-brand-500" />
                        <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>WEB REFERENCES &amp; RELATED COVERAGE</span>
                      </div>
                      {otherSources.map((r) => <ReferenceCard key={r.url} item={r} accent="brand" />)}
                    </div>
                  )}

                  {isEmpty && (
                    result?.configured ? (
                      <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
                        No results found for this question.
                      </p>
                    ) : (
                      <div className="text-center py-6 px-2">
                        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                          General web search isn't set up yet
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          Deploy the <code className="px-1 rounded" style={{ background: 'var(--border)' }}>web-search</code> Supabase function with a search API key to enable this (see README). Wikipedia results above, if any, already work with no setup.
                        </p>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
