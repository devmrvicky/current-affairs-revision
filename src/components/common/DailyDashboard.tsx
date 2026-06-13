import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Target, Brain, Bookmark, Zap, CheckCircle2, TrendingUp } from 'lucide-react';
import { useDailyGoalStore } from '../../store/dailyGoalStore';
import { useSmartRevisionStore } from '../../store/smartRevisionStore';
import { useWrongQuestionsStore } from '../../store/wrongQuestionsStore';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { useQuizStore } from '../../store/quizStore';

interface DailyDashboardProps {
  onStartRevision: () => void;
}

export function DailyDashboard({ onStartRevision }: DailyDashboardProps) {
  const navigate = useNavigate();
  const { goal, getProgress, isGoalMet, getRemainingToday } = useDailyGoalStore();
  const { queue, getBreakdown } = useSmartRevisionStore();
  const { questions: wrongQs } = useWrongQuestionsStore();
  const { bookmarks } = useBookmarkStore();

  const progress = getProgress();
  const goalMet = isGoalMet();
  const remaining = getRemainingToday();
  const breakdown = getBreakdown();
  const totalQueue = queue.length;

  const activeWrong = wrongQs.filter((q) => q.status === 'learning').length;

  if (!goal) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            Today's Revision
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {goalMet ? '🎉 Daily goal achieved!' : `${remaining} questions remaining`}
          </p>
        </div>
        {goal.streakDays > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <span className="text-base">🔥</span>
            <span className="font-bold text-sm text-amber-600 dark:text-amber-400">{goal.streakDays}</span>
          </div>
        )}
      </div>

      {/* Goal Progress Bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Daily Goal: {goal.questionsToday} / {goal.target}
          </span>
          <span className={`text-sm font-bold ${goalMet ? 'text-green-500' : 'text-brand-500'}`}>
            {progress}%
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-full ${goalMet
              ? 'bg-gradient-to-r from-green-400 to-green-600'
              : 'bg-gradient-to-r from-brand-500 to-purple-600'
            }`}
          />
        </div>
      </div>

      {/* Due items grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: 'Wrong Qs',
            count: activeWrong,
            icon: Brain,
            color: '#ef4444',
            bg: '#ef444415',
            onClick: () => navigate('/wrong-questions'),
          },
          {
            label: 'Bookmarks',
            count: bookmarks.length,
            icon: Bookmark,
            color: '#8b5cf6',
            bg: '#8b5cf615',
            onClick: () => navigate('/bookmarked-questions'),
          },
          {
            label: 'Queue',
            count: totalQueue,
            icon: Target,
            color: '#6366f1',
            bg: '#6366f115',
            onClick: onStartRevision,
          },
        ].map(({ label, count, icon: Icon, color, bg, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="p-3 rounded-xl text-center transition-all hover:scale-105 active:scale-95"
            style={{ background: bg }}
          >
            <Icon size={18} style={{ color }} className="mx-auto mb-1" />
            <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              {count}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </button>
        ))}
      </div>

      {/* Start Revision CTA */}
      {totalQueue > 0 && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          onClick={onStartRevision}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-base flex items-center justify-center gap-2 bg-gradient-to-r from-brand-500 to-purple-600 shadow-glow"
        >
          <Zap size={18} />
          Start Revision ({totalQueue} questions)
        </motion.button>
      )}

      {totalQueue === 0 && goalMet && (
        <div className="text-center py-2">
          <CheckCircle2 size={28} className="text-green-500 mx-auto mb-1" />
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">
            All caught up! 🎉
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            No pending revision items for today
          </p>
        </div>
      )}
    </motion.div>
  );
}
