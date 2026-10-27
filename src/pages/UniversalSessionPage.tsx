import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Flag, ChevronLeft, ChevronRight, LayoutGrid, X, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { recordPracticeSessionAttempts } from '../services/attemptLedgerService';
import { QuizTimer } from '../components/quiz/QuizTimer';
import { QuestionPalette } from '../components/quiz/QuestionPalette';
import { ExamShell } from '../components/exam/ExamShell';
import { QuestionMarkdownRenderer, QuestionOptionContent } from '../components/mock/QuestionMarkdownRenderer';
import { useExamKeyboardNavigation } from '../hooks/useExamKeyboardNavigation';
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
//
// Layout: the live test fills the viewport via ExamShell (header / question
// area / palette / pinned navigation bar). Question, option and explanation
// text go through QuestionMarkdownRenderer — the same renderer the mock shell
// uses — so maths (KaTeX), images and Hindi text render correctly here too.

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
    session, selectAnswer, toggleMarkForReview, goToQuestion, addTimeSpent,
    pauseSession, resumeSession, completeSession, clearSession,
  } = usePracticeSessionStore();
  const { increment: incrementQuestionsGoal, incrementTests: incrementTestsGoal } = useDailyGoalStore();

  const [questionsById, setQuestionsById] = useState<Map<string, UniversalQuestion>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const finishingRef = useRef(false);

  // When the learner arrived on the current question (ms). A ref, not state: it
  // is only ever read inside handlers, and updating it must not re-render.
  const enteredAtRef = useRef(0); // set when the first question is shown (effect below)
  const pauseStartedAtRef = useRef<number | null>(null);

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
    // Deliberately depend on session?.id only, not the full session object:
    // session mutates on every answer, and re-running this would re-fetch
    // content and needlessly reset `loaded` mid-attempt. session.questionIds
    // is fixed for the session's lifetime, so id alone is the correct
    // trigger for "did the session itself change".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    if (!session) { navigate('/', { replace: true }); return; }
    if (session.isCompleted) { navigate('/session/result', { replace: true }); }
  }, [session, navigate]);

  // A new question starts a new dwell period — and so does the moment the content
  // finishes loading, so a cold start's loading time isn't billed to question 1.
  useEffect(() => {
    enteredAtRef.current = Date.now();
  }, [session?.currentIndex, loaded]);

  // Time spent paused doesn't count toward a question.
  useEffect(() => {
    if (session?.pausedAt) {
      pauseStartedAtRef.current = session.pausedAt;
    } else if (pauseStartedAtRef.current !== null) {
      enteredAtRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
  }, [session?.pausedAt]);

  /** Seconds on the current question since the learner arrived (or last flushed). */
  const dwellSeconds = useCallback(() => Math.max(0, Math.floor((Date.now() - enteredAtRef.current) / 1000)), []);

  /** Banks the dwell time on the current question into the session before leaving it. Answered questions are frozen by the store. */
  const flushDwell = useCallback(() => {
    const s = usePracticeSessionStore.getState().session;
    if (!s) return;
    const seconds = dwellSeconds();
    if (seconds > 0) addTimeSpent(s.currentIndex, seconds);
    enteredAtRef.current = Date.now();
  }, [addTimeSpent, dwellSeconds]);

  /** The one way to change question — buttons, palette and arrow keys all come through here so time tracking can't be skipped. */
  const navigateTo = useCallback((index: number) => {
    const s = usePracticeSessionStore.getState().session;
    if (!s || index < 0 || index >= s.questionIds.length || index === s.currentIndex) return;
    flushDwell();
    goToQuestion(index);
  }, [flushDwell, goToQuestion]);

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
      flushDwell();
      // Re-read after the flush so the last question's time is part of what gets recorded.
      const latest = usePracticeSessionStore.getState().session ?? session;
      await recordPracticeSessionAttempts(latest, questionsById);
      completeSession();
      const answeredCount = latest.states.filter((s) => s.selectedAnswer !== null).length;
      incrementQuestionsGoal(answeredCount);
      incrementTestsGoal();
      navigate('/session/result');
    } catch (err) {
      console.error('Failed to record session attempts', err);
      toast.error("Couldn't save your results — check your connection and try submitting again.");
      finishingRef.current = false;
      setIsFinishing(false);
    }
  }, [session, questionsById, flushDwell, completeSession, navigate, incrementQuestionsGoal, incrementTestsGoal]);

  const handleExpire = useCallback(() => { finishAndRecord(); }, [finishAndRecord]);

  // ← / → between questions. Off while any overlay owns the keyboard.
  const total = session?.questionIds.length ?? 0;
  const currentIndex = session?.currentIndex ?? 0;
  useExamKeyboardNavigation({
    enabled: loaded && !!session && !isPaused && !showPalette && !showSubmitConfirm && !isFinishing,
    canGoPrevious: currentIndex > 0,
    canGoNext: currentIndex < total - 1,
    onPrevious: () => navigateTo(currentIndex - 1),
    onNext: () => navigateTo(currentIndex + 1),
  });

  if (!session || !loaded) {
    return (
      <div className="exam-shell" aria-busy="true" aria-label="Loading test">
        <div className="exam-shell__header" style={{ height: 56 }} />
        <div className="exam-shell__body"><div className="exam-shell__main p-4 space-y-3">
          <div className="h-8 w-2/3 rounded-xl shimmer" style={{ background: 'var(--border)' }} />
          <div className="h-48 rounded-xl shimmer" style={{ background: 'var(--border)' }} />
        </div></div>
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
    // Total time on this question = time banked on earlier visits + this visit.
    const timeTaken = currentState.timeTaken + dwellSeconds();
    selectAnswer(optionId, timeTaken);
  }

  function handleNext() {
    if (isLast) {
      if (isTestMode) setShowSubmitConfirm(true);
      else finishAndRecord();
    } else {
      navigateTo(session!.currentIndex + 1);
    }
  }

  function handleQuit() {
    if (window.confirm('Quit this session? Your progress will be lost and nothing will be recorded.')) {
      clearSession();
      navigate('/');
    }
  }

  const header = (
    <>
      <div className="px-3 sm:px-4 min-h-14 py-2 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button onClick={handleQuit} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0" aria-label="Quit">
            <X size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-xs sm:text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {session.config.label}
            </h1>
            <p className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }} data-testid="question-position">
              Q{session.currentIndex + 1} / {session.questionIds.length}
              <span className="hidden sm:inline"> · {isTestMode ? 'Test' : 'Practice'}</span>
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
          <button onClick={() => setShowPalette(true)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Question palette">
            <LayoutGrid size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>
      <div className="h-1" style={{ background: 'var(--border)' }} role="progressbar" aria-valuemin={1} aria-valuemax={session.questionIds.length} aria-valuenow={session.currentIndex + 1} aria-label="Question progress">
        <motion.div className="h-full bg-gradient-to-r from-brand-500 to-purple-600" animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} />
      </div>
    </>
  );

  const footer = (
    <div className="px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
      <button
        className="px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'var(--card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        onClick={() => navigateTo(session.currentIndex - 1)}
        disabled={session.currentIndex === 0}
      >
        <ChevronLeft size={14} /> Previous
      </button>
      <button
        onClick={toggleMarkForReview}
        aria-pressed={currentState.isMarkedForReview}
        className="px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5"
        style={{
          background: currentState.isMarkedForReview ? 'rgba(245,158,11,0.15)' : 'var(--card)',
          color: currentState.isMarkedForReview ? '#b45309' : 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        <Flag size={14} fill={currentState.isMarkedForReview ? 'currentColor' : 'none'} />
        <span className="hidden xs:inline">Mark for Review</span><span className="xs:hidden">Mark</span>
      </button>
      <button className="btn-primary px-4 sm:px-5 py-2.5 text-xs sm:text-sm flex items-center gap-1" onClick={handleNext} disabled={isFinishing}>
        {isLast ? (isTestMode ? 'Submit Test' : 'Finish') : isTestMode ? 'Next' : isAnswered ? 'Next' : 'Skip'}
        {!isLast && <ChevronRight size={14} />}
      </button>
    </div>
  );

  const overlays = (
    <>
      <AnimatePresence>
        {isPaused && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} role="dialog" aria-modal="true" aria-label="Paused">
            <div className="card p-10 text-center">
              <div className="text-5xl mb-4">⏸️</div>
              <h2 className="text-2xl font-display font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Paused</h2>
              <button onClick={resumeSession} className="btn-primary flex items-center gap-2 mx-auto"><Play size={16} /> Resume</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowSubmitConfirm(false)} role="dialog" aria-modal="true" aria-label="Submit test">
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
              <button onClick={() => setShowSubmitConfirm(false)} disabled={isFinishing} className="btn-ghost text-sm w-full mt-2">Go back</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPalette && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowPalette(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] p-4 overflow-y-auto" style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)', paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }} role="dialog" aria-modal="true" aria-label="Question palette">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>Question Palette</h2>
                <button onClick={() => setShowPalette(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close palette"><X size={16} style={{ color: 'var(--text-secondary)' }} /></button>
              </div>
              <QuestionPalette attempts={displayAttempts} currentIndex={session.currentIndex} visitedIndices={session.visitedIndices} onJump={(idx) => { navigateTo(idx); setShowPalette(false); }} hideCorrectness={isTestMode} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <ExamShell
      header={header}
      footer={footer}
      overlays={overlays}
      palette={<QuestionPalette attempts={displayAttempts} currentIndex={session.currentIndex} visitedIndices={session.visitedIndices} onJump={navigateTo} hideCorrectness={isTestMode} />}
    >
      <AnimatePresence mode="wait">
        <motion.div key={session.currentIndex} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }} className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6">
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
              <div className="flex items-start gap-3 mb-5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold text-sm flex-shrink-0 mt-0.5">
                  {session.currentIndex + 1}
                </span>
                <div className="min-w-0 flex-1 text-base md:text-lg leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>
                  <QuestionMarkdownRenderer content={currentQuestion.question} baseDir={currentQuestion.sourceMockBaseDir} />
                </div>
              </div>

              <div className="space-y-3" role="group" aria-label="Answer options">
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
                      whileHover={!isAnswered || isTestMode ? { scale: 1.002 } : {}}
                      whileTap={!isAnswered || isTestMode ? { scale: 0.997 } : {}}
                      className={cls}
                      onClick={() => handleSelect(option.id)}
                      disabled={isAnswered && !isTestMode}
                      aria-pressed={isSelected}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${badgeCls}`}>{label}</span>
                        <span className="min-w-0 flex-1"><QuestionOptionContent text={option.text} image={option.image} baseDir={currentQuestion.sourceMockBaseDir} /></span>
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
                    <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      <QuestionMarkdownRenderer content={currentQuestion.explanation} baseDir={currentQuestion.sourceMockBaseDir} />
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </ExamShell>
  );
}
