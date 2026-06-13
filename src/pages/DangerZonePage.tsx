import { useEffect, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Brain, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useQuizStore } from '../store/quizStore';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { getOptionLabel } from '../utils';
import type { WrongQuestion } from '../types';
import toast from 'react-hot-toast';

const DangerCard = memo(function DangerCard({
  wq, rank, onRecord
}: { wq: WrongQuestion; rank: number; onRecord: (id: string, correct: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  function handleSelect(opt: string) {
    if (revealed) return;
    setSelected(opt);
    setRevealed(true);
    onRecord(wq.id, opt === wq.correctAnswer);
    if (opt === wq.correctAnswer) toast.success('Correct! Keep going 💪', { duration: 1500 });
  }

  const dangerLevel = wq.wrongCount >= 5 ? 'high' : wq.wrongCount >= 3 ? 'medium' : 'low';
  const dangerColor = dangerLevel === 'high' ? '#ef4444' : dangerLevel === 'medium' ? '#f97316' : '#f59e0b';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 border-l-4"
      style={{ borderLeftColor: dangerColor }}
    >
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: `${dangerColor}18`, color: dangerColor }}
        >
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: `${dangerColor}18`, color: dangerColor }}
            >
              Wrong {wq.wrongCount}×
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {wq.displayDate}
            </span>
            {dangerLevel === 'high' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">
                ⚠️ High Risk
              </span>
            )}
          </div>
          <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {wq.question}
          </p>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0"
        >
          {expanded
            ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
            : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          }
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {wq.options.map((opt, idx) => {
                const isCorrect = opt === wq.correctAnswer;
                const isSelected = opt === selected;
                let cls = 'option-btn text-sm py-2.5';
                if (revealed) {
                  if (isCorrect) cls += ' reveal-correct';
                  else if (isSelected) cls += ' selected-wrong';
                  else cls += ' neutral-disabled';
                }
                return (
                  <button key={opt} className={cls} onClick={() => handleSelect(opt)} disabled={revealed}>
                    <span className="inline-flex items-center gap-2.5">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        revealed && isCorrect ? 'bg-green-500 text-white'
                        : revealed && isSelected ? 'bg-red-500 text-white'
                        : 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                      }`}>
                        {getOptionLabel(idx)}
                      </span>
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
            {revealed && wq.explanation && (
              <div className="mt-2 p-3 rounded-xl border" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Explanation</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{wq.explanation}</p>
              </div>
            )}
            {revealed && (
              <button
                className="mt-2 text-xs text-brand-500 font-medium hover:underline"
                onClick={() => { setSelected(null); setRevealed(false); }}
              >
                <RotateCcw size={11} className="inline mr-1" />Try again
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default function DangerZonePage() {
  const navigate = useNavigate();
  const { questions, isLoading, load, recordRevisionAttempt } = useWrongQuestionsStore();
  const { startSession } = useQuizStore();

  useEffect(() => { load(); }, []);

  // Sort by wrongCount descending, only show wrong >= 2
  const dangerQs = questions
    .filter((q) => q.status === 'learning' && q.wrongCount >= 2)
    .sort((a, b) => b.wrongCount - a.wrongCount);

  async function handlePracticeAll() {
    if (dangerQs.length === 0) return;
    const quiz = {
      date: 'Danger Zone Practice',
      questions: dangerQs.map((q, i) => ({
        id: i + 1,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
    };
    startSession(quiz, 'danger_zone.json');
    navigate('/quiz');
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              Danger Zone
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Questions you keep getting wrong
            </p>
          </div>
        </div>
        {dangerQs.length > 0 && (
          <button onClick={handlePracticeAll} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Brain size={14} /> Practice All
          </button>
        )}
      </div>

      {/* Danger level legend */}
      {dangerQs.length > 0 && (
        <div className="card p-3 flex flex-wrap gap-3 text-xs">
          {[
            { color: '#ef4444', label: 'High Risk (5+ wrong)', dot: 'bg-red-500' },
            { color: '#f97316', label: 'Medium (3-4 wrong)', dot: 'bg-orange-500' },
            { color: '#f59e0b', label: 'Watch Out (2 wrong)', dot: 'bg-amber-500' },
          ].map(({ label, dot }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Questions */}
      {dangerQs.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={28} className="text-amber-400" />}
          title="No danger zone questions"
          description="Questions answered wrong 2 or more times will appear here."
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {dangerQs.map((wq, i) => (
              <DangerCard
                key={wq.id}
                wq={wq}
                rank={i + 1}
                onRecord={recordRevisionAttempt}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
