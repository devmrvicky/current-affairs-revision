import { useState, useMemo } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { stripMarkdown } from '../../services/markdownRepository';

interface ChapterSearchProps {
  content: string;
  query: string;
  onQueryChange: (q: string) => void;
}

export function ChapterSearch({ content, query, onQueryChange }: ChapterSearchProps) {
  const matchCount = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return 0;
    const plain = stripMarkdown(content).toLowerCase();
    const q = query.toLowerCase();
    let count = 0;
    let pos = 0;
    while (true) {
      const idx = plain.indexOf(q, pos);
      if (idx === -1) break;
      count++;
      pos = idx + q.length;
    }
    return count;
  }, [content, query]);

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input
        type="text"
        placeholder="Search keywords, schemes, names, dates..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full pl-10 pr-20 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
      {query && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {matchCount > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          <button onClick={() => onQueryChange('')} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}
    </div>
  );
}
