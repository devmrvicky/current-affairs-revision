import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Bookmark, Flag, ChevronLeft, ChevronRight, LayoutGrid, X, AlertTriangle } from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { useSettingsStore } from '../store/statsStore';
import { QuizTimer } from '../components/quiz/QuizTimer';
import { QuestionPalette } from '../components/quiz/QuestionPalette';
import { AnswerBottomSheet } from '../components/quiz/AnswerBottomSheet';
import { getOptionLabel } from '../utils';

export default function QuizPage() {
  const navigate = useNavigate();
  const {
    session, submitAnswer, nextQuestion, goToQuestion, pauseSession, resumeSession,
    clearSession, toggleBookmark, toggleMarkForReview,
  } = useQuizStore();
  const { settings } = useSettingsStore();

  const [showPalette, setShowPalette] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [isPaused, setIsPaused] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Redirect guards
  useEffect(() => {
    if (!session) { navigate('/', { replace: true }); return; }
    if (session.isCompleted) { navigate('/analysis', { replace: true }); return; }
  }, [session, navigate]);

  // Reset timer and hide sheet when question changes
  useEffect(() => {
    setQuestionStartTime(Date.now());
    setShowSheet(false);
  }, [session?.currentIndex]);

  // Show sheet when answer is submitted
  useEffect(() => {
    if (!session) return;
    const current = session.attempts[session.currentIndex];
    if (current?.status !== 'unanswered') {
      setShowSheet(true);
    }
  }, [session?.attempts[session?.currentIndex ?? 0]?.status]);

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
  }, [session, settings.keyboardNavigation]);

  if (!session) return null;

  const currentAttempt = session.attempts[session.currentIndex];
  const isAnswered = currentAttempt.status !== 'unanswered';
  const isLast = session.currentIndex >= session.totalQuestions - 1;
  const progress = ((session.currentIndex + 1) / session.totalQuestions) * 100;
  const markedIndices = session.attempts
    .map((a, idx) => (a.markedForReview ? idx : -1))
    .filter((idx) => idx !== -1);

  function handleSelect(option: string) {
    if (isAnswered) return;
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
    submitAnswer(option, timeTaken);
  }

  function handleNext() {
    setShowSheet(false);
    if (isLast) {
      if (markedIndices.length > 0) {
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
    navigate('/analysis');
  }

  function handleReviewMarked() {
    setShowSubmitConfirm(false);
    if (markedIndices.length > 0) goToQuestion(markedIndices[0]);
  }

  function handlePause() {
    if (isPaused) {
      resumeSession();
      setIsPaused(false);
    } else {
      pauseSession();
      setIsPaused(true);
    }
  }

  function handleQuit() {
    if (window.confirm('Quit the test? Your progress will be lost.')) {
      clearSession();
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-auto min-h-14 py-2 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={handleQuit}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <X size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xs sm:text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {session.date}
                <span className="hidden sm:inline"> — Current Affairs</span>
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
              isPaused={isPaused}
              pausedAt={session.pausedAt}
            />
            <button
              onClick={handlePause}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused
                ? <Play size={16} style={{ color: 'var(--text-primary)' }} />
                : <Pause size={16} style={{ color: 'var(--text-secondary)' }} />
              }
            </button>
            <button
              onClick={() => setShowPalette(true)}
              className="md:hidden p-1.5 sm:p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
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
        {isPaused && (
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
                        onClick={() => toggleMarkForReview(currentAttempt.questionId)}
                        className={`p-2 rounded-xl transition-colors ${
                          currentAttempt.markedForReview
                            ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                            : 'hover:bg-gray-100 dark:hover:bg-white/10'
                        }`}
                        style={!currentAttempt.markedForReview ? { color: 'var(--text-muted)' } : undefined}
                        title="Mark for review"
                      >
                        <Flag size={16} fill={currentAttempt.markedForReview ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => toggleBookmark(currentAttempt.questionId)}
                        className={`p-2 rounded-xl transition-colors ${
                          currentAttempt.bookmarked
                            ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'hover:bg-gray-100 dark:hover:bg-white/10'
                        }`}
                        style={!currentAttempt.bookmarked ? { color: 'var(--text-muted)' } : undefined}
                        title="Bookmark question"
                      >
                        <Bookmark size={16} fill={currentAttempt.bookmarked ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-3">
                    {currentAttempt.options.map((option, idx) => {
                      const label = getOptionLabel(idx);
                      let cls = 'option-btn';
                      if (isAnswered) {
                        if (option === currentAttempt.correctAnswer) cls += ' reveal-correct';
                        else if (option === currentAttempt.selectedAnswer) cls += ' selected-wrong';
                        else cls += ' neutral-disabled';
                      }
                      return (
                        <motion.button
                          key={option}
                          whileHover={!isAnswered ? { scale: 1.005 } : {}}
                          whileTap={!isAnswered ? { scale: 0.995 } : {}}
                          className={cls}
                          onClick={() => handleSelect(option)}
                          disabled={isAnswered}
                        >
                          <span className="inline-flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isAnswered && option === currentAttempt.correctAnswer
                                ? 'bg-green-500 text-white'
                                : isAnswered && option === currentAttempt.selectedAnswer
                                ? 'bg-red-500 text-white'
                                : 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                            }`}>
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
                {isAnswered && !showSheet && (
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

            {/* Navigation Buttons (unanswered only) */}
            {!isAnswered && (
              <div className="flex justify-between mt-4">
                <button
                  className="btn-ghost flex items-center gap-1 text-sm"
                  onClick={() => goToQuestion(Math.max(0, session.currentIndex - 1))}
                  disabled={session.currentIndex === 0}
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  className="btn-ghost flex items-center gap-1 text-sm"
                  onClick={handleNext}
                >
                  Skip <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Desktop Palette */}
          <div className="hidden md:block w-56 flex-shrink-0">
            <div className="sticky top-20">
              <QuestionPalette
                attempts={session.attempts}
                currentIndex={session.currentIndex}
                visitedIndices={session.visitedIndices ?? []}
                onJump={(idx) => goToQuestion(idx)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Answer Bottom Sheet */}
      <AnswerBottomSheet
        attempt={showSheet ? currentAttempt : null}
        isLastQuestion={isLast}
        onNext={handleNext}
        onBookmark={() => toggleBookmark(currentAttempt.questionId)}
        onMarkForReview={() => toggleMarkForReview(currentAttempt.questionId)}
        onClose={() => setShowSheet(false)}
        showExplanation={settings.showExplanation}
        autoNextSeconds={settings.autoNextSeconds}
      />

      {/* Submit confirmation — shown when finishing the last question while some are still marked for review */}
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
                Marked For Review: {markedIndices.length} Question{markedIndices.length !== 1 ? 's' : ''}
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                You can revisit them before submitting, or submit the test as-is.
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={handleReviewMarked} className="btn-secondary text-sm py-2.5">
                  Review Marked Questions
                </button>
                <button onClick={handleConfirmSubmit} className="btn-primary text-sm py-2.5">
                  Submit Test Anyway
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
              className="fixed right-0 top-0 bottom-0 z-50 w-72 p-4 overflow-y-auto"
              style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
                  Question Palette
                </h2>
                <button
                  onClick={() => setShowPalette(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
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
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
