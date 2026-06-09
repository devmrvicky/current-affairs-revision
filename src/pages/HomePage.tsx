import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, BarChart3, RefreshCcw, Zap,
  CheckCircle2, XCircle, Target, TrendingUp, Calendar, Brain
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useStatisticsStore } from '../store/statsStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { loadQuizForDate, getFileName, getDisplayDate } from '../services/quizService';
import { useAvailableDates } from '../hooks/useAvailableDates';
import { DashboardCard, StatCard } from '../components/common/StatCard';
import { formatTime, formatDateKey } from '../utils';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

export default function HomePage() {
  const navigate = useNavigate();
  const { startSession, session, clearSession } = useQuizStore();
  const { load: loadHistory, tests } = useHistoryStore();
  const { stats, load: loadStats } = useStatisticsStore();
  const { questions: wrongQs, load: loadWrongQs, getSmartQueue } = useWrongQuestionsStore();
  const { availableSet, isLoading: datesLoading } = useAvailableDates();
  const [isCreating, setIsCreating] = useState(false);

  const today = new Date();
  const todayFileName = getFileName(today);
  const todayDisplay = getDisplayDate(today);
  const todayKey = formatDateKey(today);

  useEffect(() => {
    loadHistory();
    loadStats();
    loadWrongQs();
  }, []);

  const hasActiveSession = session && !session.isCompleted;

  // Revision progress stats
  const revisionStats = useMemo(() => {
    const nonRevisionTests = tests.filter((t) => !t.isRevision);
    const attempted = new Set(nonRevisionTests.map((t) => t.date)).size;
    const available = availableSet.size;
    const pct = available > 0 ? Math.round((attempted / available) * 100) : 0;
    return { attempted, available, pct };
  }, [tests, availableSet]);

  const activeWrongQs = wrongQs.filter((q) => q.status === 'learning').length;

  async function handleCreateTest() {
    setIsCreating(true);
    try {
      const quiz = await loadQuizForDate(today);
      if (!quiz) {
        toast.error(`No quiz available for today (${todayDisplay})`, { duration: 4000 });
        navigate('/no-quiz-today');
        return;
      }
      if (hasActiveSession && session?.fileName === todayFileName) {
        const confirmed = window.confirm("You have an in-progress test for today. Resume it?");
        if (confirmed) { navigate('/quiz'); return; }
        else clearSession();
      }
      startSession(quiz, todayFileName);
      navigate('/quiz');
    } catch {
      toast.error("Failed to load today's quiz");
    } finally {
      setIsCreating(false);
    }
  }

  const dashCards = [
    {
      title: hasActiveSession ? "Resume Today's Test" : "Create Today's Test",
      description: hasActiveSession
        ? `Q${(session?.currentIndex ?? 0) + 1}/${session?.totalQuestions} • Continue from where you left off`
        : `${todayDisplay} • ${availableSet.has(todayKey) ? 'Available ✓' : 'No file today'}`,
      icon: hasActiveSession ? RefreshCcw : Zap,
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 100%)',
      onClick: hasActiveSession ? () => navigate('/quiz') : handleCreateTest,
      badge: hasActiveSession ? 'Resume' : 'Today',
    },
    {
      title: 'Revision Calendar',
      description: `${revisionStats.attempted}/${revisionStats.available} days attempted • Browse by date`,
      icon: Calendar,
      color: '#0ea5e9',
      gradient: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/revision-calendar'),
      badge: revisionStats.pct > 0 ? `${revisionStats.pct}%` : undefined,
    },
    {
      title: 'Test History',
      description: `${tests.length} saved test${tests.length !== 1 ? 's' : ''} • View past performance`,
      icon: Clock,
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/history'),
    },
    {
      title: 'Wrong Questions',
      description: activeWrongQs > 0
        ? `${activeWrongQs} question${activeWrongQs !== 1 ? 's' : ''} need practice • Master with repetition`
        : 'No pending questions • Keep it up!',
      icon: Brain,
      color: '#ef4444',
      gradient: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/wrong-questions'),
      badge: activeWrongQs > 0 ? String(activeWrongQs) : undefined,
    },
    {
      title: 'Revision Mode',
      description: 'Re-attempt saved tests • Reinforce your knowledge',
      icon: BookOpen,
      color: '#22c55e',
      gradient: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/revision'),
    },
    {
      title: 'Statistics',
      description: 'Track your progress • Performance trends and charts',
      icon: BarChart3,
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/statistics'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
        <h1 className="text-3xl font-display font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Good {getGreeting()}, Aspirant! 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {todayDisplay} • Stay consistent, stay ahead
        </p>
      </motion.div>

      {/* Streak Banner */}
      {stats && stats.currentStreak > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-4 flex items-center gap-4 border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-900/10"
        >
          <div className="text-3xl">🔥</div>
          <div>
            <p className="font-display font-bold text-amber-700 dark:text-amber-400">
              {stats.currentStreak} Day Streak!
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Keep it going! Best: {stats.longestStreak} days
            </p>
          </div>
        </motion.div>
      )}

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Tests"  value={stats.totalTests}           icon={Target}       color="#6366f1" delay={0}    />
          <StatCard label="Accuracy"     value={`${stats.averageAccuracy}%`} icon={TrendingUp}   color="#22c55e" delay={0.05} />
          <StatCard label="Correct"      value={stats.totalCorrect}          icon={CheckCircle2} color="#22c55e" delay={0.1}  />
          <StatCard label="Wrong"        value={stats.totalWrong}            icon={XCircle}      color="#ef4444" delay={0.15} />
        </div>
      )}

      {/* Revision Progress Widget */}
      {!datesLoading && revisionStats.available > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>
                Current Affairs Progress
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {revisionStats.attempted} of {revisionStats.available} available days attempted
              </p>
            </div>
            <span className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              {revisionStats.pct}%
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${revisionStats.pct}%` }}
              transition={{ delay: 0.4, duration: 0.7, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-600"
            />
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>🔥 Streak: {stats?.currentStreak ?? 0} days</span>
            <span>🏆 Best: {stats?.longestStreak ?? 0} days</span>
          </div>
        </motion.div>
      )}

      {/* Smart Revision CTA */}
      {activeWrongQs > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/wrong-questions')}
          className="w-full card p-4 flex items-center gap-4 text-left border-l-4 border-l-red-400 hover:shadow-lg transition-shadow"
        >
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Brain size={22} className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              Start Smart Revision
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {activeWrongQs} question{activeWrongQs !== 1 ? 's' : ''} waiting • Prioritised by difficulty
            </p>
          </div>
          <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
            {activeWrongQs}
          </span>
        </motion.button>
      )}

      {/* Dashboard Cards */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashCards.map((card, i) => (
            <DashboardCard key={card.title} {...card} delay={i * 0.06} />
          ))}
        </div>
      </div>

      {/* Recent Tests */}
      {tests.slice(0, 3).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recent Tests
            </h2>
            <button onClick={() => navigate('/history')} className="text-sm text-brand-500 font-medium hover:text-brand-600">
              View all →
            </button>
          </div>
          <div className="space-y-3">
            {tests.slice(0, 3).map((test, i) => (
              <motion.div
                key={test.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/history/${test.id}`)}
              >
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                    {test.displayDate}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {test.totalQuestions}Q • {formatTime(test.timeTaken)}
                    {test.isRevision ? ' • Revision' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-display font-bold ${
                    test.score >= 75 ? 'text-green-600 dark:text-green-400'
                    : test.score >= 50 ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                  }`}>
                    {test.score}%
                  </span>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{test.accuracy}% acc</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
