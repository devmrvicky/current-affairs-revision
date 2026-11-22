import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, ListChecks, RotateCcw, BarChart3, Home, MoreVertical } from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { recordSessionToLedger } from '../services/attemptLedgerService';
import { formatDateKey, sessionToSavedTest } from '../utils';
import { LegacyResultTables } from '../components/results/LegacyResultTables';
import type { DailyQuiz } from '../types';

export default function TestResultPage() {
  const navigate = useNavigate();
  const { session, startSession, clearSession } = useQuizStore();
  const { save: saveToHistory } = useHistoryStore();
  const { ingestFromAttempts } = useWrongQuestionsStore();
  const { syncFromAttempts: syncBookmarks } = useBookmarkStore();
  const { syncFromAttempts: syncMarkedReview } = useMarkedReviewStore();
  const { increment: incrementGoal, incrementTests } = useDailyGoalStore();

  const ingestedRef = useRef(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showResultActions, setShowResultActions] = useState(false);

  useEffect(() => {
    if (!session || !session.isCompleted || !session.testMeta) {
      navigate('/', { replace: true });
      return;
    }
    if (ingestedRef.current) return;
    ingestedRef.current = true;

    // Keep the existing single ingestion path for history, wrong questions, bookmarks,
    // marked-for-review, daily goals and the attempt ledger.
    const dateKey = formatDateKey(new Date());
    saveToHistory(sessionToSavedTest(session));
    ingestFromAttempts(session.attempts, dateKey, session.date, session.fileName);
    syncBookmarks(session.attempts, session.fileName, session.date);
    syncMarkedReview(session.attempts, session.fileName, session.date);
    incrementGoal(session.attempts.filter((attempt) => attempt.status !== 'unanswered').length);
    incrementTests();
    recordSessionToLedger(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session || !session.isCompleted || !session.testMeta) return null;

  function handleRetry() {
    if (!session || !session.testMeta) return;
    setIsRetrying(true);
    const quiz: DailyQuiz = {
      date: session.date,
      questions: session.attempts.map((attempt) => ({
        id: attempt.questionId,
        question: attempt.question,
        options: attempt.options,
        correctAnswer: attempt.correctAnswer,
        explanation: attempt.explanation,
      })),
    };
    startSession(quiz, `retry_${session.fileName}`, session.testMeta);
    navigate('/quiz');
  }

  function handleDone() {
    clearSession();
    navigate('/');
  }

  return (
    <div className="space-y-4 pb-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 pt-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
            <Trophy size={22} className="text-brand-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Test Completed</h1>
            <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{session.testMeta.examName}</p>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button type="button" onClick={() => setShowResultActions((open) => !open)} aria-haspopup="menu" aria-expanded={showResultActions}
            className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
            <MoreVertical size={15} /> More actions
          </button>
          {showResultActions && (
            <div role="menu" aria-label="Result actions" className="absolute right-0 top-full mt-2 z-30 w-48 rounded-xl py-1 shadow-xl"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <button role="menuitem" type="button" onClick={() => { setShowResultActions(false); navigate('/tests/result/review'); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                <ListChecks size={15} /> Review Answers
              </button>
              <button role="menuitem" type="button" disabled={isRetrying} onClick={() => { setShowResultActions(false); handleRetry(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50" style={{ color: 'var(--text-primary)' }}>
                <RotateCcw size={15} /> {isRetrying ? 'Starting…' : 'Retry Test'}
              </button>
              <button role="menuitem" type="button" onClick={() => { setShowResultActions(false); navigate('/statistics'); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                <BarChart3 size={15} /> View Analytics
              </button>
              <button role="menuitem" type="button" onClick={() => { setShowResultActions(false); handleDone(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                <Home size={15} /> Back Home
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <LegacyResultTables session={session} />
    </div>
  );
}
