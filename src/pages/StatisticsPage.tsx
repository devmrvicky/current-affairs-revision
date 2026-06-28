import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseDateKey } from '../utils';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import { motion } from 'framer-motion';
import {
  TrendingUp, Award, Target, Flame, RefreshCcw,
  CheckCircle2, XCircle, BookOpen, BarChart3
} from 'lucide-react';
import { useStatisticsStore } from '../store/statsStore';
import { useHistoryStore } from '../store/historyStore';
import { CardSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { RevisionHeatmap } from '../components/common/RevisionHeatmap';

function StatItem({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  );
}

const COLORS = {
  brand: '#6366f1',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  purple: '#a855f7',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg" style={{ minWidth: 120 }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}{p.name.includes('%') || p.name.toLowerCase().includes('accuracy') ? '%' : ''}</span>
        </p>
      ))}
    </div>
  );
};

export default function StatisticsPage() {
  const { stats, isLoading, load } = useStatisticsStore();
  const { tests, load: loadHistory } = useHistoryStore();

  useEffect(() => {
    load();
    loadHistory();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!stats || stats.totalTests === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={28} style={{ color: 'var(--text-muted)' }} />}
        title="No statistics yet"
        description="Complete and save some tests to see your performance analytics here."
      />
    );
  }

  // Prepare daily chart data (last 14 days)
  const chartData = stats.dailyStats
    .slice(-14)
    .map((d) => ({
      date: parseDateKey(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      accuracy: d.accuracy,
      score: d.avgScore,
      questions: d.totalQuestions,
      correct: d.correct,
      wrong: d.wrong,
    }));

  // Weekly aggregation
  const weeklyData = (() => {
    const map: Record<string, { week: string; accuracy: number; questions: number; count: number }> = {};
    stats.dailyStats.forEach((d) => {
      const dt = parseDateKey(d.date);
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      const key = weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (!map[key]) map[key] = { week: key, accuracy: 0, questions: 0, count: 0 };
      map[key].accuracy += d.accuracy;
      map[key].questions += d.totalQuestions;
      map[key].count += 1;
    });
    return Object.values(map).slice(-8).map((w) => ({
      ...w,
      accuracy: Math.round(w.accuracy / w.count),
    }));
  })();

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <BarChart3 size={20} className="text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Statistics</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your overall performance</p>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatItem label="Total Tests" value={stats.totalTests} icon={Target} color={COLORS.brand} />
        <StatItem label="Avg Accuracy" value={`${stats.averageAccuracy}%`} icon={TrendingUp} color={COLORS.green} />
        <StatItem label="Best Score" value={`${stats.bestScore}%`} icon={Award} color={COLORS.amber} />
        <StatItem label="Current Streak" value={`${stats.currentStreak}d`} icon={Flame} color="#f97316" />
        <StatItem label="Best Streak" value={`${stats.longestStreak}d`} icon={Flame} color={COLORS.amber} />
        <StatItem label="Revisions" value={stats.totalRevisions} icon={RefreshCcw} color={COLORS.purple} />
      </div>

      {/* Questions Breakdown */}
      <div className="card p-5">
        <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          All-Time Performance
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-xl" style={{ background: '#22c55e18' }}>
            <CheckCircle2 size={20} className="text-green-500 mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-green-600 dark:text-green-400">{stats.totalCorrect}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct</p>
          </div>
          <div className="text-center p-3 rounded-xl" style={{ background: '#ef444418' }}>
            <XCircle size={20} className="text-red-500 mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-red-600 dark:text-red-400">{stats.totalWrong}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Wrong</p>
          </div>
          <div className="text-center p-3 rounded-xl" style={{ background: '#6366f118' }}>
            <BookOpen size={20} className="text-brand-500 mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-brand-600 dark:text-brand-400">{stats.totalQuestionsAttempted}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</p>
          </div>
        </div>
        {/* Overall accuracy bar */}
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>Overall Accuracy</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{stats.averageAccuracy}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.averageAccuracy}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-600"
            />
          </div>
        </div>
      </div>

      {/* Accuracy Trend */}
      {chartData.length > 1 && (
        <div className="card p-5">
          <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Accuracy Trend (Last 14 Days)
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.brand} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.brand} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="accuracy" name="Accuracy %" stroke={COLORS.brand} fill="url(#accuracyGrad)" strokeWidth={2} dot={{ r: 3, fill: COLORS.brand }} />
                <Area type="monotone" dataKey="score" name="Score %" stroke={COLORS.green} fill="url(#scoreGrad)" strokeWidth={2} dot={{ r: 3, fill: COLORS.green }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Weekly Questions Chart */}
      {weeklyData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Weekly Questions Attempted
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="questions" name="Questions" fill={COLORS.brand} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Revision Heatmap */}
      <RevisionHeatmap dailyStats={stats.dailyStats} weeks={17} />

      {/* Daily Performance Table */}
      {stats.dailyStats.length > 0 && (
        <div className="card p-5">
          <h2 className="font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Daily Performance Log
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Tests', 'Questions', 'Correct', 'Accuracy'].map((h) => (
                    <th key={h} className="pb-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.dailyStats.slice(-10).reverse().map((day, i) => (
                  <tr key={day.date} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {parseDateKey(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="py-3" style={{ color: 'var(--text-secondary)' }}>{day.testsAttempted}</td>
                    <td className="py-3" style={{ color: 'var(--text-secondary)' }}>{day.totalQuestions}</td>
                    <td className="py-3 text-green-600 dark:text-green-400 font-medium">{day.correct}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        day.accuracy >= 75 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : day.accuracy >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {day.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
