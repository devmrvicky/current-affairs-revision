import { useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Calendar, TrendingUp, TrendingDown, CheckCircle2, XCircle, Target, Flame } from 'lucide-react';
import { useStatisticsStore } from '../store/statsStore';
import { useHistoryStore } from '../store/historyStore';
import { EmptyState } from '../components/common/EmptyState';
import { getBadge, getBadgeColors, formatDateKey, parseDateKey } from '../utils';
import type { WeeklyReport } from '../types';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeeklyReport(dailyStats: { date: string; totalQuestions: number; correct: number; wrong: number; accuracy: number }[], weekOffset = 0): WeeklyReport | null {
  const today = new Date();
  const targetWeekStart = getWeekStart(new Date(today.getTime() - weekOffset * 7 * 24 * 60 * 60 * 1000));
  const targetWeekEnd = new Date(targetWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  const weekStats = dailyStats.filter((s) => {
    const d = parseDateKey(s.date);
    return d >= targetWeekStart && d <= targetWeekEnd;
  });

  if (weekStats.length === 0) return null;

  const totalAttempted = weekStats.reduce((s, d) => s + d.totalQuestions, 0);
  const totalCorrect = weekStats.reduce((s, d) => s + d.correct, 0);
  const totalWrong = weekStats.reduce((s, d) => s + d.wrong, 0);
  const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

  const dailyBreakdown = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(targetWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = formatDateKey(d);
    const stat = weekStats.find((s) => s.date === key);
    return {
      date: d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' }),
      questions: stat?.totalQuestions ?? 0,
      accuracy: stat?.accuracy ?? 0,
    };
  });

  return {
    weekStart: formatDateKey(targetWeekStart),
    weekEnd: formatDateKey(targetWeekEnd),
    totalAttempted,
    totalCorrect,
    totalWrong,
    accuracy,
    daysActive: weekStats.length,
    topicsStrong: accuracy >= 75 ? ['Current Affairs', 'Science & Tech'] : [],
    topicsWeak: accuracy < 60 ? ['Government Schemes', 'International Orgs'] : [],
    dailyBreakdown,
  };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}{p.name === 'Accuracy' ? '%' : ''}</span>
        </p>
      ))}
    </div>
  );
};

export default function WeeklyReportPage() {
  const { stats, load } = useStatisticsStore();
  const { tests, load: loadHistory } = useHistoryStore();

  useEffect(() => { load(); loadHistory(); }, []);

  const report = useMemo(() => {
    if (!stats?.dailyStats.length) return null;
    return buildWeeklyReport(stats.dailyStats, 0);
  }, [stats]);

  const prevReport = useMemo(() => {
    if (!stats?.dailyStats.length) return null;
    return buildWeeklyReport(stats.dailyStats, 1);
  }, [stats]);

  if (!stats || !report) {
    return (
      <EmptyState
        icon={<Calendar size={28} style={{ color: 'var(--text-muted)' }} />}
        title="No weekly data yet"
        description="Complete some quizzes this week to see your weekly report here."
      />
    );
  }

  const badge = getBadge(report.accuracy);
  const badgeColors = getBadgeColors(badge);
  const vsLastWeek = prevReport ? report.accuracy - prevReport.accuracy : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <Calendar size={20} className="text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Weekly Report
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {parseDateKey(report.weekStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} –{' '}
            {parseDateKey(report.weekEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Questions', value: report.totalAttempted, icon: Target, color: '#6366f1' },
          { label: 'Accuracy', value: `${report.accuracy}%`, icon: TrendingUp, color: '#22c55e' },
          { label: 'Correct', value: report.totalCorrect, icon: CheckCircle2, color: '#22c55e' },
          { label: 'Days Active', value: `${report.daysActive}/7`, icon: Flame, color: '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="card p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: `${color}18` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* vs last week */}
      {vsLastWeek !== null && (
        <div className={`card p-4 flex items-center gap-3 border-l-4 ${vsLastWeek >= 0 ? 'border-l-green-400' : 'border-l-red-400'}`}>
          {vsLastWeek >= 0
            ? <TrendingUp size={18} className="text-green-500 flex-shrink-0" />
            : <TrendingDown size={18} className="text-red-500 flex-shrink-0" />
          }
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className={`font-bold ${vsLastWeek >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {vsLastWeek >= 0 ? '+' : ''}{vsLastWeek}%
            </span>{' '}
            vs last week ({prevReport?.accuracy ?? 0}% → {report.accuracy}%)
          </p>
        </div>
      )}

      {/* Daily breakdown bar chart */}
      <div className="card p-5">
        <h3 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Daily Questions
        </h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.dailyBreakdown} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="questions" name="Questions" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Accuracy trend */}
      <div className="card p-5">
        <h3 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Daily Accuracy
        </h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.dailyBreakdown} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="accuracy" name="Accuracy" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Study consistency */}
      <div className="card p-5">
        <h3 className="font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Study Consistency
        </h3>
        <div className="flex gap-1">
          {report.dailyBreakdown.map((day) => (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div
                className={`w-full rounded-lg transition-all ${
                  day.questions >= 25 ? 'bg-green-500'
                  : day.questions >= 10 ? 'bg-brand-400'
                  : day.questions > 0 ? 'bg-amber-400'
                  : 'bg-gray-200 dark:bg-white/10'
                }`}
                style={{ height: `${Math.max(8, (day.questions / 50) * 60)}px` }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                {day.date.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>🟢 25+ excellent</span>
          <span>🔵 10+ good</span>
          <span>🟡 1-9 light</span>
          <span>⬜ missed</span>
        </div>
      </div>

      {/* All-time stats */}
      <div className="card p-5">
        <h3 className="font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          All-Time Performance
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Total Tests', value: stats.totalTests },
            { label: 'Best Score', value: `${stats.bestScore}%` },
            { label: 'Current Streak', value: `${stats.currentStreak} days 🔥` },
            { label: 'Best Streak', value: `${stats.longestStreak} days` },
            { label: 'Total Questions', value: stats.totalQuestionsAttempted },
            { label: 'Avg Accuracy', value: `${stats.averageAccuracy}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
