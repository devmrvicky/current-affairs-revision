import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, CheckCircle2, XCircle, MinusCircle, ListChecks, RotateCcw, BarChart3, Home } from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { computeTestScore } from '../services/testScoringService';
import { recordSessionToLedger } from '../services/attemptLedgerService';
import { formatTime, formatDateKey, sessionToSavedTest } from '../utils';
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

  useEffect(() => {
    if (!session || !session.isCompleted || !session.testMeta) {
      navigate('/', { replace: true });
      return;
    }
    if (ingestedRef.current) return;
    ingestedRef.current = true;

    // Reuse exactly the same ingestion the existing (Current Affairs)
    // analysis flow uses — wrong questions / bookmarks / marked-for-review /
    // daily goal all work identically for a test session, no separate
    // pipeline (master prompt §22, §70).
    const dateKey = formatDateKey(new Date());
    saveToHistory(sessionToSavedTest(session));
    ingestFromAttempts(session.attempts, dateKey, session.date, session.fileName);
    syncBookmarks(session.attempts, session.fileName, session.date);
    syncMarkedReview(session.attempts, session.fileName, session.date);
    incrementGoal(session.attempts.filter((a) => a.status !== 'unanswered').length);
    incrementTests();
    recordSessionToLedger(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session || !session.isCompleted || !session.testMeta) return null;

  const score = computeTestScore(session, session.testMeta.marking);
  const hasNegativeMarking = session.testMeta.marking.negativeMarks > 0;

  function handleRetry() {
    if (!session || !session.testMeta) return;
    setIsRetrying(true);
    const quiz: DailyQuiz = {
      date: session.date,
      questions: session.attempts.map((a) => ({
        id: a.questionId,
        question: a.question,
        options: a.options,
        correctAnswer: a.correctAnswer,
        explanation: a.explanation,
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
    <div className="space-y-6 pb-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-3">
          <Trophy size={28} className="text-brand-500" />
        </div>
        <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Test Completed</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{session.testMeta.examName}</p>
      </motion.div>

      {/* Score */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-6 text-center">
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Score</p>
        <p className="text-4xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
          {score.marks} <span className="text-lg font-medium" style={{ color: 'var(--text-muted)' }}>/ {score.maxMarks}</span>
        </p>
        <p className="text-sm mt-1" style={{ color: score.percentage >= 0 ? 'var(--text-secondary)' : '#ef4444' }}>
          {score.percentage}%
        </p>
        {hasNegativeMarking && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            +{session.testMeta.marking.marksPerCorrect} correct · −{session.testMeta.marking.negativeMarks} incorrect
          </p>
        )}
      </motion.div>

      {/* Breakdown */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{score.accuracy}%</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Accuracy</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{formatTime(score.timeTakenSeconds)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Time Used</p>
        </div>
        <div className="card p-4 text-center flex flex-col items-center">
          <CheckCircle2 size={16} className="text-green-500 mb-1" />
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{score.correct}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct</p>
        </div>
        <div className="card p-4 text-center flex flex-col items-center">
          <XCircle size={16} className="text-red-500 mb-1" />
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{score.incorrect}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Incorrect</p>
        </div>
        <div className="card p-4 text-center flex flex-col items-center col-span-2">
          <MinusCircle size={16} style={{ color: 'var(--text-muted)' }} className="mb-1" />
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{score.skipped}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skipped</p>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-2.5">
        <button onClick={() => navigate('/tests/result/review')} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <ListChecks size={16} /> Review Answers
        </button>
        <button onClick={handleRetry} disabled={isRetrying} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <RotateCcw size={16} /> Retry Test
        </button>
        <button onClick={() => navigate('/statistics')} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <BarChart3 size={16} /> View Analytics
        </button>
        <button onClick={handleDone} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          <Home size={16} /> Done
        </button>
      </motion.div>
    </div>
  );
}
