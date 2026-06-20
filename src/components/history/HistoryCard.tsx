import { memo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Target, CheckCircle2, XCircle, Clock, Trash2, Eye, RotateCcw } from 'lucide-react';
import type { SavedTest } from '../../types';
import { getBadge, getBadgeColors, formatTime, formatRelativeDate } from '../../utils';

interface HistoryCardProps {
  test: SavedTest;
  onView: () => void;
  onDelete: () => void;
  onRevise: () => void;
  delay?: number;
}

export const HistoryCard = memo(function HistoryCard({ test, onView, onDelete, onRevise, delay = 0 }: HistoryCardProps) {
  const badge = getBadge(test.score);
  const colors = getBadgeColors(badge);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay, duration: 0.3 }}
      className="card p-5 hover:shadow-lg transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {test.displayDate}
            </span>
            {test.isRevision && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                Revision
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Saved {formatRelativeDate(test.savedAt)}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
          {test.score}%
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { icon: Target, label: 'Total', value: test.totalQuestions, color: '#6366f1' },
          { icon: CheckCircle2, label: 'Right', value: test.correct, color: '#22c55e' },
          { icon: XCircle, label: 'Wrong', value: test.wrong, color: '#ef4444' },
          { icon: Clock, label: 'Time', value: formatTime(test.timeTaken), color: '#f59e0b' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="text-center">
            <div className="w-8 h-8 rounded-xl mx-auto mb-1 flex items-center justify-center"
              style={{ background: `${color}15` }}>
              <Icon size={14} style={{ color }} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Accuracy Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
          <span>Accuracy</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{test.accuracy}%</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${test.accuracy}%`,
              background: test.accuracy >= 75 ? '#22c55e' : test.accuracy >= 50 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onView}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-brand-50 dark:hover:bg-brand-900/20 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800"
        >
          <Eye size={13} />
          Analysis
        </button>
        <button
          onClick={onRevise}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
        >
          <RotateCcw size={13} />
          Revise
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-xl text-sm transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 border border-transparent hover:border-red-200 dark:hover:border-red-800"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
});
