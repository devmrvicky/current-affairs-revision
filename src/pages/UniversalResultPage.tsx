import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, CheckCircle2, XCircle, MinusCircle, ListChecks, RotateCcw, Home } from 'lucide-react';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { buildSessionQuestionIds, computeUniversalResult } from '../services/practiceService';
import type { UniversalQuestion } from '../types/universalQuestion';

export default function UniversalResultPage() {
  const navigate = useNavigate();
  const { session, startSession, clearSession } = usePracticeSessionStore();
  const [questionsById, setQuestionsById] = useState<Map<string, UniversalQuestion>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!session || !session.isCompleted) { navigate('/', { replace: true }); return; }
    if (loadedRef.current) return;
    loadedRef.current = true;
    resolveQuestionsByIds(session.questionIds).then((qs) => {
      setQuestionsById(new Map(qs.map((q) => [q.id, q])));
      setLoaded(true);
    });
  }, [session, navigate]);

  if (!session || !session.isCompleted || !loaded) {
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
      const questionIds = await buildSessionQuestionIds(session.config);
      startSession(session.config, questionIds);
      navigate('/session');
    } finally {
      setIsRetrying(false);
    }
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
        <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
          {session.config.mode === 'test' ? 'Test Completed' : 'Practice Completed'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{session.config.label}</p>
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
        <button onClick={() => navigate('/session/result/review')} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <ListChecks size={16} /> Review Answers
        </button>
        <button onClick={handleRetry} disabled={isRetrying} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
          <RotateCcw size={16} /> {isRetrying ? 'Starting…' : 'Retry'}
        </button>
        <button onClick={handleDone} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          <Home size={16} /> Done
        </button>
      </motion.div>
    </div>
  );
}
