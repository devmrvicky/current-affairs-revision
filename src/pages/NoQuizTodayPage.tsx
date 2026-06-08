import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft, BookOpen, History } from 'lucide-react';
import { getDisplayDate } from '../services/quizService';

export default function NoQuizTodayPage() {
  const navigate = useNavigate();
  const today = getDisplayDate(new Date());

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card p-10 max-w-md w-full text-center"
      >
        <motion.div
          initial={{ rotate: -10, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
          className="w-20 h-20 rounded-3xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-6"
        >
          <Clock size={40} className="text-amber-500" />
        </motion.div>

        <h1 className="text-2xl font-display font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          No Quiz Available Today
        </h1>
        <p className="mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{today}</p>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          The current affairs file for today hasn't been uploaded yet.
          Check back later, or practice with previous days' tests.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/history')}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <History size={16} /> View Test History
          </button>
          <button
            onClick={() => navigate('/revision')}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <BookOpen size={16} /> Start Revision
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-ghost w-full flex items-center justify-center gap-2"
          >
            <ArrowLeft size={15} /> Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  );
}
