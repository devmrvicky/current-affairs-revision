import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, BarChart3, RefreshCcw, Zap,
  CheckCircle2, XCircle, Target, TrendingUp,
  Calendar, Brain, Bookmark, Layers, AlertTriangle, BarChart2, Highlighter
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useStatisticsStore } from '../store/statsStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { useSmartRevisionStore } from '../store/smartRevisionStore';
import { loadQuizForDate, getFileName, getDisplayDate } from '../services/quizService';
import { useAvailableDates } from '../hooks/useAvailableDates';
import { DashboardCard, StatCard } from '../components/common/StatCard';
import { PWAInstallBanner } from '../components/common/PWAComponents';
import { DailyDashboard } from '../components/common/DailyDashboard';
import { ContinueReadingWidget } from '../components/common/ContinueReadingWidget';
import { useReaderStore } from '../store/readerStore';
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
  const { questions: wrongQs, load: loadWrongQs } = useWrongQuestionsStore();
  const { bookmarks, load: loadBookmarks, getCount: getBookmarkCount } = useBookmarkStore();
  const { load: loadGoal } = useDailyGoalStore();
  const { buildQueue } = useSmartRevisionStore();
  const { loadAll: loadReaderData } = useReaderStore();
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
    loadBookmarks();
    loadGoal();
    loadReaderData();
  }, []);

  // Rebuild smart queue whenever wrong questions or bookmarks change
  useEffect(() => {
    buildQueue(wrongQs, bookmarks);
  }, [wrongQs, bookmarks]);

  const hasActiveSession = session && !session.isCompleted;
  const activeWrongQs = wrongQs.filter((q) => q.status === 'learning').length;
  const bookmarkCount = getBookmarkCount();
  const dangerCount = wrongQs.filter((q) => q.status === 'learning' && q.wrongCount >= 2).length;

  const revisionStats = useMemo(() => {
    const nonRevision = tests.filter((t) => !t.isRevision);
    const attempted = new Set(nonRevision.map((t) => t.date)).size;
    const available = availableSet.size;
    const pct = available > 0 ? Math.round((attempted / available) * 100) : 0;
    return { attempted, available, pct };
  }, [tests, availableSet]);

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
        if (window.confirm("You have an in-progress test for today. Resume it?")) {
          navigate('/quiz'); return;
        } else clearSession();
      }
      startSession(quiz, todayFileName);
      navigate('/quiz');
    } catch {
      toast.error("Failed to load today's quiz");
    } finally {
      setIsCreating(false);
    }
  }

  function handleStartSmartRevision() {
    const { queue } = useSmartRevisionStore.getState();
    if (queue.length === 0) {
      toast('No pending revision items! Great job 🎉');
      return;
    }
    const quiz = {
      date: 'Smart Revision',
      questions: queue.map((item, i) => ({
        id: i + 1,
        question: item.question,
        options: item.options,
        correctAnswer: item.correctAnswer,
        explanation: `[${item.sourceLabel}] ${item.explanation}`,
      })),
    };
    startSession(quiz, 'smart_revision.json');
    navigate('/quiz');
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
      title: 'Chapter Wise',
      description: 'Government Schemes • Sports • Awards • Science & more',
      icon: Layers,
      color: '#a855f7',
      gradient: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/chapter-wise-current-affairs'),
    },
    {
      title: 'My Highlights',
      description: 'Saved highlights and notes from chapter reading',
      icon: Highlighter,
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, transparent 100%)',
      onClick: () => navigate('/my-highlights'),
    },
    {
      title: 'Bookmarked Questions',
      description: bookmarkCount > 0
        ? `${bookmarkCount} saved • Start bookmark revision`
        : 'Bookmark questions during quizzes',
      icon: Bookmark,
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/bookmarked-questions'),
      badge: bookmarkCount > 0 ? String(bookmarkCount) : undefined,
    },
    {
      title: 'Danger Zone',
      description: dangerCount > 0
        ? `${dangerCount} question${dangerCount !== 1 ? 's' : ''} you keep forgetting`
        : 'Questions you keep getting wrong',
      icon: AlertTriangle,
      color: '#f97316',
      gradient: 'linear-gradient(135deg, rgba(249,115,22,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/danger-zone'),
      badge: dangerCount > 0 ? String(dangerCount) : undefined,
    },
    {
      title: 'Weekly Report',
      description: 'Your performance analytics this week',
      icon: BarChart2,
      color: '#22c55e',
      gradient: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/weekly-report'),
    },
    {
      title: 'Wrong Questions',
      description: activeWrongQs > 0
        ? `${activeWrongQs} to master • Spaced repetition`
        : 'No pending questions',
      icon: Brain,
      color: '#ef4444',
      gradient: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/wrong-questions'),
      badge: activeWrongQs > 0 ? String(activeWrongQs) : undefined,
    },
    {
      title: 'Test History',
      description: `${tests.length} saved test${tests.length !== 1 ? 's' : ''}`,
      icon: Clock,
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
      onClick: () => navigate('/history'),
    },
    {
      title: 'Revision Mode',
      description: 'Re-attempt saved tests',
      icon: BookOpen,
      color: '#22c55e',
      gradient: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/revision'),
    },
    {
      title: 'Statistics',
      description: 'Trends, accuracy, streaks',
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

      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Daily Dashboard */}
      <DailyDashboard onStartRevision={handleStartSmartRevision} />

      {/* Continue Reading / Favorites */}
      <ContinueReadingWidget />

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
          <StatCard label="Total Tests"  value={stats.totalTests}            icon={Target}       color="#6366f1" delay={0}    />
          <StatCard label="Accuracy"     value={`${stats.averageAccuracy}%`}  icon={TrendingUp}   color="#22c55e" delay={0.05} />
          <StatCard label="Correct"      value={stats.totalCorrect}           icon={CheckCircle2} color="#22c55e" delay={0.1}  />
          <StatCard label="Wrong"        value={stats.totalWrong}             icon={XCircle}      color="#ef4444" delay={0.15} />
        </div>
      )}

      {/* Revision Progress */}
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

      {/* Dashboard Cards */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashCards.map((card, i) => (
            <DashboardCard key={card.title} {...card} delay={i * 0.04} />
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
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{test.displayDate}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {test.totalQuestions}Q • {formatTime(test.timeTaken)}{test.isRevision ? ' • Revision' : ''}
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
