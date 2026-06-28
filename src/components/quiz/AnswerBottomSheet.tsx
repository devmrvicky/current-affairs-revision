import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, ArrowRight, Bookmark, Flag } from 'lucide-react';
import type { QuestionAttempt } from '../../types';

interface AnswerBottomSheetProps {
  attempt: QuestionAttempt | null; // null = hidden
  isLastQuestion: boolean;
  onNext: () => void;
  onBookmark: () => void;
  onMarkForReview: () => void;
  onClose: () => void;
  showExplanation: boolean;
  /** 0 = auto-next disabled; otherwise seconds to wait before auto-advancing */
  autoNextSeconds: number;
  /** When true (manual pause), freeze the auto-next countdown without losing remaining time */
  frozen?: boolean;
}

export function AnswerBottomSheet({
  attempt,
  isLastQuestion,
  onNext,
  onBookmark,
  onMarkForReview,
  onClose,
  showExplanation,
  autoNextSeconds,
  frozen = false,
}: AnswerBottomSheetProps) {
  const isOpen = attempt !== null;
  const isCorrect = attempt?.status === 'correct';

  // Auto-advance countdown — resets whenever a new question's sheet opens.
  const [secondsLeft, setSecondsLeft] = useState(autoNextSeconds);

  useEffect(() => {
    if (isOpen && autoNextSeconds > 0) setSecondsLeft(autoNextSeconds);
  }, [isOpen, attempt?.questionId, autoNextSeconds]);

  useEffect(() => {
    if (!isOpen || autoNextSeconds <= 0 || isLastQuestion || frozen) return;
    if (secondsLeft <= 0) {
      onNext();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoNextSeconds, secondsLeft, isLastQuestion, frozen]);

  const autoNextActive = isOpen && autoNextSeconds > 0 && !isLastQuestion;

  // Manually clicking Next always wins — just call through immediately;
  // the countdown effect's cleanup (isOpen flips false) cancels any pending tick.
  function handleManualNext() {
    onNext();
  }

  // Keyboard: Enter / Space = next
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleManualNext();
      }
      if (e.key === 'Escape') onClose();
    },
    [isOpen, onNext, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const accentGreen = { bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-300 dark:border-green-700', header: 'bg-green-500' };
  const accentRed = { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-300 dark:border-red-700', header: 'bg-red-500' };
  const accent = isCorrect ? accentGreen : accentRed;

  return (
    <AnimatePresence>
      {isOpen && attempt && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.8 }}
            className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl shadow-2xl overflow-hidden ${accent.bg} border-t-2 ${accent.border}`}
            style={{ maxHeight: '62vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(62vh - 80px)' }}>
              {/* Status header */}
              <div className="px-5 pt-2 pb-4 flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.05, type: 'spring', stiffness: 350, damping: 18 }}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    isCorrect ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'
                  }`}
                >
                  {isCorrect
                    ? <CheckCircle2 size={28} className="text-green-500" />
                    : <XCircle size={28} className="text-red-500" />
                  }
                </motion.div>

                <div className="flex-1 min-w-0">
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className={`font-display font-bold text-xl ${
                      isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {isCorrect ? 'Correct! 🎉' : 'Incorrect'}
                  </motion.p>

                  {!isCorrect && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="text-sm mt-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Answer:{' '}
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {attempt.correctAnswer}
                      </span>
                    </motion.p>
                  )}
                </div>

                <button
                  onClick={onMarkForReview}
                  className={`p-2 rounded-xl flex-shrink-0 transition-colors ${
                    attempt.markedForReview
                      ? 'text-amber-500 bg-amber-100 dark:bg-amber-900/30'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                  }`}
                  title="Mark for review"
                >
                  <Flag size={16} fill={attempt.markedForReview ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={onBookmark}
                  className={`p-2 rounded-xl flex-shrink-0 transition-colors ${
                    attempt.bookmarked
                      ? 'text-purple-500 bg-purple-100 dark:bg-purple-900/30'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                  }`}
                  title="Bookmark question"
                >
                  <Bookmark size={16} fill={attempt.bookmarked ? 'currentColor' : 'none'} />
                </button>
              </div>

              {/* Explanation */}
              {showExplanation && attempt.explanation && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mx-5 mb-4 px-4 py-3 rounded-2xl border"
                  style={{
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Explanation
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {attempt.explanation}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Sticky CTA — always visible, never needs scroll */}
            <div
              className="px-5 py-4 border-t"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleManualNext}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-display font-bold text-base text-white shadow-lg transition-all relative overflow-hidden ${
                  isCorrect
                    ? 'bg-green-500 hover:bg-green-600 shadow-green-200 dark:shadow-green-900/40'
                    : 'bg-brand-500 hover:bg-brand-600 shadow-brand-200 dark:shadow-brand-900/40'
                }`}
              >
                {autoNextActive && (
                  <motion.div
                    key={secondsLeft}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 1, ease: 'linear' }}
                    className="absolute left-0 top-0 bottom-0 bg-white/15"
                  />
                )}
                <span className="relative">
                  {isLastQuestion ? 'View Results' : 'Next Question'}
                  {autoNextActive && (frozen ? ' (paused)' : ` (${secondsLeft})`)}
                </span>
                <ArrowRight size={18} className="relative" />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
