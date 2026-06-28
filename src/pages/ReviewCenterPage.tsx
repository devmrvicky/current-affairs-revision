import { useEffect, useState, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark, XCircle, Flag, Trash2, ArrowLeft, CheckCircle2,
  Sparkles, ListChecks
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { EmptyState } from '../components/common/EmptyState';
import { formatRelativeDate } from '../utils';

type ReviewTab = 'bookmarked' | 'wrong' | 'marked';

interface CommonItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sourceLabel: string;
  timestamp: number;
  meta?: string;
}

interface ReviewItemCardProps {
  item: CommonItem;
  accentClass: string;
  onRemove: (id: string) => void;
  delay: number;
}

const ReviewItemCard = memo(function ReviewItemCard({ item, accentClass, onRemove, delay }: ReviewItemCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`card p-4 border-l-4 ${accentClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button className="flex-1 text-left min-w-0" onClick={() => setExpanded((e) => !e)}>
          <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {item.question}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{item.sourceLabel}</span>
            <span>·</span>
            <span>{formatRelativeDate(item.timestamp)}</span>
            {item.meta && (
              <>
                <span>·</span>
                <span>{item.meta}</span>
              </>
            )}
          </div>
        </button>
        <button
          onClick={() => onRemove(item.id)}
          className="p-2 rounded-xl text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors flex-shrink-0"
          title="Remove"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {item.options.map((opt) => {
                const isCorrect = opt === item.correctAnswer;
                return (
                  <div
                    key={opt}
                    className={`px-3 py-2 rounded-lg text-sm border ${
                      isCorrect
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'border-transparent'
                    }`}
                    style={!isCorrect ? { color: 'var(--text-secondary)' } : undefined}
                  >
                    {isCorrect && '✓ '}{opt}
                  </div>
                );
              })}
            </div>
            {item.explanation && (
              <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Explanation: </strong>{item.explanation}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const PAGE_SIZE = 20;

export default function ReviewCenterPage() {
  const navigate = useNavigate();
  const { bookmarks, isLoading: loadingBookmarks, load: loadBookmarks, remove: removeBookmark } = useBookmarkStore();
  const { questions: wrongQuestions, isLoading: loadingWrong, load: loadWrong, dismiss: dismissWrong } = useWrongQuestionsStore();
  const { items: markedItems, isLoading: loadingMarked, load: loadMarked, remove: removeMarked } = useMarkedReviewStore();

  const [tab, setTab] = useState<ReviewTab>('bookmarked');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    loadBookmarks();
    loadWrong();
    loadMarked();
  }, []);

  const isLoading = loadingBookmarks || loadingWrong || loadingMarked;

  const bookmarkedItems: CommonItem[] = useMemo(() => bookmarks.map((b) => ({
    id: b.id, question: b.question, options: b.options, correctAnswer: b.correctAnswer,
    explanation: b.explanation, sourceLabel: b.sourceDate, timestamp: b.bookmarkedAt,
  })), [bookmarks]);

  const wrongItems: CommonItem[] = useMemo(() => wrongQuestions.map((w) => ({
    id: w.id, question: w.question, options: w.options, correctAnswer: w.correctAnswer,
    explanation: w.explanation, sourceLabel: w.displayDate, timestamp: w.lastAttemptAt,
    meta: w.status === 'mastered' ? 'Mastered ✓' : `Wrong ${w.wrongCount}×`,
  })), [wrongQuestions]);

  const markedReviewItems: CommonItem[] = useMemo(() => markedItems.map((m) => ({
    id: m.id, question: m.question, options: m.options, correctAnswer: m.correctAnswer,
    explanation: m.explanation, sourceLabel: m.sourceDate, timestamp: m.markedAt,
  })), [markedItems]);

  function handleRemove(id: string) {
    if (tab === 'bookmarked') { removeBookmark(id); toast.success('Removed bookmark'); }
    else if (tab === 'wrong') { dismissWrong(id); toast.success('Removed from wrong questions'); }
    else { removeMarked(id); toast.success('Removed mark'); }
  }

  const tabs: { key: ReviewTab; label: string; icon: React.ReactNode; count: number; accent: string }[] = [
    { key: 'bookmarked', label: 'Bookmarked', icon: <Bookmark size={14} />, count: bookmarkedItems.length, accent: 'border-l-purple-500' },
    { key: 'wrong', label: 'Wrong Questions', icon: <XCircle size={14} />, count: wrongItems.length, accent: 'border-l-red-500' },
    { key: 'marked', label: 'Marked For Review', icon: <Flag size={14} />, count: markedReviewItems.length, accent: 'border-l-amber-500' },
  ];

  const activeItems = tab === 'bookmarked' ? bookmarkedItems : tab === 'wrong' ? wrongItems : markedReviewItems;
  const activeAccent = tabs.find((t) => t.key === tab)!.accent;

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [tab]);
  const visibleItems = activeItems.slice(0, visibleCount);
  const hasMore = activeItems.length > visibleCount;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <Sparkles size={20} className="text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Review Center
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Everything you've saved, missed, or flagged — in one place
          </p>
        </div>
      </div>

      {/* Tabs — horizontally scrollable, never overflow */}
      <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar" style={{ background: 'var(--border)' }}>
        {tabs.map(({ key, label, icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400'
                : 'hover:bg-white/50 dark:hover:bg-white/5'
            }`}
            style={tab !== key ? { color: 'var(--text-secondary)' } : undefined}
          >
            {icon} {label}
            {count > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs ${
                tab === key
                  ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                  : 'bg-gray-200 dark:bg-white/10'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />)}
        </div>
      ) : activeItems.length === 0 ? (
        <EmptyState
          icon={
            tab === 'bookmarked' ? <Bookmark size={28} style={{ color: 'var(--text-muted)' }} /> :
            tab === 'wrong' ? <CheckCircle2 size={28} className="text-green-400" /> :
            <Flag size={28} style={{ color: 'var(--text-muted)' }} />
          }
          title={
            tab === 'bookmarked' ? 'No bookmarked questions yet' :
            tab === 'wrong' ? "You're all caught up!" :
            'No questions marked for review'
          }
          description={
            tab === 'bookmarked' ? 'Bookmark questions during a quiz to revisit them here.' :
            tab === 'wrong' ? 'No wrong answers in your revision queue right now.' :
            'Use the flag button during a quiz to mark questions you want to revisit.'
          }
          action={
            <button onClick={() => navigate('/chapter-wise-current-affairs')} className="btn-primary mt-4 text-sm py-2 px-5 flex items-center gap-2">
              <ListChecks size={14} /> Take a Test
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item, i) => (
            <ReviewItemCard key={item.id} item={item} accentClass={activeAccent} onRemove={handleRemove} delay={i * 0.03} />
          ))}
          {hasMore && (
            <div className="flex justify-center pt-3">
              <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="btn-ghost text-sm px-5 py-2">
                Show {Math.min(PAGE_SIZE, activeItems.length - visibleCount)} more ({activeItems.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
