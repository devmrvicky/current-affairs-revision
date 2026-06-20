import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useHistoryStore } from '../store/historyStore';
import { useQuizStore } from '../store/quizStore';
import { AnalysisOverview, QuestionReview } from '../components/analysis/AnalysisComponents';
import { loadQuizByFileName } from '../services/quizService';
import type { SavedTest } from '../types';
import type { QuizSession } from '../types';

type TabKey = 'overview' | 'all' | 'wrong' | 'correct' | 'bookmarked';

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tests, remove } = useHistoryStore();
  const { startSession } = useQuizStore();
  const [tab, setTab] = useState<TabKey>('overview');

  const test = tests.find((t) => t.id === id);

  useEffect(() => {
    if (!test && tests.length > 0) navigate('/history', { replace: true });
  }, [test, tests]);

  if (!test) return null;

  // Build a fake AnalysisResult from saved test
  const result = {
    totalQuestions: test.totalQuestions,
    correct: test.correct,
    wrong: test.wrong,
    unanswered: test.unanswered,
    accuracy: test.accuracy,
    score: test.score,
    timeTaken: test.timeTaken,
    badge: (test.score >= 90 ? 'Excellent' : test.score >= 75 ? 'Good' : test.score >= 50 ? 'Average' : 'Needs Revision') as any,
    badgeColor: test.score >= 90 ? '#22c55e' : test.score >= 75 ? '#3b82f6' : test.score >= 50 ? '#f59e0b' : '#ef4444',
  };

  const bookmarkedCount = test.questions.filter((q) => q.bookmarked).length;

  async function handleRevise() {
    try {
      const quiz = await loadQuizByFileName(test!.fileName);
      if (!quiz) {
        toast.error('Quiz file not found');
        return;
      }
      startSession(quiz, test!.fileName);
      navigate('/quiz');
    } catch {
      toast.error('Failed to start revision');
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this test permanently?')) return;
    try {
      await remove(test!.id);
      toast.success('Test deleted');
      navigate('/history');
    } catch {
      toast.error('Failed to delete');
    }
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'all', label: 'All', count: test.totalQuestions },
    { key: 'wrong', label: 'Wrong', count: test.wrong + test.unanswered },
    { key: 'correct', label: 'Correct', count: test.correct },
    { key: 'bookmarked', label: 'Saved', count: bookmarkedCount },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={() => navigate('/history')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0">
            <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-display font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {test.displayDate}
            </h1>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              {test.isRevision ? 'Revision Test' : 'Test Analysis'}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={handleRevise}
            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium border-2 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
          >
            <RotateCcw size={14} /> <span className="hidden xs:inline">Revise</span>
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800 flex-shrink-0"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--border)' }}>
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400'
                : 'hover:bg-white/50 dark:hover:bg-white/5'
            }`}
            style={tab !== key ? { color: 'var(--text-secondary)' } : undefined}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
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
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === 'overview' ? (
          <AnalysisOverview result={result} />
        ) : (
          <QuestionReview
            attempts={test.questions}
            filter={
              tab === 'all' ? 'all'
              : tab === 'wrong' ? 'wrong'
              : tab === 'correct' ? 'correct'
              : 'bookmarked'
            }
          />
        )}
      </motion.div>
    </div>
  );
}
