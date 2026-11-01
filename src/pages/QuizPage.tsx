import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Bookmark, Flag, ChevronLeft, ChevronRight, LayoutGrid, X, AlertTriangle, Search, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useSettingsStore } from '../store/statsStore';
import { QuizTimer } from '../components/quiz/QuizTimer';
import { QuestionPalette } from '../components/quiz/QuestionPalette';
import { AnswerBottomSheet, EXPLANATION_DRAWER_WIDTH } from '../components/quiz/AnswerBottomSheet';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { QuestionWebSearchSheet } from '../components/quiz/QuestionWebSearchSheet';
import { useExamKeyboardNavigation } from '../hooks/useExamKeyboardNavigation';
import { useSessionPresence } from '../hooks/useSessionPresence';
import { MarkPurposeSheet } from '../components/exam/MarkPurposeSheet';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { effectivePurpose, getMarkPurposeInfo, type MarkPurpose } from '../types/questionMark';
import { useExitTest } from '../hooks/useExitTest';
import { getOptionLabel } from '../utils';

export default function QuizPage() {
  const navigate = useNavigate();
  const {
    session, submitAnswer, nextQuestion, goToQuestion, pauseSession, resumeSession,
    toggleBookmark, setMarkPurpose, completeSession,
  } = useQuizStore();
  const { settings } = useSettingsStore();

  // Mock Test Engine: sessions started via the Practice/Test configurator with
  // testMeta.isTest render an exam-like, no-reveal experience. Every other
  // session (daily current affairs, chapter practice, revision...) is
  // completely unaffected — isTestMode is false and every branch below falls
  // through to the exact original behavior.
  const isTestMode = !!session?.testMeta?.isTest;

  const [showPalette, setShowPalette] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [manualPause, setManualPause] = useState(false);
  const [hiddenPause, setHiddenPause] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [showMarkSheet, setShowMarkSheet] = useState(false);
  const isDesktop = useIsDesktop();
  const saveAttemptMark = useMarkedReviewStore((s) => s.saveAttemptMark);

  // Leaving saves the session and stops its clock (never discards or submits it); Close steps back to the screen it was entered from.
  useSessionPresence('legacy', !!session);
  const exitTest = useExitTest('legacy', session ?? undefined);

  // Reading the explanation, or searching the web, auto-pauses the timer;
  // combine with manual pause and tab-hidden so any of the four keeps the
  // session paused. Test mode never opens the explanation sheet, so
  // sheetPause naturally stays false there.
  const sheetPause = (showSheet && settings.showExplanation && !isTestMode) || searchSheetOpen;
  const anyPause = manualPause || hiddenPause || sheetPause;
  const prevAnyPauseRef = useRef(false);

  // Redirect guards
  useEffect(() => {
    if (!session) { navigate('/', { replace: true }); return; }
    if (session.isCompleted) {
      navigate(session.testMeta?.isTest ? '/tests/result' : '/analysis', { replace: true });
      return;
    }
  }, [session, navigate]);

  // Reset timer and hide sheet when question changes
  useEffect(() => {
    setQuestionStartTime(Date.now());
    setShowSheet(false);
  }, [session?.currentIndex]);

  // Show sheet when answer is submitted — test mode never reveals per-question, so skip entirely.
  useEffect(() => {
    if (!session || isTestMode) return;
    const current = session.attempts[session.currentIndex];
    if (current?.status !== 'unanswered') {
      setShowSheet(true);
    }
  }, [session?.attempts[session?.currentIndex ?? 0]?.status, isTestMode]);

  // Commit pause/resume to the persisted session exactly once per transition,
  // regardless of which source (manual button, explanation/search sheet
  // open, tab hidden) caused it. This keeps session.totalPausedTime accurate
  // for stats while letting all sources combine without double-pausing.
  useEffect(() => {
    if (anyPause && !prevAnyPauseRef.current) {
      pauseSession();
    } else if (!anyPause && prevAnyPauseRef.current) {
      resumeSession();
    }
    prevAnyPauseRef.current = anyPause;
  }, [anyPause, pauseSession, resumeSession]);

  // Pause the timer when the tab/app is backgrounded so users aren't
  // penalized for time spent away from the test.
  useEffect(() => {
    function handleVisibility() {
      setHiddenPause(document.hidden);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!settings.keyboardNavigation || !session) return;

    function handleKey(e: KeyboardEvent) {
      const current = session!.attempts[session!.currentIndex];
      if (current.status !== 'unanswered') return; // bottom sheet handles nav when answered
      const keyMap: Record<string, number> = {
        '1': 0, 'a': 0, 'A': 0,
        '2': 1, 'b': 1, 'B': 1,
        '3': 2, 'c': 2, 'C': 2,
        '4': 3, 'd': 3, 'D': 3,
      };
      if (e.key in keyMap) {
        const idx = keyMap[e.key];
        if (idx < current.options.length) handleSelect(current.options[idx]);
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, settings.keyboardNavigation]);

  // Accessibility: Escape closes whichever overlay is open (palette takes
  // priority since it's drawn on top). Always on — unlike the shortcut effect
  // above, this is baseline navigability, not an opt-in power-user feature,
  // so it isn't gated behind settings.keyboardNavigation.
  useEffect(() => {
    function handleA11yKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showPalette) { setShowPalette(false); return; }
        if (searchSheetOpen) { setSearchSheetOpen(false); return; }
        return;
      }
    }
    window.addEventListener('keydown', handleA11yKey);
    return () => window.removeEventListener('keydown', handleA11yKey);
  }, [showPalette, searchSheetOpen]);

  // ← / → between questions — the same shared handler the universal and mock
  // engines use (it replaces this page's former ArrowLeft-only listener rather
  // than sitting beside it). Active exactly when the visible Previous / Next
  // buttons are: always in a test; in practice mode only while the current
  // question is still unanswered (once answered, the answer sheet owns the keys).
  const kbIndex = session?.currentIndex ?? 0;
  const kbTotal = session?.totalQuestions ?? 0;
  useExamKeyboardNavigation({
    enabled: !!session && !showSheet && !searchSheetOpen && !showPalette && !showMarkSheet && (isTestMode || session.attempts[kbIndex]?.status === 'unanswered'),
    canGoPrevious: kbIndex > 0,
    canGoNext: kbIndex < kbTotal - 1,
    onPrevious: () => goToQuestion(kbIndex - 1),
    onNext: () => (isTestMode ? goToQuestion(kbIndex + 1) : nextQuestion()),
  });

  // Timed mock tests: auto-submit the instant the countdown reaches zero.
  const handleExpire = useCallback(() => {
    if (!session) return;
    completeSession();
    navigate('/tests/result');
  }, [session, completeSession, navigate]);

  // A suspended session's clock hasn't absorbed the time away yet — wait for the presence hook (one frame).
  if (!session || session.suspendedAt) return null;

  const currentAttempt = session.attempts[session.currentIndex];
  const currentPurpose = effectivePurpose({ isMarkedForReview: currentAttempt.markedForReview, markPurpose: currentAttempt.markPurpose });
  const isAnswered = currentAttempt.status !== 'unanswered';
  const isLast = session.currentIndex >= session.totalQuestions - 1;
  const progress = ((session.currentIndex + 1) / session.totalQuestions) * 100;
  const markedIndices = session.attempts
    .map((a, idx) => (a.markedForReview ? idx : -1))
    .filter((idx) => idx !== -1);
  const unansweredCount = session.attempts.filter((a) => a.status === 'unanswered').length;

  function handleSelect(option: string) {
    if (isAnswered) return;
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
    submitAnswer(option, timeTaken);
    if (settings.hapticEnabled !== false && 'vibrate' in navigator) {
      // Test mode gives no correctness feedback, so keep the haptic neutral rather than signaling right/wrong.
      if (isTestMode) {
        navigator.vibrate(30);
      } else {
        const isCorrect = option === currentAttempt.correctAnswer;
        navigator.vibrate(isCorrect ? 40 : [40, 60, 40]);
      }
    }
  }

  function handleNext() {
    setShowSheet(false);
    if (isLast) {
      if (isTestMode || markedIndices.length > 0) {
        setShowSubmitConfirm(true);
      } else {
        navigate('/analysis');
      }
    } else {
      nextQuestion();
    }
  }

  function handleConfirmSubmit() {
    setShowSubmitConfirm(false);
    completeSession();
    navigate(isTestMode ? '/tests/result' : '/analysis');
  }

  function handleReviewMarked() {
    setShowSubmitConfirm(false);
    if (markedIndices.length > 0) goToQuestion(markedIndices[0]);
  }

  function handlePause() {
    setManualPause((p) => !p);
  }

  async function applyMark(purpose: MarkPurpose | null) {
    setShowMarkSheet(false);
    setMarkPurpose(currentAttempt.questionId, purpose);
    try {
      const saved = await saveAttemptMark(currentAttempt, session!.fileName, session!.date, purpose);
      if (purpose === null) toast('Mark removed', { id: 'mark-toast' });
      else if (saved) toast.success(`Saved for ${getMarkPurposeInfo(purpose)?.label.toLowerCase()} — find it in Review Center`, { id: 'mark-toast' });
      else toast.success('Marked for review in this test', { id: 'mark-toast' });
    } catch (err) {
      console.error('Could not save question mark', err);
      toast.error("The mark is on this test, but couldn't be saved to your Review Center.", { id: 'mark-toast' });
    }
  }

  function handleClose() {
    exitTest();
    toast('Progress saved — resume this test from Home.', { icon: '💾', id: 'test-saved' });
  }

  /** Sidebar "Submit Test": the same confirmation the last question shows, available at any time. Practice only needs it when something is marked. */
  function openSubmit() {
    setShowPalette(false);
    setShowSubmitConfirm(true);
  }

  return (
    <div
      className="min-h-screen transition-[padding] duration-200"
      // While the desktop explanation drawer is open, reserve its width so the question and options stay visible beside it.
      style={{ background: 'var(--bg)', paddingRight: showSheet && isDesktop && !isTestMode ? EXPLANATION_DRAWER_WIDTH : undefined }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-auto min-h-14 py-2 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label="Close test (progress is saved)"
              title="Close — your progress is saved"
            >
              <X size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xs sm:text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {session.date}
                <span className="hidden sm:inline">
                  {isTestMode ? ` — ${session.testMeta!.examName}` : ' — Current Affairs'}
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }}>
                Q{session.currentIndex + 1} / {session.totalQuestions}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <QuizTimer
              startTime={session.startTime}
              totalPausedTime={session.totalPausedTime}
              isPaused={session.isPaused}
              pausedAt={session.pausedAt}
              durationSeconds={session.testMeta?.durationSeconds}
              onExpire={session.testMeta?.durationSeconds ? handleExpire : undefined}
            />
            <button
              onClick={handlePause}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
              title={manualPause ? 'Resume' : 'Pause'}
              aria-label={manualPause ? 'Resume test' : 'Pause test'}
              aria-pressed={manualPause}
            >
              {manualPause
                ? <Play size={16} style={{ color: 'var(--text-primary)' }} />
                : <Pause size={16} style={{ color: 'var(--text-secondary)' }} />
              }
            </button>
            <button
              onClick={() => setShowPalette(true)}
              className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label="Open question palette"
            >
              <LayoutGrid size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1" style={{ background: 'var(--border)' }}>
          <motion.div
            className="h-full bg-gradient-to-r from-brand-500 to-purple-600"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </header>

      {/* Pause Overlay */}
      <AnimatePresence>
        {manualPause && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            <div className="card p-10 text-center">
              <div className="text-5xl mb-4">⏸️</div>
              <h2 className="text-2xl font-display font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                Test Paused
              </h2>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Your progress is saved.</p>
              <button onClick={handlePause} className="btn-primary flex items-center gap-2 mx-auto">
                <Play size={16} /> Resume Test
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex gap-6">
          {/* Question Area */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={session.currentIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22 }}
              >
                {/* Question Card */}
                <div className="card p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold text-sm flex-shrink-0 mt-0.5">
                        {session.currentIndex + 1}
                      </span>
                      <p className="text-base md:text-lg leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>
                        {currentAttempt.question}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setShowMarkSheet(true)}
                        className={`p-2 rounded-xl transition-colors ${
                          currentPurpose
                            ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                            : 'hover:bg-gray-100 dark:hover:bg-white/10'
                        }`}
                        style={!currentPurpose ? { color: 'var(--text-muted)' } : { color: getMarkPurposeInfo(currentPurpose)?.color }}
                        title="Mark this question"
                        aria-label={currentPurpose ? `Marked: ${getMarkPurposeInfo(currentPurpose)?.label}. Change or remove mark` : 'Mark this question'}
                        aria-haspopup="dialog"
                      >
                        <Flag size={16} fill={currentPurpose ? 'currentColor' : 'none'} />
                      </button>
                      {!isTestMode && (
                        <button
                          onClick={() => toggleBookmark(currentAttempt.questionId)}
                          className={`p-2 rounded-xl transition-colors ${
                            currentAttempt.bookmarked
                              ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20'
                              : 'hover:bg-gray-100 dark:hover:bg-white/10'
                          }`}
                          style={!currentAttempt.bookmarked ? { color: 'var(--text-muted)' } : undefined}
                          title="Bookmark question"
                          aria-label="Bookmark question"
                          aria-pressed={!!currentAttempt.bookmarked}
                        >
                          <Bookmark size={16} fill={currentAttempt.bookmarked ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Web search is a study aid, not appropriate inside a timed test (§93: immersive, minimal, no cheating aids) */}
                  {!isTestMode && (
                    <button
                      onClick={() => setSearchSheetOpen(true)}
                      className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                      style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                    >
                      <Search size={12} />
                      Search on Web
                    </button>
                  )}

                  {/* Options */}
                  <div className="space-y-3">
                    {currentAttempt.options.map((option, idx) => {
                      const label = getOptionLabel(idx);
                      let cls = 'option-btn';
                      const isSelected = option === currentAttempt.selectedAnswer;

                      if (isTestMode) {
                        // No reveal, ever — just show what's selected.
                        if (isSelected) cls += ' selected-neutral';
                      } else if (isAnswered) {
                        if (option === currentAttempt.correctAnswer) cls += ' reveal-correct';
                        else if (isSelected) cls += ' selected-wrong';
                        else cls += ' neutral-disabled';
                      }

                      const badgeCls = isTestMode
                        ? isSelected
                          ? 'bg-brand-500 text-white'
                          : 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                        : isAnswered && option === currentAttempt.correctAnswer
                          ? 'bg-green-500 text-white'
                          : isAnswered && isSelected
                            ? 'bg-red-500 text-white'
                            : 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400';

                      return (
                        <motion.button
                          key={option}
                          whileHover={!isAnswered || isTestMode ? { scale: 1.005 } : {}}
                          whileTap={!isAnswered || isTestMode ? { scale: 0.995 } : {}}
                          className={cls}
                          onClick={() => handleSelect(option)}
                          disabled={isAnswered && !isTestMode}
                        >
                          <span className="inline-flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${badgeCls}`}>
                              {label}
                            </span>
                            {option}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Answered hint — bottom sheet is open so no inline feedback needed */}
                {!isTestMode && isAnswered && !showSheet && (
                  <div className="mt-3 text-center">
                    <button
                      onClick={() => setShowSheet(true)}
                      className="text-sm text-brand-500 font-medium underline underline-offset-2"
                    >
                      Show feedback ↑
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation Buttons — in test mode these stay visible even after
                answering, since there's no bottom-sheet-driven "Next" (no
                reveal to show). In practice mode, unchanged: only shown
                before answering, the bottom sheet takes over afterward. */}
            {(isTestMode || !isAnswered) && (
              <div className="flex justify-between mt-4">
                <button
                  className="btn-ghost flex items-center gap-1 text-sm"
                  onClick={() => goToQuestion(Math.max(0, session.currentIndex - 1))}
                  disabled={session.currentIndex === 0}
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  className="btn-primary flex items-center gap-1 text-sm"
                  onClick={handleNext}
                >
                  {isLast ? (isTestMode ? 'Submit Test' : 'Finish') : isTestMode ? 'Next' : 'Skip'}
                  {!isLast && <ChevronRight size={16} />}
                </button>
              </div>
            )}
          </div>

          {/* Desktop Palette */}
          <div className="hidden md:block w-56 flex-shrink-0">
            <div className="sticky top-20 flex flex-col gap-3 max-h-[calc(100dvh-6rem)]">
              <div className="min-h-0 overflow-y-auto">
                <QuestionPalette
                  attempts={session.attempts}
                  currentIndex={session.currentIndex}
                  visitedIndices={session.visitedIndices ?? []}
                  onJump={goToQuestion}
                  hideCorrectness={isTestMode}
                />
              </div>
              <button type="button" onClick={openSubmit} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5 flex-shrink-0"><Send size={14} /> Submit Test</button>
            </div>
          </div>
        </div>
      </div>

      <MarkPurposeSheet
        open={showMarkSheet}
        current={currentPurpose}
        questionNumber={session.currentIndex + 1}
        onSelect={(p) => applyMark(p)}
        onRemove={() => applyMark(null)}
        onClose={() => setShowMarkSheet(false)}
      />

      {/* Answer Bottom Sheet — practice mode only; test mode never reveals per-question */}
      {!isTestMode && (
        <AnswerBottomSheet
          attempt={showSheet ? currentAttempt : null}
          isLastQuestion={isLast}
          onNext={handleNext}
          onBookmark={() => toggleBookmark(currentAttempt.questionId)}
          onMarkForReview={() => setShowMarkSheet(true)}
          onClose={() => setShowSheet(false)}
          showExplanation={settings.showExplanation}
          autoNextSeconds={settings.autoNextSeconds}
          frozen={manualPause}
        />
      )}

      {!isTestMode && (
        <QuestionWebSearchSheet
          isOpen={searchSheetOpen}
          query={currentAttempt.question}
          onClose={() => setSearchSheetOpen(false)}
        />
      )}

      {/* Submit confirmation — always shown for tests on the final question; for
          practice, only when something is still marked for review. */}
      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowSubmitConfirm(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.97 }}
              className="card p-6 max-w-sm w-full text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={26} className="text-amber-500" />
              </div>
              <h2 className="text-lg font-display font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {isTestMode || markedIndices.length === 0 ? 'Submit Test?' : `Marked For Review: ${markedIndices.length} Question${markedIndices.length !== 1 ? 's' : ''}`}
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                {isTestMode || markedIndices.length === 0
                  ? `${session.totalQuestions - unansweredCount} answered, ${unansweredCount} unanswered${markedIndices.length > 0 ? `, ${markedIndices.length} marked for review` : ''}. You can still go back before submitting.`
                  : 'You can revisit them before submitting, or submit the test as-is.'}
              </p>
              <div className="flex flex-col gap-2">
                {markedIndices.length > 0 && (
                  <button onClick={handleReviewMarked} className="btn-secondary text-sm py-2.5">
                    Review Marked Questions
                  </button>
                )}
                <button onClick={handleConfirmSubmit} className="btn-primary text-sm py-2.5">
                  Submit Test {!isTestMode && markedIndices.length > 0 && 'Anyway'}
                </button>
                <button onClick={() => setShowSubmitConfirm(false)} className="btn-ghost text-sm">
                  Go back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Palette Drawer */}
      <AnimatePresence>
        {showPalette && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setShowPalette(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] flex flex-col"
              style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className="p-4 flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
                  Question Palette
                </h2>
                <button
                  onClick={() => setShowPalette(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
                  aria-label="Close question palette"
                >
                  <X size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
              <QuestionPalette
                attempts={session.attempts}
                currentIndex={session.currentIndex}
                visitedIndices={session.visitedIndices ?? []}
                onJump={(idx) => {
                  goToQuestion(idx);
                  setShowPalette(false);
                }}
                hideCorrectness={isTestMode}
              />
              </div>
              <div className="flex-shrink-0 p-4" style={{ borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={openSubmit} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5"><Send size={14} /> Submit Test</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
