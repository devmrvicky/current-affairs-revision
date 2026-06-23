import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';
import type { AnalysisResult, QuestionAttempt } from '../../types';
import { formatTime, getBadgeColors } from '../../utils';
import { CheckCircle2, XCircle, Clock, Target, Award, Percent, Flag } from 'lucide-react';

interface AnalysisOverviewProps {
  result: AnalysisResult;
}

export function AnalysisOverview({ result }: AnalysisOverviewProps) {
  const badgeColors = getBadgeColors(result.badge);
  const pieData = [
    { name: 'Correct', value: result.correct, color: '#22c55e' },
    { name: 'Wrong', value: result.wrong, color: '#ef4444' },
    { name: 'Unanswered', value: result.unanswered, color: '#e5e7eb' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Badge */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-2 font-display font-bold text-lg ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}
      >
        <Award size={20} />
        {result.badge}
      </motion.div>

      {/* Score Bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Overall Score</span>
          <span className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            {result.score}%
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${result.score}%` }}
            transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-600"
          />
        </div>
      </div>

      {/* Accuracy Bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Accuracy</span>
          <span className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            {result.accuracy}%
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${result.accuracy}%` }}
            transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${result.accuracy >= 75 ? 'bg-gradient-to-r from-green-400 to-green-600' : result.accuracy >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Correct', value: result.correct, icon: CheckCircle2, color: '#22c55e', bg: '#22c55e18' },
          { label: 'Wrong', value: result.wrong, icon: XCircle, color: '#ef4444', bg: '#ef444418' },
          { label: 'Accuracy', value: `${result.accuracy}%`, icon: Percent, color: '#6366f1', bg: '#6366f118' },
          { label: 'Time Taken', value: formatTime(result.timeTaken), icon: Clock, color: '#f59e0b', bg: '#f59e0b18' },
        ].map(({ label, value, icon: Icon, color, bg }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.07 }}
            className="card p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pie Chart */}
      <div className="card p-5">
        <h3 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Performance Breakdown
        </h3>
        <div className="flex items-center gap-6">
          <div className="h-36 w-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} questions`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 flex-1">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${d.color}20`, color: d.color }}>
                    {Math.round((d.value / result.totalQuestions) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface QuestionReviewProps {
  attempts: QuestionAttempt[];
  filter: 'all' | 'wrong' | 'correct' | 'bookmarked' | 'marked';
}

export function QuestionReview({ attempts, filter }: QuestionReviewProps) {
  const filtered = attempts.filter((a) => {
    if (filter === 'wrong') return a.status === 'wrong' || a.status === 'unanswered';
    if (filter === 'correct') return a.status === 'correct';
    if (filter === 'bookmarked') return a.bookmarked;
    if (filter === 'marked') return a.markedForReview;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
        No questions in this category
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.map((attempt, idx) => (
        <motion.div
          key={attempt.questionId}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05 }}
          className={`card p-5 border-l-4 ${
            attempt.markedForReview ? 'border-l-amber-400' :
            attempt.status === 'correct' ? 'border-l-green-500' :
            attempt.status === 'wrong' ? 'border-l-red-500' :
            'border-l-gray-300 dark:border-l-gray-600'
          }`}
        >
          <div className="flex items-start gap-3 mb-3">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
              {attempts.indexOf(attempt) + 1}
            </span>
            <p className="text-sm font-medium leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>
              {attempt.question}
            </p>
            {attempt.markedForReview && (
              <span className="flex-shrink-0 text-amber-500" title="Marked for review">
                <Flag size={14} fill="currentColor" />
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 pl-9">
            {attempt.options.map((opt) => {
              const isCorrect = opt === attempt.correctAnswer;
              const isSelected = opt === attempt.selectedAnswer;
              return (
                <div
                  key={opt}
                  className={`px-3 py-2 rounded-lg text-sm border ${
                    isCorrect ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
                    isSelected && !isCorrect ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
                    'border-transparent'
                  }`}
                  style={!isCorrect && !isSelected ? { color: 'var(--text-secondary)' } : undefined}
                >
                  {isCorrect && '✓ '}{isSelected && !isCorrect && '✗ '}{opt}
                </div>
              );
            })}
          </div>

          {attempt.explanation && (
            <div className="pl-9">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Explanation
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {attempt.explanation}
              </p>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
