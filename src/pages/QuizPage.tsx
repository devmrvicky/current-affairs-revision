import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Pause, Play, Bookmark, ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useSettingsStore } from '../store/statsStore';
import { QuizTimer } from '../components/quiz/QuizTimer';
import { QuestionPalette } from '../components/quiz/QuestionPalette';
import { AnswerFeedback } from '../components/quiz/AnswerFeedback';
import { getOptionLabel } from '../utils';

export default function QuizPage() {
  const navigate = useNavigate();
  const { session, submitAnswer, nextQuestion, pauseSession, resumeSession, clearSession, toggleBookmark } = useQuizStore();
  const { settings } = useSettingsStore();

  const [showPalette, setShowPalette] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const currentAttemptRef = useRef(session?.attempts[session?.currentIndex ?? 0]);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }
    if (session.isCompleted) {
      navigate('/analysis', { replace: true });
      return;
    }
  }, [session, navigate]);

  useEffect(() => {
    setQuestionStartTime(Date.now());
    if (session) {
      currentAttemptRef.current = session.attempts[session.currentIndex];
    }
  }, [session?.currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!settings.keyboardNavigation || !session) return;

    function handleKey(e: KeyboardEvent) {
      const current = session!.attempts[session!.currentIndex];
      if (current.status !== 'unanswered') {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNext();
        }
        return;
      }

      const keyMap: Record<string, number> = { '1': 0, 'a': 0, 'A': 0, '2': 1, 'b': 1, 'B': 1, '3': 2, 'c': 2, 'C': 2, '4': 3, 'd': 3, 'D': 3 };
      if (e.key in keyMap) {
        const idx = keyMap[e.key];
        if (idx < current.options.length) {
          handleSelect(current.options[idx]);
        }
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

  function handleSelect(option: string) {
    if (isAnswered) return;
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
    submitAnswer(option, timeTaken);
  }

  function handleNext() {
    if (isLast) {
      navigate('/analysis');
    } else {
      nextQuestion();
    }
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
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={handleQuit} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <X size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <div>
              <h1 className="font-display font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                {session.date} — Current Affairs
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Q{session.currentIndex + 1} / {session.totalQuestions}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <QuizTimer
              startTime={session.startTime}
              totalPausedTime={session.totalPausedTime}
              isPaused={isPaused}
              pausedAt={session.pausedAt}
            />
            <button
              onClick={handlePause}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play size={16} style={{ color: 'var(--text-primary)' }} /> : <Pause size={16} style={{ color: 'var(--text-secondary)' }} />}
            </button>
            <button
              onClick={() => setShowPalette(true)}
              className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
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
              <h2 className="text-2xl font-display font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Test Paused</h2>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Your progress is saved.</p>
              <button onClick={handlePause} className="btn-primary flex items-center gap-2 mx-auto">
                <Play size={16} /> Resume Test
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Question Area */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={session.currentIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Question Card */}
                <div className="card p-6">
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold text-sm flex-shrink-0 mt-0.5">
                        {session.currentIndex + 1}
                      </span>
                      <p className="text-base md:text-lg leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>
                        {currentAttempt.question}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleBookmark(currentAttempt.questionId)}
                      className={`p-2 rounded-xl flex-shrink-0 transition-colors ${
                        currentAttempt.bookmarked
                          ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'hover:bg-gray-100 dark:hover:bg-white/10'
                      }`}
                      style={!currentAttempt.bookmarked ? { color: 'var(--text-muted)' } : undefined}
                    >
                      <Bookmark size={16} fill={currentAttempt.bookmarked ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {/* Options */}
                  <div className="space-y-3">
                    {currentAttempt.options.map((option, idx) => {
                      const label = getOptionLabel(idx);
                      let className = 'option-btn';

                      if (isAnswered) {
                        if (option === currentAttempt.correctAnswer) {
                          className += ' reveal-correct';
                        } else if (option === currentAttempt.selectedAnswer) {
                          className += ' selected-wrong';
                        } else {
                          className += ' neutral-disabled';
                        }
                      }

                      return (
                        <motion.button
                          key={option}
                          whileHover={!isAnswered ? { scale: 1.005 } : {}}
                          whileTap={!isAnswered ? { scale: 0.995 } : {}}
                          className={className}
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

                {/* Feedback */}
                {isAnswered && (
                  <AnswerFeedback
                    attempt={currentAttempt}
                    isLastQuestion={isLast}
                    onNext={handleNext}
                    onBookmark={() => toggleBookmark(currentAttempt.questionId)}
                    showExplanation={settings.showExplanation}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation Buttons */}
            {!isAnswered && (
              <div className="flex justify-between mt-4">
                <button
                  className="btn-ghost flex items-center gap-1 text-sm"
                  onClick={() => useQuizStore.getState().session && useQuizStore.setState(s => ({
                    session: s.session ? { ...s.session, currentIndex: Math.max(0, s.session.currentIndex - 1) } : null
                  }))}
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
                onJump={(idx) => {
                  const attempt = session.attempts[idx];
                  if (attempt.status !== 'unanswered' || idx <= session.currentIndex) {
                    useQuizStore.setState(s => ({
                      session: s.session ? { ...s.session, currentIndex: idx } : null
                    }));
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

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
                <h2 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>Question Palette</h2>
                <button onClick={() => setShowPalette(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10">
                  <X size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
              <QuestionPalette
                attempts={session.attempts}
                currentIndex={session.currentIndex}
                onJump={(idx) => {
                  useQuizStore.setState(s => ({
                    session: s.session ? { ...s.session, currentIndex: idx } : null
                  }));
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
