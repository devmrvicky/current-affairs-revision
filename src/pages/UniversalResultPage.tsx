import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, CheckCircle2, XCircle, MinusCircle, ListChecks, RotateCcw, Home } from 'lucide-react';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { buildSessionQuestionIds, computeUniversalResult } from '../services/practiceService';
import { getPracticeTestById } from '../services/practiceTestRepository';
import { useCompletedPracticeSession } from '../hooks/useCompletedPracticeSession';
import { useStartPracticeTest } from '../hooks/useStartPracticeTest';
import type { UniversalQuestion } from '../types/universalQuestion';

export default function UniversalResultPage() {
  const navigate = useNavigate();
  // `/session/result` shows the session that just finished; `/session/result/:attemptId` reopens a past attempt from the ledger.
  const { attemptId } = useParams<{ attemptId?: string }>();
  const completed = useCompletedPracticeSession(attemptId);
  const { startSession, clearSession } = usePracticeSessionStore();
  const { start: startTest } = useStartPracticeTest();
  const [questionsById, setQuestionsById] = useState<Map<string, UniversalQuestion>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const loadedRef = useRef(false);
  // Set the moment a retake begins. Starting a new session replaces the completed one in the store, which
  // would otherwise trip the "nothing to show — go home" redirect below and beat the navigation to /session.
  const leavingRef = useRef(false);

  const session = completed.status === 'ready' ? completed.session : null;
  const isPastAttempt = completed.status === 'ready' && completed.isPastAttempt;

  useEffect(() => {
    if (completed.status === 'missing' && !attemptId) { if (!leavingRef.current) navigate('/', { replace: true }); return; }
    if (!session || loadedRef.current) return;
    loadedRef.current = true;
    resolveQuestionsByIds(session.questionIds).then((qs) => {
      setQuestionsById(new Map(qs.map((q) => [q.id, q])));
      setLoaded(true);
    });
  }, [completed.status, attemptId, session, navigate]);

  if (completed.status === 'missing' && attemptId) {
    return (
      <div className="max-w-md mx-auto pt-16 text-center space-y-3">
        <p className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>This attempt can't be reopened</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>It was recorded before detailed attempt review existed, so only its score was kept.</p>
        <button onClick={() => navigate(-1)} className="btn-primary">Go back</button>
      </div>
    );
  }
  if (!session || !loaded) {
    return <div className="max-w-2xl mx-auto pt-10"><div className="card h-64 shimmer" style={{ background: 'var(--border)' }} /></div>;
  }

  const result = computeUniversalResult(session, questionsById);
  const hasNegativeMarking = (session.config.marking?.negativeMarks ?? 0) > 0;

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function handleRetry() {
    if (!session) return;
    setIsRetrying(true);
    try {
      const { testDefinitionId, examId, subjectIds, mode } = session.config;
      if (testDefinitionId) {
        // A fixed test: relaunch THAT test's definition and question set — never a re-rolled pool.
        const test = await getPracticeTestById(examId, subjectIds[0], testDefinitionId);
        if (test) {
          leavingRef.current = true;
          if (!startTest(test, mode)) leavingRef.current = false; // learner declined to discard an in-progress session
          return;
        }
        // The definition is gone (source file renamed/removed): the exact questions this attempt used are still the safest "same test".
        leavingRef.current = true;
        startSession(session.config, session.questionIds);
        navigate('/session');
        return;
      }
      // Quick Practice has no fixed identity — a retry is a fresh draw with the same settings.
      const questionIds = await buildSessionQuestionIds(session.config);
      leavingRef.current = true;
      startSession(session.config, questionIds);
      navigate('/session');
    } finally {
      setIsRetrying(false);
    }
  }

  function handleDone() {
    if (isPastAttempt) { navigate(-1); return; }
    clearSession();
    navigate('/');
  }

  return (
    <div className="space-y-6 pb-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-3">
          <Trophy size={28} className="text-brand-500" />
        </div>
        <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
          {session.config.mode === 'test' ? 'Test Completed' : 'Practice Completed'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{session.config.label}</p>
        {isPastAttempt && session.completedAt && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Past attempt · {new Date(session.completedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-6 text-center">
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Score</p>
        <p className="text-4xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
          {result.marks} <span className="text-lg font-medium" style={{ color: 'var(--text-muted)' }}>/ {result.maxMarks}</span>
        </p>
        <p className="text-sm mt-1" style={{ color: result.percentage >= 0 ? 'var(--text-secondary)' : '#ef4444' }}>{result.percentage}%</p>
        {hasNegativeMarking && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            +{session.config.marking!.marksPerCorrect} correct · −{session.config.marking!.negativeMarks} incorrect
          </p>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{result.accuracy}%</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Accuracy</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{formatTime(result.timeTakenSeconds)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Time Used</p>
        </div>
        <div className="card p-4 text-center flex flex-col items-center">
          <CheckCircle2 size={16} className="text-green-500 mb-1" />
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{result.correct}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct</p>
        </div>
        <div className="card p-4 text-center flex flex-col items-center">
          <XCircle size={16} className="text-red-500 mb-1" />
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{result.incorrect}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Incorrect</p>
        </div>
        <div className="card p-4 text-center flex flex-col items-center col-span-2">
          <MinusCircle size={16} style={{ color: 'var(--text-muted)' }} className="mb-1" />
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{result.skipped}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skipped</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-2.5">
        <button onClick={() => navigate(attemptId ? `/session/result/${encodeURIComponent(attemptId)}/review` : '/session/result/review')} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <ListChecks size={16} /> Review Answers
        </button>
        <button onClick={handleRetry} disabled={isRetrying} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <RotateCcw size={16} /> {isRetrying ? 'Starting…' : session.config.testDefinitionId ? 'Retake Test' : 'Retry'}
        </button>
        <button onClick={handleDone} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          <Home size={16} /> {isPastAttempt ? 'Back' : 'Done'}
        </button>
      </motion.div>
    </div>
  );
}
