import { useMemo, useState } from 'react';
import { Check, ListChecks, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { AvailableTopic } from '../../services/questionRepository';

interface TopicPickerModalProps {
  open: boolean;
  onClose: () => void;
  topics: AvailableTopic[];
  /** Topic id → number of named tests that include it (from the library). */
  testCounts: Map<string, number>;
  selectedIds: string[];
  onToggle: (topicId: string) => void;
  onClear: () => void;
  /** Open this topic's tests in the library. */
  onViewTests: (topicId: string) => void;
}

/**
 * Every topic of the subject in one searchable list — replaces the sideways-scrolling chip row.
 * Each row does two independent things: tick it to include the topic in Quick Practice, or jump to its
 * tests. Hidden library groups don't remove topics from this list.
 */
export function TopicPickerModal({ open, onClose, topics, testCounts, selectedIds, onToggle, onClear, onViewTests }: TopicPickerModalProps) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? topics.filter((t) => t.topicName.toLowerCase().includes(q)) : topics;
  }, [topics, query]);

  return (
    <Modal open={open} onClose={onClose} variant="sheet" size="lg" title="Browse topics" description={`${topics.length} topic${topics.length === 1 ? '' : 's'} — tick to practise them together, or open a topic's tests.`}>
      {topics.length > 8 && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            aria-label="Search topics"
            data-autofocus
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none border focus:border-brand-400"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No topic matches “{query}”.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Topics">
          {shown.map((t) => {
            const active = selectedIds.includes(t.topicId);
            const tests = testCounts.get(t.topicId) ?? 0;
            return (
              <li key={t.topicId} className="rounded-xl flex items-stretch overflow-hidden" style={{ border: `1.5px solid ${active ? 'var(--brand-500, #6366f1)' : 'var(--border)'}` }} data-testid="topic-option">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => onToggle(t.topicId)}
                  className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center ${active ? 'bg-brand-500 text-white' : ''}`} style={active ? undefined : { border: '1.5px solid var(--border)' }} aria-hidden>
                    {active && <Check size={12} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.topicName}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.questionCount} questions{tests > 0 && ` · ${tests} test${tests === 1 ? '' : 's'}`}</span>
                  </span>
                </button>
                {tests > 0 && (
                  <button
                    type="button"
                    onClick={() => onViewTests(t.topicId)}
                    aria-label={`View tests for ${t.topicName}`}
                    title="View tests"
                    className="px-3 flex items-center border-l hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <ListChecks size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 mt-4">
        <button type="button" onClick={onClear} disabled={selectedIds.length === 0} className="btn-ghost text-sm disabled:opacity-40">Clear selection</button>
        <button type="button" onClick={onClose} className="btn-primary text-sm py-2 px-6">{selectedIds.length > 0 ? `Done (${selectedIds.length} selected)` : 'Done'}</button>
      </div>
    </Modal>
  );
}
