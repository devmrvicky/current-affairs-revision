import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Flag, ChevronLeft, ChevronRight, LayoutGrid, X, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { recordPracticeSessionAttempts } from '../services/attemptLedgerService';
import { QuizTimer } from '../components/quiz/QuizTimer';
import { QuestionPalette } from '../components/quiz/QuestionPalette';
import { getOptionLabel } from '../utils';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { QuestionAttempt } from '../types';
import type { SessionQuestionState } from '../types/practiceSession';

// This page is the Phase 8 universal engine: it works purely in terms of
// UniversalQuestion ids resolved live from the repository — never DailyQuiz,
// never toLegacyQuestion. QuizTimer and QuestionPalette are reused as-is
// (neither ever depended on the legacy session shape). QuestionPalette's
// prop type IS the legacy QuestionAttempt[], so `toDisplayAttempts` below
// builds a presentation-only view for that one component; it is never
// written back anywhere and the ledger never sees it (master prompt §2,
// §14: reuse UI, refactor data dependencies underneath it).

function toDisplayAttempts(questionIds: string[], states: SessionQuestionState[], questionsById: Map<string, UniversalQuestion>): QuestionAttempt[] {
  return questionIds.map((qid, idx) => {
    const state = states[idx];
    const q = questionsById.get(qid);
    const selectedOption = q?.options.find((o) => o.id === state.selectedAnswer);
    const correctOption = q?.options.find((o) => o.id === q.correctAnswer);
    const status: QuestionAttempt['status'] = !state.selectedAnswer ? 'unanswered' : state.selectedAnswer === q?.correctAnswer ? 'correct' : 'wrong';
    return {
      questionId: idx,
      question: q?.question ?? '(unresolved question)',
      options: q?.options.map((o) => o.text) ?? [],
      correctAnswer: correctOption?.text ?? '',
      explanation: q?.explanation ?? '',
      selectedAnswer: selectedOption?.text ?? null,
      status,
      timeTaken: state.timeTaken,
      bookmarked: false,
      markedForReview: state.isMarkedForReview,
    };
  });
}

