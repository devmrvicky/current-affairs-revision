import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, Search, Trash2, ChevronRight, Filter, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useReaderStore } from '../store/readerStore';
import { EmptyState } from '../components/common/EmptyState';
import type { Highlight, HighlightColor } from '../types';

const COLOR_OPTIONS: { value: HighlightColor | 'all'; label: string; hex?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'yellow', label: 'Yellow', hex: '#facc15' },
  { value: 'green', label: 'Green', hex: '#4ade80' },
  { value: 'blue', label: 'Blue', hex: '#60a5fa' },
  { value: 'pink', label: 'Pink', hex: '#f472b6' },
  { value: 'orange', label: 'Orange', hex: '#fb923c' },
];

export default function MyHighlightsPage() {
  const navigate = useNavigate();
  const { highlights, notes, isLoading, loadAll, removeHighlight, updateHighlightColor } = useReaderStore();
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<HighlightColor | 'all'>('all');

  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => {
    let result = [...highlights];
    if (colorFilter !== 'all') result = result.filter((h) => h.color === colorFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((h) => h.text.toLowerCase().includes(q) || h.chapterId.toLowerCase().includes(q));
    }
    return result;
  }, [highlights, colorFilter, search]);

  // Group by chapter
  const grouped = useMemo(() => {
    const map = new Map<string, Highlight[]>();
    filtered.forEach((h) => {
      if (!map.has(h.chapterId)) map.set(h.chapterId, []);
      map.get(h.chapterId)!.push(h);
    });
    return Array.from(map.entries());
  }, [filtered]);

  async function handleDelete(id: string) {
    await removeHighlight(id);
    toast.success('Highlight removed');
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Highlighter size={20} className="text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            My Highlights
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {highlights.length} highlights · {notes.length} notes
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Highlighter size={18} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{highlights.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Highlights Created</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <BarChart2 size={18} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{notes.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Notes Saved</p>
          </div>
        </div>
      </div>

      {/* Search + Color filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search highlights..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColorFilter(c.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all flex-shrink-0 ${
                colorFilter === c.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-[var(--border)]'
              }`}
              style={colorFilter !== c.value ? { color: 'var(--text-secondary)' } : { color: 'var(--text-primary)' }}
            >
              {c.hex && <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.hex }} />}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {highlights.length === 0 ? (
        <EmptyState
          icon={<Highlighter size={28} className="text-amber-400" />}
          title="No highlights yet"
          description="Select text while reading any chapter to highlight important content."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={28} style={{ color: 'var(--text-muted)' }} />}
          title="No matches"
          description="Try a different search term or color filter."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([chapterId, items]) => (
            <div key={chapterId}>
              <button
                onClick={() => navigate(`/chapter/${encodeURIComponent(chapterId)}`)}
                className="flex items-center gap-2 mb-3 group"
              >
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {chapterId}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
                  {items.length}
                </span>
                <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
              </button>

              <div className="space-y-2">
                <AnimatePresence>
                  {items.map((h) => (
                    <motion.div
                      key={h.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="card p-3 flex items-start gap-3"
                    >
                      <div className={`flex-1 min-w-0 p-2 rounded-lg text-sm reader-highlight-${h.color}`} style={{ color: '#1a1a1a' }}>
                        {h.text}
                        {h.note && (
                          <p className="text-xs mt-1.5 italic" style={{ color: '#4a4a4a' }}>📝 {h.note}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {/* Color picker mini */}
                        <div className="flex gap-1">
                          {COLOR_OPTIONS.slice(1).map((c) => (
                            <button
                              key={c.value}
                              onClick={() => updateHighlightColor(h.id, c.value as HighlightColor)}
                              className={`w-4 h-4 rounded-full border ${h.color === c.value ? 'ring-2 ring-offset-1 ring-brand-500' : ''}`}
                              style={{ background: c.hex }}
                              title={c.label}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => handleDelete(h.id)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500 self-end"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
