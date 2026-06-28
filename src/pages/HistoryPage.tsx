import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useHistoryStore } from '../store/historyStore';
import { useQuizStore } from '../store/quizStore';
import { HistoryCard } from '../components/history/HistoryCard';
import { HistoryCardSkeleton } from '../components/common/Skeleton';
import { EmptyState, NoSearchResults } from '../components/common/EmptyState';
import type { SortOrder, SavedTest } from '../types';
import { loadQuizByFileName } from '../services/quizService';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const navigate = useNavigate();
  const { tests, isLoading, load, remove, filters, setFilters, getFiltered } = useHistoryStore();
  const { startSession } = useQuizStore();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => { load(); }, []);

  const filtered = getFiltered();

  // Reset how many are shown whenever the filtered set itself changes
  // (new search/sort/filter), rather than staying stuck mid-pagination.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters.search, filters.sortBy, tests.length]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  async function handleRevise(test: SavedTest) {
    try {
      // Load the original quiz file
      const quiz = await loadQuizByFileName(test.fileName);
      if (!quiz) {
        toast.error('Quiz file not found for this test');
        return;
      }
      startSession(quiz, test.fileName);
      // Mark as revision in session
      navigate('/quiz');
    } catch {
      toast.error('Failed to start revision');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove(id);
      toast.success('Test deleted');
      setDeleteConfirm(null);
    } catch {
      toast.error('Failed to delete test');
    }
  }

  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'highest', label: 'Highest Score' },
    { value: 'lowest', label: 'Lowest Score' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <History size={20} className="text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Test History</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {tests.length} saved test{tests.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search & Sort */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by date..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <select
          value={filters.sortBy}
          onChange={(e) => setFilters({ sortBy: e.target.value as SortOrder })}
          className="px-4 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors cursor-pointer"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <HistoryCardSkeleton key={i} />)}
        </div>
      ) : tests.length === 0 ? (
        <EmptyState
          title="No tests saved yet"
          description="Complete a quiz and save it to see your history here."
          action={
            <button onClick={() => navigate('/')} className="btn-primary">
              Start a Test
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <NoSearchResults query={filters.search} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {visible.map((test, i) => (
              <HistoryCard
                key={test.id}
                test={test}
                delay={i * 0.04}
                onView={() => navigate(`/history/${test.id}`)}
                onDelete={() => setDeleteConfirm(test.id)}
                onRevise={() => handleRevise(test)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="btn-ghost text-sm px-5 py-2"
          >
            Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Delete Test?</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                This action cannot be undone. Your results and analysis will be permanently deleted.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary text-sm py-2.5">
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