export default function UniversalSessionPage() {
  const navigate = useNavigate();
  const {
    session, selectAnswer, toggleMarkForReview, goToQuestion, nextQuestion,
    pauseSession, resumeSession, completeSession, clearSession,
  } = usePracticeSessionStore();

  const [questionsById, setQuestionsById] = useState<Map<string, UniversalQuestion>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const finishingRef = useRef(false);

  const isTestMode = session?.config.mode === 'test';
  // Single source of truth for pause UI — session.pausedAt, not separate
  // component state. A separate boolean would desync from the real session
  // state across a refresh (Phase 8.5 §10): the timer already derives from
  // session.pausedAt correctly, but a local flag defaulting to `false` on
  // remount would show "not paused" even while the session actually is.
  const isPaused = !!session?.pausedAt;

  // Resolve content once per session (not on every answer) — question
  // identity never changes mid-session, only user state does.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    resolveQuestionsByIds(session.questionIds).then((qs) => {
      if (cancelled) return;
      setQuestionsById(new Map(qs.map((q) => [q.id, q])));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [session?.id]);

  useEffect(() => {
    if (!session) { navigate('/', { replace: true }); return; }
    if (session.isCompleted) { navigate('/session/result', { replace: true }); }
  }, [session, navigate]);

  useEffect(() => {
    setQuestionStartTime(Date.now());
  }, [session?.currentIndex]);

  // §3/§4/§5: record-then-complete, guarded by a synchronous ref (not React
  // state, which updates asynchronously and can't stop a second call that
  // fires before the first re-render — e.g. timer expiry racing a manual
  // Submit click). If recording throws, we deliberately do NOT call
  // completeSession() or navigate: the session stays "in progress" so the
  // user can just hit Submit again, and because ledger records use a
  // deterministic sessionId+questionId key (attemptLedgerService), a retry
  // safely overwrites rather than duplicating any partially-written records.
  const finishAndRecord = useCallback(async () => {
    if (!session || finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    try {
      await recordPracticeSessionAttempts(session, questionsById);
      completeSession();
      navigate('/session/result');
    } catch (err) {
      console.error('Failed to record session attempts', err);
      toast.error("Couldn't save your results — check your connection and try submitting again.");
      finishingRef.current = false;
      setIsFinishing(false);
    }
  }, [session, questionsById, completeSession, navigate]);

  const handleExpire = useCallback(() => { finishAndRecord(); }, [finishAndRecord]);

  if (!session || !loaded) {
    return (
      <div className="max-w-2xl mx-auto pt-10 space-y-3">
        <div className="card h-24 shimmer" style={{ background: 'var(--border)' }} />
        <div className="card h-64 shimmer" style={{ background: 'var(--border)' }} />
      </div>
    );
  }

  const currentId = session.questionIds[session.currentIndex];
  const currentQuestion = questionsById.get(currentId);
  const currentState = session.states[session.currentIndex];
  const isAnswered = currentState.selectedAnswer !== null;
  const isLast = session.currentIndex >= session.questionIds.length - 1;
  const progress = ((session.currentIndex + 1) / session.questionIds.length) * 100;
  const unansweredCount = session.states.filter((s) => s.selectedAnswer === null).length;
  const markedCount = session.states.filter((s) => s.isMarkedForReview).length;
  const displayAttempts = toDisplayAttempts(session.questionIds, session.states, questionsById);

  function handleSelect(optionId: string) {
    if (isAnswered) return;
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
    selectAnswer(optionId, timeTaken);
  }

  function handleNext() {
    if (isLast) {
      if (isTestMode) setShowSubmitConfirm(true);
      else finishAndRecord();
    } else {
      nextQuestion();
    }
  }

  function handleQuit() {
    if (window.confirm('Quit this session? Your progress will be lost and nothing will be recorded.')) {
      clearSession();
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="sticky top-0 z-30 glass border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-auto min-h-14 py-2 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button onClick={handleQuit} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0" aria-label="Quit">
              <X size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xs sm:text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {session.config.label}
              </h1>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }}>
                Q{session.currentIndex + 1} / {session.questionIds.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <QuizTimer
              startTime={session.startedAt}
              totalPausedTime={session.totalPausedTime}
              isPaused={!!session.pausedAt}
              pausedAt={session.pausedAt}
              durationSeconds={session.config.durationSeconds}
              onExpire={session.config.durationSeconds ? handleExpire : undefined}
            />
            {/* Pause is deliberately unavailable in Test Mode — a timed exam
                shouldn't be arbitrarily pausable (Phase 8.5 §9). Practice
                Mode keeps it since there's no clock pressure to protect. */}
            {!isTestMode && (
              <button
                onClick={() => (isPaused ? resumeSession() : pauseSession())}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                aria-label={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play size={16} style={{ color: 'var(--text-primary)' }} /> : <Pause size={16} style={{ color: 'var(--text-secondary)' }} />}
              </button>
            )}
            <button onClick={() => setShowPalette(true)} className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Question palette">
              <LayoutGrid size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>
        <div className="h-1" style={{ background: 'var(--border)' }}>
          <motion.div className="h-full bg-gradient-to-r from-brand-500 to-purple-600" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>
      </header>

      <AnimatePresence>
        {isPaused && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="card p-10 text-center">
              <div className="text-5xl mb-4">⏸️</div>
              <h2 className="text-2xl font-display font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Paused</h2>
              <button onClick={resumeSession} className="btn-primary flex items-center gap-2 mx-auto"><Play size={16} /> Resume</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={session.currentIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}>
                <div className="card p-4 sm:p-6">
                  {!currentQuestion ? (
                    // Question resolution failed — show it plainly rather than crash or silently substitute another question (master prompt §22).
                    <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)' }}>
                      <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>This question couldn't be loaded</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Question id: {currentId}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3 mb-6">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold text-sm flex-shrink-0 mt-0.5">
                            {session.currentIndex + 1}
                          </span>
                          <p className="text-base md:text-lg leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>{currentQuestion.question}</p>
                        </div>
                        <button
                          onClick={toggleMarkForReview}
                          className={`p-2 rounded-xl transition-colors flex-shrink-0 ${currentState.isMarkedForReview ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'}`}
                          style={!currentState.isMarkedForReview ? { color: 'var(--text-muted)' } : undefined}
                          title="Mark for review"
                        >
                          <Flag size={16} fill={currentState.isMarkedForReview ? 'currentColor' : 'none'} />
                        </button>
                      </div>

                      <div className="space-y-3">
                        {currentQuestion.options.map((option, idx) => {
                          const label = getOptionLabel(idx);
                          const isSelected = option.id === currentState.selectedAnswer;
                          const isCorrectOption = option.id === currentQuestion.correctAnswer;
                          let cls = 'option-btn';
                          let badgeCls = 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400';

                          if (isTestMode) {
                            if (isSelected) { cls += ' selected-neutral'; badgeCls = 'bg-brand-500 text-white'; }
                          } else if (isAnswered) {
                            if (isCorrectOption) { cls += ' reveal-correct'; badgeCls = 'bg-green-500 text-white'; }
                            else if (isSelected) { cls += ' selected-wrong'; badgeCls = 'bg-red-500 text-white'; }
                            else cls += ' neutral-disabled';
                          }

                          return (
                            <motion.button
                              key={option.id}
                              whileHover={!isAnswered || isTestMode ? { scale: 1.005 } : {}}
                              whileTap={!isAnswered || isTestMode ? { scale: 0.995 } : {}}
                              className={cls}
                              onClick={() => handleSelect(option.id)}
                              disabled={isAnswered && !isTestMode}
                            >
                              <span className="inline-flex items-center gap-3">
                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${badgeCls}`}>{label}</span>
                                {option.text}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Practice-mode reveal — driven by config.mode, never the legacy global setting (master prompt §11) */}
                      {!isTestMode && isAnswered && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 p-4 rounded-xl" style={{ background: 'var(--border)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            {currentState.selectedAnswer === currentQuestion.correctAnswer ? (
                              <><CheckCircle2 size={16} className="text-green-500" /><span className="text-sm font-semibold text-green-600 dark:text-green-400">Correct</span></>
                            ) : (
                              <><XCircle size={16} className="text-red-500" /><span className="text-sm font-semibold text-red-600 dark:text-red-400">Incorrect</span></>
                            )}
                          </div>
                          {currentQuestion.explanation && (
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{currentQuestion.explanation}</p>
                          )}
                          <button onClick={handleNext} className="btn-primary text-sm py-2 px-5 mt-4 flex items-center gap-1">
                            {isLast ? 'Finish' : 'Next'} {!isLast && <ChevronRight size={14} />}
                          </button>
                        </motion.div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {(isTestMode || !isAnswered) && (
              <div className="flex justify-between mt-4">
                <button className="btn-ghost flex items-center gap-1 text-sm" onClick={() => goToQuestion(Math.max(0, session.currentIndex - 1))} disabled={session.currentIndex === 0}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <button className="btn-primary flex items-center gap-1 text-sm" onClick={handleNext} disabled={isFinishing}>
                  {isLast ? (isTestMode ? 'Submit Test' : 'Skip') : isTestMode ? 'Next' : 'Skip'}
                  {!isLast && <ChevronRight size={16} />}
                </button>
              </div>
            )}
          </div>

          <div className="hidden md:block w-56 flex-shrink-0">
            <div className="sticky top-20">
              <QuestionPalette attempts={displayAttempts} currentIndex={session.currentIndex} visitedIndices={session.visitedIndices} onJump={goToQuestion} hideCorrectness={isTestMode} />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowSubmitConfirm(false)}>
            <motion.div initial={{ y: 20, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.97 }} className="card p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={26} className="text-amber-500" />
              </div>
              <h2 className="text-lg font-display font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Submit Test?</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                {unansweredCount} unanswered{markedCount > 0 ? `, ${markedCount} marked for review` : ''}.
              </p>
              <button onClick={finishAndRecord} disabled={isFinishing} className="btn-primary text-sm py-2.5 w-full">
                {isFinishing ? 'Submitting…' : 'Submit Test'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPalette && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowPalette(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 bottom-0 z-50 w-72 p-4 overflow-y-auto" style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>Question Palette</h2>
                <button onClick={() => setShowPalette(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"><X size={16} style={{ color: 'var(--text-secondary)' }} /></button>
              </div>
              <QuestionPalette attempts={displayAttempts} currentIndex={session.currentIndex} visitedIndices={session.visitedIndices} onJump={(idx) => { goToQuestion(idx); setShowPalette(false); }} hideCorrectness={isTestMode} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
