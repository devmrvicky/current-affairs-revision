import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Calendar, Target, CheckCircle2, XCircle, ChevronRight, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useHistoryStore } from '../store/historyStore';
import { useQuizStore } from '../store/quizStore';
import { EmptyState } from '../components/common/EmptyState';
import { HistoryCardSkeleton } from '../components/common/Skeleton';
import { loadQuizByFileName } from '../services/quizService';
import { getBadge, getBadgeColors, formatTime } from '../utils';
import type { SavedTest } from '../types';

export default function RevisionPage() {
  const navigate = useNavigate();
  const { tests, isLoading, load } = useHistoryStore();
  const { startSession } = useQuizStore();

  useEffect(() => { load(); }, []);

  // Only show non-revision original tests
  const originalTests = tests.filter((t) => !t.isRevision);

  async function handleRevise(test: SavedTest) {
    try {
      const quiz = await loadQuizByFileName(test.fileName);
      if (!quiz) {
        toast.error(`Quiz file "${test.fileName}" not found. The source file may have been moved.`);
        return;
      }
      startSession(quiz, test.fileName);
      navigate('/quiz');
      toast.success(`Starting revision for ${test.displayDate}`);
    } catch (err) {
      toast.error('Failed to start revision mode');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-xl shimmer" style={{ background: 'var(--border)' }} />
        {[1, 2, 3].map((i) => <HistoryCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <BookOpen size={20} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Revision Mode</h1>
        </div>
        <p className="text-sm ml-13" style={{ color: 'var(--text-muted)', marginLeft: '3.25rem' }}>
          Re-attempt saved tests to reinforce your knowledge
        </p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 flex items-start gap-3 border-l-4 border-l-green-400 bg-green-50 dark:bg-green-900/10">
        <RotateCcw size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm text-green-700 dark:text-green-400">How Revision Works</p>
          <p className="text-xs mt-0.5 text-green-600 dark:text-green-500">
            Select a test below and attempt all questions again. Get instant feedback on each answer.
            Revision attempts are tracked separately and won't affect your original score.
          </p>
        </div>
      </div>

      {/* Test List */}
      {originalTests.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} style={{ color: 'var(--text-muted)' }} />}
          title="No tests to revise"
          description="Save a completed test first, then come back here to revise it."
          action={
            <button onClick={() => navigate('/')} className="btn-primary">
              Take a Test
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {originalTests.map((test, i) => {
            const badge = getBadge(test.score);
            const colors = getBadgeColors(badge);
            const needsRevision = test.score < 75;

            return (
              <motion.div
                key={test.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Title Row */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                        <span className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {test.displayDate}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                        {test.score}%
                      </span>
                      {needsRevision && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                          Needs Practice
                        </span>
                      )}
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <div className="flex items-center gap-1">
                        <Target size={11} />
                        <span>{test.totalQuestions} questions</span>
                      </div>
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 size={11} />
                        <span>{test.correct} correct</span>
                      </div>
                      <div className="flex items-center gap-1 text-red-500">
                        <XCircle size={11} />
                        <span>{test.wrong} wrong</span>
                      </div>
                    </div>

                    {/* Accuracy bar */}
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${test.accuracy}%`,
                            background: test.accuracy >= 75 ? '#22c55e' : test.accuracy >= 50 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Revise Button */}
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleRevise(test)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0 transition-all"
                    style={{
                      background: needsRevision ? '#ef444418' : '#22c55e18',
                      color: needsRevision ? '#ef4444' : '#22c55e',
                      border: `1.5px solid ${needsRevision ? '#ef444440' : '#22c55e40'}`,
                    }}
                  >
                    <RotateCcw size={14} />
                    Revise
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
