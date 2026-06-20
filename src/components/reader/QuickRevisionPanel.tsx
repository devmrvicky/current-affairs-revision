import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListTree, Sparkles, ChevronRight, FileDown } from 'lucide-react';
import type { Highlight, ReaderNote } from '../../types';

interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

interface QuickRevisionPanelProps {
  content: string;
  highlights: Highlight[];
  notes: ReaderNote[];
  onJumpToHeading?: (id: string) => void;
  onExamMode: () => void;
}

function extractOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split('\n');
  const items: OutlineItem[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*_`]/g, '').trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
      items.push({ level, text, id });
    }
  }
  return items;
}

export function QuickRevisionPanel({ content, highlights, notes, onJumpToHeading, onExamMode }: QuickRevisionPanelProps) {
  const [tab, setTab] = useState<'outline' | 'highlights'>('outline');
  const outline = useMemo(() => extractOutline(content), [content]);

  return (
    <div className="card p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <ListTree size={16} className="text-brand-500" />
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Quick Revision
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background: 'var(--border)' }}>
        <button
          onClick={() => setTab('outline')}
          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tab === 'outline' ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400' : ''
          }`}
          style={tab !== 'outline' ? { color: 'var(--text-secondary)' } : undefined}
        >
          Key Points
        </button>
        <button
          onClick={() => setTab('highlights')}
          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tab === 'highlights' ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400' : ''
          }`}
          style={tab !== 'highlights' ? { color: 'var(--text-secondary)' } : undefined}
        >
          Highlights ({highlights.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'outline' ? (
          <motion.div
            key="outline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-0.5"
          >
            {outline.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No headings found</p>
            ) : (
              outline.map((item, i) => (
                <button
                  key={i}
                  onClick={() => onJumpToHeading?.(item.id)}
                  className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-white/10 transition-colors ${
                    item.level === 1 ? 'font-bold' : item.level === 2 ? 'font-medium pl-4' : 'pl-6'
                  }`}
                  style={{ color: item.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  <ChevronRight size={10} className="flex-shrink-0 opacity-50" />
                  <span className="truncate">{item.text}</span>
                </button>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="highlights"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {highlights.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No highlights yet. Select text to highlight.</p>
            ) : (
              highlights.slice(0, 8).map((h) => (
                <div
                  key={h.id}
                  className={`p-2 rounded-lg text-xs reader-highlight-${h.color}`}
                  style={{ color: '#1a1a1a' }}
                >
                  {h.text.slice(0, 80)}{h.text.length > 80 ? '…' : ''}
                </div>
              ))
            )}
            {notes.length > 0 && (
              <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  📝 Notes ({notes.length})
                </p>
                {notes.slice(0, 3).map((n) => (
                  <p key={n.id} className="text-xs mb-1.5 p-2 rounded-lg" style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                    {n.text}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exam Revision Mode CTA */}
      {(highlights.length > 0 || notes.length > 0) && (
        <button
          onClick={onExamMode}
          className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500"
        >
          <Sparkles size={13} />
          Exam Revision Mode
        </button>
      )}
    </div>
  );
}
