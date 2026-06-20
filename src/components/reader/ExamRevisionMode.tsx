import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, StickyNote } from 'lucide-react';
import type { Highlight, ReaderNote } from '../../types';

interface ExamRevisionModeProps {
  chapterName: string;
  highlights: Highlight[];
  notes: ReaderNote[];
  onClose: () => void;
}

export function ExamRevisionMode({ chapterName, highlights, notes, onClose }: ExamRevisionModeProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] overflow-y-auto"
        style={{ background: 'var(--bg)' }}
      >
        <header className="sticky top-0 z-10 glass border-b border-[var(--border)]">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              <h1 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
                Exam Revision · {chapterName}
              </h1>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
          {highlights.length === 0 && notes.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles size={32} className="mx-auto mb-3 text-amber-400" />
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No highlights or notes yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Highlight important text while reading to build your revision summary.
              </p>
            </div>
          ) : (
            <>
              {highlights.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                    Important Facts ({highlights.length})
                  </h2>
                  <div className="space-y-2">
                    {highlights.map((h, i) => (
                      <motion.div
                        key={h.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`p-3 rounded-xl reader-highlight-${h.color} text-sm leading-relaxed`}
                        style={{ color: '#1a1a1a' }}
                      >
                        {h.text}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {notes.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <StickyNote size={13} /> Your Notes ({notes.length})
                  </h2>
                  <div className="space-y-3">
                    {notes.map((n, i) => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="card p-3"
                      >
                        <p className="text-xs italic mb-2 px-2 py-1 rounded" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                          "{n.anchorText.slice(0, 80)}{n.anchorText.length > 80 ? '…' : ''}"
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{n.text}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
