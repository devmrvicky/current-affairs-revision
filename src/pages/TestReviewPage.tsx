import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, Circle, Clock, Flag, Bookmark } from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { getOptionLabel, formatTime } from '../utils';

export default function TestReviewPage() {
  const navigate = useNavigate();
  const { session } = useQuizStore();

  if (!session || !session.isCompleted || !session.testMeta) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="space-y-4 pb-4">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="pt-2 flex items-center gap-3">
        <button
          onClick={() => navigate('/tests/result')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Back to result"
        >
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h1 className="text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Review Answers</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{session.testMeta.examName}</p>
        </div>
      </motion.div>

      {session.attempts.map((attempt, idx) => {
        const isCorrect = attempt.status === 'correct';
        const isWrong = attempt.status === 'wrong';
        const isSkipped = attempt.status === 'unanswered';

        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
            className="card p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-2.5">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold text-xs flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {attempt.question}
                </p>
              </div>
              <div className="flex-shrink-0">
                {isCorrect && <CheckCircle2 size={18} className="text-green-500" />}
                {isWrong && <XCircle size={18} className="text-red-500" />}
                {isSkipped && <Circle size={18} style={{ color: 'var(--text-muted)' }} />}
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              {attempt.options.map((option, oIdx) => {
                const isSelected = option === attempt.selectedAnswer;
                const isRight = option === attempt.correctAnswer;
                let style: React.CSSProperties = { border: '1px solid var(--border)', color: 'var(--text-secondary)' };
                if (isRight) style = { border: '1px solid #22c55e', background: 'rgba(34,197,94,0.08)', color: 'var(--text-primary)' };
                else if (isSelected) style = { border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', color: 'var(--text-primary)' };
                return (
                  <div key={option} className="px-3 py-2 rounded-lg text-xs flex items-center gap-2" style={style}>
                    <span className="font-bold flex-shrink-0">{getOptionLabel(oIdx)}</span>
                    <span>{option}</span>
                  </div>
                );
              })}
            </div>

            {attempt.explanation && (
              <p className="text-xs p-3 rounded-lg mb-2" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
                {attempt.explanation}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1"><Clock size={11} /> {formatTime(attempt.timeTaken)}</span>
              {attempt.markedForReview && <span className="flex items-center gap-1 text-amber-500"><Flag size={11} fill="currentColor" /> Marked</span>}
              {attempt.bookmarked && <span className="flex items-center gap-1 text-purple-500"><Bookmark size={11} fill="currentColor" /> Bookmarked</span>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
