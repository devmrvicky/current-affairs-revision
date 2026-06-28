import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark, Search, Play, Trash2, BookMarked,
  ChevronDown, ChevronUp, X, Download, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useQuizStore } from '../store/quizStore';
import { EmptyState } from '../components/common/EmptyState';
import { getOptionLabel, formatRelativeDate } from '../utils';
import type { BookmarkedQuestion } from '../types';

// ─── Single bookmark card ─────────────────────────────────────────────────────

const BookmarkCard = memo(function BookmarkCard({
  bq, onRemove
}: { bq: BookmarkedQuestion; onRemove: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="card p-4 border-l-4 border-l-purple-400"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
              {bq.sourceDate}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatRelativeDate(bq.bookmarkedAt)}
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {bq.question}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            {expanded
              ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            }
          </button>
          <button
            onClick={() => onRemove(bq.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5">
              {bq.options.map((opt, idx) => {
                const isCorrect = opt === bq.correctAnswer;
                return (
                  <div
                    key={opt}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm ${
                      isCorrect
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700'
                        : 'border border-transparent'
                    }`}
                    style={!isCorrect ? { color: 'var(--text-secondary)' } : undefined}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isCorrect ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/10'
                    }`}
                    style={!isCorrect ? { color: 'var(--text-secondary)' } : undefined}>
                      {getOptionLabel(idx)}
                    </span>
                    {opt}
                    {isCorrect && <span className="ml-auto text-xs font-bold text-green-600 dark:text-green-400">✓ Correct</span>}
                  </div>
                );
              })}
            </div>

            {bq.explanation && (
              <div className="mt-3 px-3 py-2.5 rounded-xl border" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Explanation</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{bq.explanation}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function BookmarkedQuestionsPage() {
  const navigate = useNavigate();
  const { bookmarks, isLoading, load, remove, clearAll, toQuizQuestions } = useBookmarkStore();
  const { startSession } = useQuizStore();

  const [search, setSearch] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return bookmarks;
    const q = search.toLowerCase();
    return bookmarks.filter(
      (b) => b.question.toLowerCase().includes(q) || b.sourceDate.toLowerCase().includes(q)
    );
  }, [bookmarks, search]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search]);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const handleRemove = useCallback(async (id: string) => {
    await remove(id);
    toast.success('Bookmark removed');
  }, [remove]);

  async function handleStartRevision() {
    if (bookmarks.length === 0) return;
    const questions = toQuizQuestions();
    const quiz = {
      date: 'Bookmarked Questions',
      questions,
    };
    startSession(quiz, 'bookmarks_revision.json');
    navigate('/quiz');
  }

  async function handleClearAll() {
    await clearAll();
    setShowClearConfirm(false);
    toast.success('All bookmarks cleared');
  }

  function handleExport() {
    const data = bookmarks.map((b) => ({
      question: b.question,
      options: b.options,
      correctAnswer: b.correctAnswer,
      explanation: b.explanation,
      source: b.sourceDate,
      bookmarkedAt: new Date(b.bookmarkedAt).toLocaleDateString(),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${bookmarks.length} bookmarks`);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 h-20 shimmer" style={{ background: 'var(--border)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Bookmark size={20} className="text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              Bookmarks
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {bookmarks.length} saved question{bookmarks.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {bookmarks.length > 0 && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleExport}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Export bookmarks"
            >
              <Download size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-400 hover:text-red-500"
              title="Clear all bookmarks"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Start Revision CTA */}
      {bookmarks.length > 0 && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStartRevision}
          className="w-full card p-4 flex items-center gap-4 text-left border-l-4 border-l-purple-400 hover:shadow-lg transition-shadow"
        >
          <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <Play size={20} className="text-purple-500" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              Start Bookmark Revision
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Quiz yourself on all {bookmarks.length} bookmarked questions
            </p>
          </div>
          <span className="w-8 h-8 rounded-full bg-purple-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
            {bookmarks.length}
          </span>
        </motion.button>
      )}

      {/* Search */}
      {bookmarks.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search bookmarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-purple-400 transition-colors"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {/* Content */}
      {bookmarks.length === 0 ? (
        <EmptyState
          icon={<BookMarked size={28} className="text-purple-400" />}
          title="No bookmarks yet"
          description="Tap the bookmark icon on any question during a quiz to save it here for later revision."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={28} style={{ color: 'var(--text-muted)' }} />}
          title="No results"
          description={`No bookmarks match "${search}"`}
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {visible.map((bq) => (
              <BookmarkCard key={bq.id} bq={bq} onRemove={handleRemove} />
            ))}
          </AnimatePresence>
          {hasMore && (
            <div className="flex justify-center pt-3">
              <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="btn-ghost text-sm px-5 py-2">
                Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Clear All Confirm Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <h3 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                  Clear All Bookmarks?
                </h3>
              </div>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                This will permanently delete all {bookmarks.length} bookmarks. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 btn-secondary text-sm py-2.5">
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
