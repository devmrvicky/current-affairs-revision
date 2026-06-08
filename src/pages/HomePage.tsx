import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, BarChart3, RefreshCcw, Zap, CheckCircle2, XCircle, Target, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useStatisticsStore } from '../store/statsStore';
import { loadQuizForDate, getFileName, getDisplayDate } from '../services/quizService';
import { DashboardCard, StatCard } from '../components/common/StatCard';
import { formatTime, formatDuration } from '../utils';

export default function HomePage() {
  const navigate = useNavigate();
  const { startSession, session, clearSession } = useQuizStore();
  const { load: loadHistory, tests } = useHistoryStore();
  const { stats, load: loadStats } = useStatisticsStore();
  const [isCreating, setIsCreating] = useState(false);

  const today = new Date();
  const todayFileName = getFileName(today);
  const todayDisplay = getDisplayDate(today);

  useEffect(() => {
    loadHistory();
    loadStats();
  }, []);

  // Check for in-progress session
  const hasActiveSession = session && !session.isCompleted;

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
        const confirmed = window.confirm('You have an in-progress test for today. Resume it?');
        if (confirmed) {
          navigate('/quiz');
          return;
        } else {
          clearSession();
        }
      }

      startSession(quiz, todayFileName);
      navigate('/quiz');
    } catch (err) {
      toast.error('Failed to load today\'s quiz');
    } finally {
      setIsCreating(false);
    }
  }

  function handleResumeTest() {
    navigate('/quiz');
  }

  const dashCards = [
    {
      title: hasActiveSession ? 'Resume Today\'s Test' : 'Create Today\'s Test',
      description: hasActiveSession
        ? `Q${(session?.currentIndex ?? 0) + 1}/${session?.totalQuestions} • Continue from where you left off`
        : `${todayDisplay} • ${todayFileName}`,
      icon: hasActiveSession ? RefreshCcw : Zap,
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 100%)',
      onClick: hasActiveSession ? handleResumeTest : handleCreateTest,
      badge: hasActiveSession ? 'Resume' : 'Today',
    },
    {
      title: 'Test History',
      description: `${tests.length} saved test${tests.length !== 1 ? 's' : ''} • View past performance and analysis`,
      icon: Clock,
      color: '#0ea5e9',
      gradient: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/history'),
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
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-2"
      >
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
          <StatCard label="Total Tests" value={stats.totalTests} icon={Target} color="#6366f1" delay={0} />
          <StatCard label="Accuracy" value={`${stats.averageAccuracy}%`} icon={TrendingUp} color="#22c55e" delay={0.05} />
          <StatCard label="Correct" value={stats.totalCorrect} icon={CheckCircle2} color="#22c55e" delay={0.1} />
          <StatCard label="Wrong" value={stats.totalWrong} icon={XCircle} color="#ef4444" delay={0.15} />
        </div>
      )}

      {/* Dashboard Cards */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashCards.map((card, i) => (
            <DashboardCard
              key={card.title}
              {...card}
              delay={i * 0.08}
            />
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
                    {test.totalQuestions}Q • {formatTime(test.timeTaken)}
                    {test.isRevision ? ' • Revision' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-display font-bold ${test.score >= 75 ? 'text-green-600 dark:text-green-400' : test.score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
