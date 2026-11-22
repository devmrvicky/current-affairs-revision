import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, ListChecks, RotateCcw, Home, MoreVertical } from 'lucide-react';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { buildSessionQuestionIds } from '../services/practiceService';
import { getPracticeTestById } from '../services/practiceTestRepository';
import { useCompletedPracticeSession } from '../hooks/useCompletedPracticeSession';
import { analyzePracticeSession } from '../services/practiceAnalysisService';
import { practiceResultContext } from '../services/resultContext';
import { universalAttemptsDB, type UniversalAttemptRecord } from '../services/db';
import { AnalysisView } from '../components/mock-analysis/AnalysisView';
import { PracticeAnalysisExtras } from '../components/mock-analysis/PracticeAnalysisExtras';
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
  // Earlier attempts of the same test come from the ledger; if it can't be read the comparison table simply has none.
  const [ledger, setLedger] = useState<UniversalAttemptRecord[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showResultActions, setShowResultActions] = useState(false);
  const loadedRef = useRef(false);
  // Set the moment a retake begins. Starting a new session replaces the completed one in the store, which
  // would otherwise trip the "nothing to show — go home" redirect below and beat the navigation to /session.
  const leavingRef = useRef(false);

  const session = completed.status === 'ready' ? completed.session : null;
  const isPastAttempt = completed.status === 'ready' && completed.isPastAttempt;

  // The same analysis the mock result page shows, built from this session's own recorded data.
  const analysis = useMemo(() => (session && loaded ? analyzePracticeSession(session, questionsById) : null), [session, loaded, questionsById]);
  const resultContext = useMemo(() => (session && loaded ? practiceResultContext(session, questionsById, ledger) : null), [session, loaded, questionsById, ledger]);

  useEffect(() => {
    if (completed.status === 'missing' && !attemptId) { if (!leavingRef.current) navigate('/', { replace: true }); return; }
    if (!session || loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([resolveQuestionsByIds(session.questionIds), universalAttemptsDB.getAll().catch(() => [] as UniversalAttemptRecord[])]).then(([qs, rows]) => {
      setQuestionsById(new Map(qs.map((q) => [q.id, q])));
      setLedger(rows);
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
          // Replace the result screen with the new attempt so browser Back doesn't land on a result that no longer exists,
          // and keep Close pointing at the screen this test was originally opened from.
          startTest(test, mode, { returnTo: session.returnRoute, replace: !isPastAttempt });
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
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
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

      <div className="flex justify-end">
        <div className="relative">
          <button type="button" onClick={() => setShowResultActions((open) => !open)} aria-haspopup="menu" aria-expanded={showResultActions}
            className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
            <MoreVertical size={15} /> More actions
          </button>
          {showResultActions && (
            <div role="menu" aria-label="Result actions" className="absolute right-0 top-full mt-2 z-30 w-52 rounded-xl py-1 shadow-xl"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <button role="menuitem" type="button" onClick={() => { setShowResultActions(false); navigate(attemptId ? `/session/result/${encodeURIComponent(attemptId)}/review` : '/session/result/review'); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                <ListChecks size={15} /> Review Answers
              </button>
              <button role="menuitem" type="button" disabled={isRetrying} onClick={() => { setShowResultActions(false); void handleRetry(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50" style={{ color: 'var(--text-primary)' }}>
                <RotateCcw size={15} /> {isRetrying ? 'Starting…' : session.config.testDefinitionId ? 'Retake Test' : 'Retry'}
              </button>
              <button role="menuitem" type="button" onClick={() => { setShowResultActions(false); handleDone(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                <Home size={15} /> {isPastAttempt ? 'Back' : 'Back Home'}
              </button>
            </div>
          )}
        </div>
      </div>

      {analysis && resultContext && <AnalysisView analysis={analysis} context={resultContext} variant="practice" additionalPerformance={<PracticeAnalysisExtras session={session} questionsById={questionsById} />} />}
    </div>
  );
}
