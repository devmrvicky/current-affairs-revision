import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, Trash2, Home, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useChapterStore } from '../store/chapterStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { buildAnalysis, sessionToSavedTest, formatDateKey } from '../utils';
import { AnalysisOverview, QuestionReview } from '../components/analysis/AnalysisComponents';
import { getChapterList } from '../services/chapterRepository';

type TabKey = 'overview' | 'all' | 'wrong' | 'correct' | 'bookmarked';

async function fireConfetti(score: number) {
  try {
    const mod = await import('canvas-confetti');
    if (score >= 75) mod.default({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  } catch {}
}

// Check if a fileName belongs to chapters
const chapterFileNames = new Set(getChapterList().map((c) => c.fileName));

export default function AnalysisPage() {
  const navigate = useNavigate();
  const { session, clearSession } = useQuizStore();
  const { save } = useHistoryStore();
  const { ingestFromAttempts } = useWrongQuestionsStore();
  const { syncFromAttempts: syncBookmarks } = useBookmarkStore();
  const { recordAttempt: recordChapterAttempt } = useChapterStore();
  const { increment: incrementGoal } = useDailyGoalStore();

  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!session) { navigate('/', { replace: true }); return; }
    fireConfetti(buildAnalysis(session).score);
  }, []);

  if (!session) return null;

  const result = buildAnalysis(session);
  const bookmarkedCount = session.attempts.filter((a) => a.bookmarked).length;
  const isChapterQuiz = chapterFileNames.has(session.fileName);

  async function handleSave() {
    if (saved || !session) return;
    setIsSaving(true);
    try {
      const test = sessionToSavedTest(session, false);
      await save(test);

      // Ingest wrong answers
      await ingestFromAttempts(
        session.attempts,
        formatDateKey(new Date()),
        session.date,
        session.fileName
      );

      // Sync bookmarks from session
      await syncBookmarks(session.attempts, session.fileName, session.date);

      // Increment daily goal with answered questions count
      await incrementGoal(result.totalQuestions);

      // Record chapter stats if this was a chapter quiz
      if (isChapterQuiz) {
        const chapterName = session.fileName.replace(/\.json$/i, '');
        await recordChapterAttempt(
          session.fileName,
          chapterName,
          result.score,
          result.correct,
          result.totalQuestions
        );
      }

      setSaved(true);
      toast.success('Test saved! Wrong answers added to revision queue.');
    } catch {
      toast.error('Failed to save test');
    } finally {
      setIsSaving(false);
    }
  }

  function handleDiscard() {
    if (window.confirm('Discard this test? Results will not be saved.')) {
      clearSession();
      navigate('/');
    }
  }

  function handleGoHome() {
    clearSession();
    navigate('/');
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'all', label: 'All', count: session.totalQuestions },
    { key: 'wrong', label: 'Wrong', count: result.wrong + result.unanswered },
    { key: 'correct', label: 'Correct', count: result.correct },
    { key: 'bookmarked', label: 'Saved', count: bookmarkedCount },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Test Analysis
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {session.date}
            {isChapterQuiz && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">Chapter Quiz</span>}
          </p>
        </div>
        <button onClick={handleGoHome} className="btn-ghost flex items-center gap-2 text-sm">
          <Home size={15} /> Home
        </button>
      </motion.div>

      {/* Save / Discard */}
      {!saved && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-4 flex items-center justify-between gap-4"
        >
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Save this test?</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Saves results, syncs bookmarks and adds wrong answers to revision queue
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={13} /> Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary flex items-center gap-1.5 text-sm py-2"
            >
              <Save size={13} />
              {isSaving ? 'Saving...' : 'Save Test'}
            </button>
          </div>
        </motion.div>
      )}

      {saved && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-4 flex items-center gap-3"
          style={{ borderColor: '#22c55e40' }}
        >
          <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Test saved! Bookmarks synced and wrong answers added to revision queue.
          </p>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--border)' }}>
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400'
                : 'hover:bg-white/50 dark:hover:bg-white/5'
            }`}
            style={tab !== key ? { color: 'var(--text-secondary)' } : undefined}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                tab === key
                  ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                  : 'bg-gray-200 dark:bg-white/10'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {tab === 'overview' ? (
          <AnalysisOverview result={result} />
        ) : (
          <QuestionReview
            attempts={session.attempts}
            filter={
              tab === 'all' ? 'all'
              : tab === 'wrong' ? 'wrong'
              : tab === 'correct' ? 'correct'
              : 'bookmarked'
            }
          />
        )}
      </motion.div>
    </div>
  );
}
