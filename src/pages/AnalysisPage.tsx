import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, Trash2, Home, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { useChapterStore } from '../store/chapterStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { buildAnalysis, sessionToSavedTest, formatDateKey } from '../utils';
import { AnalysisOverview, QuestionReview } from '../components/analysis/AnalysisComponents';
import { getAllChapterTestPaths, getChapterNameForTestPath, getChapterList } from '../services/chapterRepository';
import { getAllMonthlyMagazineTestPaths } from '../services/monthlyMagazineRepository';
import { statsDB } from '../services/db';
import { notifyTestCompleted, notifyChapterCompleted, checkAchievements } from '../services/notificationTriggers';
import { recordSessionToLedger } from '../services/attemptLedgerService';

type TabKey = 'overview' | 'all' | 'wrong' | 'correct' | 'bookmarked' | 'marked';

async function fireConfetti(score: number) {
  if (score < 75) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  try {
    const mod = await import('canvas-confetti');
    mod.default({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  } catch {
    // Confetti is decorative — never let a failed/blocked dynamic import affect the analysis page itself.
  }
}

// Every test relPath that belongs to a chapter folder (vs. a daily current-affairs file)
const chapterTestPaths = getAllChapterTestPaths();
// Same idea for Monthly Magazine issues — a disjoint set of relPaths, e.g. "2025/July/Test 01.json".
// Monthly Magazine tests reuse chapterStore/chapterStatsDB below (generically keyed by
// fileName/chapterName already) rather than a separate stats store — same data, same code path.
const monthlyMagazineTestPaths = getAllMonthlyMagazineTestPaths();

// "2025/July/Test 01.json" → "July 2025" (used as the chapterName/label passed
// into the shared chapterStore — mirrors getChapterNameForTestPath's role).
function getMonthlyMagazineLabelForTestPath(relPath: string): string {
  const [year, month] = relPath.split('/');
  return month && year ? `${month} ${year}` : relPath;
}

export default function AnalysisPage() {
  const navigate = useNavigate();
  const { session, clearSession } = useQuizStore();
  const { save } = useHistoryStore();
  const { ingestFromAttempts } = useWrongQuestionsStore();
  const { syncFromAttempts: syncBookmarks } = useBookmarkStore();
  const { syncFromAttempts: syncMarkedReview } = useMarkedReviewStore();
  const { recordAttempt: recordChapterAttempt, getAggregateForChapter } = useChapterStore();
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
  const markedCount = session.attempts.filter((a) => a.markedForReview).length;
  const isChapterQuiz = chapterTestPaths.has(session.fileName);
  const isMonthlyMagazineQuiz = monthlyMagazineTestPaths.has(session.fileName);

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

      // Sync bookmarks and marked-for-review questions from session
      await syncBookmarks(session.attempts, session.fileName, session.date);
      await syncMarkedReview(session.attempts, session.fileName, session.date);

      // Increment daily goal with answered questions count
      await incrementGoal(result.totalQuestions);

      // Universal attempt ledger: chapter quizzes get accurate id
      // reconstruction + topic tagging; Practice-Configurator sessions
      // already carry their own universal id; daily current-affairs quizzes
      // reconstruct from the filename. Monthly Magazine / Mixed Revision /
      // Bookmarks Revision aren't confidently mappable and are skipped
      // inside recordSessionToLedger rather than guessed.
      await recordSessionToLedger(session, {
        chapterName: isChapterQuiz ? getChapterNameForTestPath(session.fileName) : undefined,
      });

      // Record chapter stats if this was a chapter quiz — chapterName is
      // derived from the test's folder, never from the test's own filename.
      if (isChapterQuiz) {
        const chapterName = getChapterNameForTestPath(session.fileName);
        await recordChapterAttempt(
          session.fileName,
          chapterName,
          result.score,
          result.correct,
          result.totalQuestions
        );

        const chapterInfo = getChapterList().find((c) => c.chapterName === chapterName);
        const aggregate = getAggregateForChapter(chapterName);
        if (chapterInfo && aggregate && aggregate.testsAttempted >= chapterInfo.tests.length) {
          notifyChapterCompleted(chapterName);
        }
      }

      // Record Monthly Magazine stats the same way — same store, same table,
      // just labeled by "Month Year" instead of a chapter folder name.
      if (isMonthlyMagazineQuiz) {
        const issueLabel = getMonthlyMagazineLabelForTestPath(session.fileName);
        await recordChapterAttempt(
          session.fileName,
          issueLabel,
          result.score,
          result.correct,
          result.totalQuestions
        );
      }

      notifyTestCompleted(result.score, result.correct, result.totalQuestions);
      try {
        const freshStats = await statsDB.get();
        if (freshStats) checkAchievements(freshStats.totalTests, freshStats.averageAccuracy, result.score);
      } catch {
        // Achievement checks are a non-critical bonus — never block the save flow on them.
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
    { key: 'marked', label: 'Marked', count: markedCount },
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
            {isMonthlyMagazineQuiz && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">Monthly Magazine</span>}
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
          className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
        >
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Save this test?</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Saves results, syncs bookmarks and adds wrong answers to revision queue
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleDiscard}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={13} /> Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 sm:flex-none btn-primary flex items-center justify-center gap-1.5 text-sm py-2.5 sm:py-2"
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

      {/* Tabs — horizontally scrollable so they never overflow/clip on small screens */}
      <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar" style={{ background: 'var(--border)' }}>
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
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
              : tab === 'marked' ? 'marked'
              : 'bookmarked'
            }
          />
        )}
      </motion.div>
    </div>
  );
}
