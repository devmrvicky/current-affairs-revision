import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, ArrowRight, Bookmark } from 'lucide-react';
import type { QuestionAttempt } from '../../types';

interface AnswerFeedbackProps {
  attempt: QuestionAttempt;
  isLastQuestion: boolean;
  onNext: () => void;
  onBookmark: () => void;
  showExplanation: boolean;
}

export function AnswerFeedback({ attempt, isLastQuestion, onNext, onBookmark, showExplanation }: AnswerFeedbackProps) {
  const isCorrect = attempt.status === 'correct';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`mt-4 rounded-2xl border-2 overflow-hidden ${
          isCorrect
            ? 'border-green-300 dark:border-green-700'
            : 'border-red-300 dark:border-red-700'
        }`}
      >
        {/* Header */}
        <div className={`px-5 py-4 flex items-center gap-3 ${
          isCorrect
            ? 'bg-green-50 dark:bg-green-900/20'
            : 'bg-red-50 dark:bg-red-900/20'
        }`}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
          >
            {isCorrect ? (
              <CheckCircle2 size={28} className="text-green-500" />
            ) : (
              <XCircle size={28} className="text-red-500" />
            )}
          </motion.div>
          <div>
            <p className={`font-display font-bold text-lg ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {isCorrect ? 'Correct Answer! 🎉' : 'Wrong Answer'}
            </p>
            {!isCorrect && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Correct: <span className="font-semibold text-green-600 dark:text-green-400">{attempt.correctAnswer}</span>
              </p>
            )}
          </div>
        </div>

        {/* Explanation */}
        {showExplanation && (
          <div className="px-5 py-4" style={{ background: 'var(--card)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Explanation
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {attempt.explanation}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 flex items-center justify-between border-t border-[var(--border)]"
          style={{ background: 'var(--card)' }}>
          <button
            onClick={onBookmark}
            className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
              attempt.bookmarked
                ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                : 'hover:bg-gray-100 dark:hover:bg-white/10'
            }`}
            style={!attempt.bookmarked ? { color: 'var(--text-secondary)' } : undefined}
          >
            <Bookmark size={14} fill={attempt.bookmarked ? 'currentColor' : 'none'} />
            {attempt.bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onNext}
            className="btn-primary flex items-center gap-2 text-sm py-2"
          >
            {isLastQuestion ? 'View Results' : 'Next Question'}
            <ArrowRight size={14} />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
