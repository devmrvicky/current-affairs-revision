import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, Copy, BookmarkPlus, RotateCcw, WifiOff,
  AlertTriangle, Clock, ServerCrash, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAiSummary, formatAiSummaryAsText, friendlyAiSummaryMessage, type AiSummaryOutcome } from '../../services/aiSummaryService';

interface AiSummarySheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Stable identifier for this content — reuse the same reader key already used for highlights/notes. */
  contentKey: string;
  title: string;
  markdown: string;
  /** Called with the formatted summary text when the user taps Save — wire this to the reader's addNote(). */
  onSaveAsNote: (text: string) => void;
}

const ERROR_ICONS: Record<string, React.ReactNode> = {
  no_internet: <WifiOff size={28} />,
  not_configured: <ServerCrash size={28} />,
  invalid_key: <ServerCrash size={28} />,
  rate_limited: <Clock size={28} />,
  timeout: <Clock size={28} />,
  upstream_error: <ServerCrash size={28} />,
  empty_response: <AlertTriangle size={28} />,
  unknown_error: <AlertTriangle size={28} />,
};

// Configuration errors need a fix on the server, not a retry from the reader.
const NON_RETRYABLE = new Set(['not_configured', 'invalid_key']);

export function AiSummarySheet({ isOpen, onClose, contentKey, title, markdown, onSaveAsNote }: AiSummarySheetProps) {
  const [outcome, setOutcome] = useState<AiSummaryOutcome | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function runGenerate(forceRegenerate: boolean) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    const result = await getAiSummary(contentKey, title, markdown, { forceRegenerate, signal: controller.signal });
    if (controller.signal.aborted) return; // sheet closed / superseded — don't update state
    setIsLoading(false);
    setOutcome(result);
  }

  useEffect(() => {
    if (isOpen) {
      runGenerate(false);
    } else {
      abortRef.current?.abort();
    }
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contentKey]);

  function handleCopy() {
    if (!outcome?.summary) return;
    navigator.clipboard.writeText(formatAiSummaryAsText(outcome.summary))
      .then(() => toast.success('Copied!', { duration: 1200 }))
      .catch(() => toast.error('Could not copy'));
  }

  function handleSave() {
    if (!outcome?.summary) return;
    onSaveAsNote(formatAiSummaryAsText(outcome.summary));
    toast.success('Saved as a note!');
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[150] rounded-t-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            style={{ background: 'var(--card)' }}
          >
            <div className="pt-3 pb-1 flex justify-center flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
              <h3 className="font-display font-semibold text-sm flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Sparkles size={15} className="text-brand-500" /> AI Summary
              </h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Close">
                <X size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div className="px-5 pb-6 overflow-y-auto flex-1">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <Loader2 size={28} className="animate-spin text-brand-500" />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Generating your summary…</p>
                </div>
              ) : !outcome || outcome.status !== 'success' || !outcome.summary ? (
                <div className="py-10 flex flex-col items-center gap-3 text-center">
                  <div style={{ color: 'var(--text-muted)' }}>
                    {ERROR_ICONS[outcome?.status ?? 'unknown_error']}
                  </div>
                  <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                    {outcome ? friendlyAiSummaryMessage(outcome.status) : 'Something went wrong.'}
                  </p>
                  {!NON_RETRYABLE.has(outcome?.status ?? '') && (
                    <button onClick={() => runGenerate(true)} className="btn-primary text-sm py-2 px-5 mt-1">
                      Try Again
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {outcome.summary.shortSummary && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {outcome.summary.shortSummary}
                    </p>
                  )}

                  <SummarySection title="Key Points" items={outcome.summary.keyPoints} />
                  <SummarySection title="Exam Highlights" items={outcome.summary.examHighlights} accent />
                  <SummarySection title="Important Facts" items={outcome.summary.importantFacts} />

                  {outcome.summary.revisionNotes && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                        Revision Notes
                      </p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap p-3 rounded-xl" style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                        {outcome.summary.revisionNotes}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleCopy} className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-sm py-2.5">
                      <Copy size={14} /> Copy
                    </button>
                    <button onClick={handleSave} className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-sm py-2.5">
                      <BookmarkPlus size={14} /> Save
                    </button>
                    <button onClick={() => runGenerate(true)} className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-sm py-2.5">
                      <RotateCcw size={14} /> Regenerate
                    </button>
                  </div>
                  {outcome.fromCache && (
                    <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                      Showing a saved summary — tap Regenerate for a fresh one.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SummarySection({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-snug flex gap-2" style={{ color: 'var(--text-secondary)' }}>
            <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${accent ? 'bg-amber-500' : 'bg-brand-400'}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
