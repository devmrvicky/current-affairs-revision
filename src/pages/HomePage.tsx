import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListChecks, Layers, Sparkles, ArrowRight, Target as TargetIcon, Newspaper, RefreshCcw,
} from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { getSyllabusWithCounts, getExam } from '../services/examService';
import { getSubjectPerformance } from '../services/attemptLedgerService';
import { getActiveResumableSession, type ResumableSession } from '../services/resumeSessionService';
import { motion } from 'framer-motion';
import { useHistoryStore } from '../store/historyStore';
import { useStatisticsStore } from '../store/statsStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { useReaderStore } from '../store/readerStore';
import { DashboardCard } from '../components/common/StatCard';
import { PWAInstallBanner } from '../components/common/PWAComponents';
import { DailyGoalCard } from '../components/common/DailyGoalCard';
import { ContinueReadingWidget } from '../components/common/ContinueReadingWidget';
import { formatTime } from '../utils';
import { checkAndFireDueReminders, notifyStudyStreak } from '../services/notificationTriggers';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

interface SubjectRow {
  id: string;
  name: string;
  accuracy: number | null; // null = no attempts yet, not 0% (§16: don't fabricate a progress number)
}

export default function HomePage() {
  const navigate = useNavigate();
  const { load: loadHistory, tests } = useHistoryStore();
  const { stats, load: loadStats } = useStatisticsStore();
  const { load: loadGoal } = useDailyGoalStore();
  const { loadAll: loadReaderData } = useReaderStore();

  const { selectedExamId } = useExamStore();
  const selectedExam = getExam(selectedExamId);
  const isCurrentAffairsExam = selectedExamId === 'current-affairs';

  const [syllabus, setSyllabus] = useState<Awaited<ReturnType<typeof getSyllabusWithCounts>>>([]);
  const [resumable, setResumable] = useState<ResumableSession | null>(null);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadHistory(), loadStats(), loadGoal(), loadReaderData()]);
      checkAndFireDueReminders();
      const freshStreak = useStatisticsStore.getState().stats?.currentStreak ?? 0;
      if (freshStreak > 0) notifyStudyStreak(freshStreak);
    })();
    setResumable(getActiveResumableSession());
  }, []);

  // "Your Subjects" — real per-subject progress for whichever exam is
  // selected, generic across ALL subjects including Current Affairs
  // (product-refactor §15-16). Current Affairs uses statsStore's
  // longer-established accuracy (its existing canonical source, built
  // before the universal ledger existed); every other subject uses the
  // universal attempt ledger — the only source that has ever existed for
  // them. Both are real numbers; neither is fabricated.
  useEffect(() => {
    if (!selectedExam) { setSubjectRows([]); return; }
    let cancelled = false;
    getSyllabusWithCounts(selectedExamId).then(async (rows) => {
      const perf = await getSubjectPerformance();
      const perfById = new Map(perf.map((p) => [p.subjectId, p]));
      const result: SubjectRow[] = rows.map(({ subject }) => {
        if (subject.id === 'current-affairs') {
          const s = useStatisticsStore.getState().stats;
          return { id: subject.id, name: subject.name, accuracy: s && s.totalTests > 0 ? s.averageAccuracy : null };
        }
        const p = perfById.get(subject.id);
        return { id: subject.id, name: subject.name, accuracy: p && p.attempted > 0 ? Math.round((p.correct / p.attempted) * 100) : null };
      });
      if (!cancelled) setSubjectRows(result);
    });
    if (isCurrentAffairsExam) setSyllabus([]);
    else getSyllabusWithCounts(selectedExamId).then(setSyllabus);
    return () => { cancelled = true; };
  }, [selectedExamId, selectedExam, isCurrentAffairsExam]);

  const quickActions = [
    {
      title: 'Practice by Topic',
      description: 'Choose subject, topic, difficulty & count',
      icon: TargetIcon,
      color: '#14b8a6',
      gradient: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/practice/configure'),
    },
    {
      title: 'Mock Test',
      description: 'Timed, negative marking, exam-standard',
      icon: ListChecks,
      color: '#a855f7',
      gradient: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/mock-tests'),
    },
    {
      title: 'Chapters',
      description: 'Browse by subject and topic',
      icon: Layers,
      color: '#0ea5e9',
      gradient: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/chapters'),
    },
    {
      title: 'Review Center',
      description: 'Wrong, bookmarked, weak topics & more',
      icon: Sparkles,
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/review-center'),
    },
    {
      title: 'Current Affairs',
      description: 'Daily quiz, chapters, revision calendar',
      icon: Newspaper,
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, transparent 100%)',
      onClick: () => navigate('/current-affairs'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
        <h1 className="text-3xl font-display font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Good {getGreeting()}! 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {selectedExam?.name ?? 'Choose your exam'} · Stay consistent, stay ahead
        </p>
      </motion.div>

      {/* Daily Goal — user-configurable, no forced Current-Affairs workflow */}
      <DailyGoalCard />

      {/* Continue Learning / Favorite Chapters — generic across every subject */}
      <ContinueReadingWidget />

      {/* Resume Test — most recent incomplete session, from EITHER engine, never assumed to be Current Affairs */}
      {resumable && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate(resumable.resumeRoute)}
          className="card p-5 w-full text-left hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="w-11 h-11 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
            <RefreshCcw size={18} className="text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Resume Test</p>
            <p className="font-display font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{resumable.label}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{resumable.answered} / {resumable.total} answered</p>
          </div>
          <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
        </motion.button>
      )}

      {/* Your Subjects — real accuracy per subject, works for any exam including Current Affairs */}
      {subjectRows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Your Subjects</h2>
            <button onClick={() => navigate('/exams')} className="text-xs font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1">
              Switch <ArrowRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {subjectRows.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.name}</span>
                {s.accuracy === null ? (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Not started yet</span>
                ) : (
                  <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.accuracy}%` }} />
                    </div>
                    <span className="text-xs font-semibold w-9 text-right" style={{ color: 'var(--text-primary)' }}>{s.accuracy}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Non-current-affairs exam with no content at all yet — honest empty state, not hidden */}
      {!isCurrentAffairsExam && selectedExam && syllabus.length > 0 && syllabus.every((s) => s.questionCount === 0) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
          <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'var(--border)' }}>
            <Newspaper size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Question bank coming soon</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {selectedExam.name} content isn't live yet. Current Affairs is fully available in the meantime.
              </p>
              <button onClick={() => useExamStore.getState().setSelectedExam('current-affairs')} className="text-xs font-medium text-brand-500 hover:text-brand-600 mt-2">
                Switch to Current Affairs →
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <PWAInstallBanner />

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickActions.map((card, i) => (
            <DashboardCard key={card.title} {...card} delay={i * 0.04} />
          ))}
        </div>
      </div>

      {/* Recent Activity — any subject, any engine */}
      {tests.slice(0, 3).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
            <button onClick={() => navigate('/history')} className="text-sm text-brand-500 font-medium hover:text-brand-600">View all →</button>
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
