import { useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, CheckCircle2, XCircle, Trash2, Trophy, Target,
  ChevronDown, ChevronUp, RotateCcw, Sparkles, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { EmptyState } from '../components/common/EmptyState';
import { getOptionLabel } from '../utils';
import type { WrongQuestion } from '../types';

const MASTERY_THRESHOLD = 3;

// ─── Single wrong question card ───────────────────────────────────────────────

interface WQCardProps {
  wq: WrongQuestion;
  onDismiss: (id: string) => void;
  onRecord: (id: string, correct: boolean) => void;
}

const WQCard = memo(function WQCard({ wq, onDismiss, onRecord }: WQCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  function handleSelect(option: string) {
    if (revealed) return;
    setSelected(option);
    setRevealed(true);
    const isCorrect = option === wq.correctAnswer;
    onRecord(wq.id, isCorrect);
    if (isCorrect) {
      toast.success(
        wq.consecutiveCorrect + 1 >= MASTERY_THRESHOLD
          ? '🏆 Mastered!'
          : `✓ Correct! ${MASTERY_THRESHOLD - (wq.consecutiveCorrect + 1)} more to master`,
        { duration: 2000 }
      );
    }
  }

  function handleReset() {
    setSelected(null);
    setRevealed(false);
  }

  const progressToMastery = Math.min((wq.consecutiveCorrect / MASTERY_THRESHOLD) * 100, 100);
  const isMastered = wq.status === 'mastered';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`card p-4 border-l-4 ${isMastered ? 'border-l-green-500' : 'border-l-red-400'}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
              {wq.displayDate}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isMastered
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : wq.wrongCount >= 3
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            }`}>
              {isMastered ? '🏆 Mastered' : `❌ Wrong ${wq.wrongCount}×`}
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {wq.question}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {revealed && (
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Try again"
            >
              <RotateCcw size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            {isExpanded
              ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            }
          </button>
          <button
            onClick={() => onDismiss(wq.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500 transition-colors"
            title="Remove"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Mastery progress bar */}
      {!isMastered && (
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>Mastery progress</span>
            <span>{wq.consecutiveCorrect}/{MASTERY_THRESHOLD} consecutive</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressToMastery}%` }}
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-green-500"
            />
          </div>
        </div>
      )}

      {/* Expanded: options + explanation */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-2">
              {wq.options.map((opt, idx) => {
                const label = getOptionLabel(idx);
                const isCorrect = opt === wq.correctAnswer;
                const isSelected = opt === selected;
                let cls = 'option-btn text-sm py-3';
                if (revealed) {
                  if (isCorrect) cls += ' reveal-correct';
                  else if (isSelected) cls += ' selected-wrong';
                  else cls += ' neutral-disabled';
                }
                return (
                  <button
                    key={opt}
                    className={cls}
                    onClick={() => handleSelect(opt)}
                    disabled={revealed}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        revealed && isCorrect ? 'bg-green-500 text-white'
                        : revealed && isSelected ? 'bg-red-500 text-white'
                        : 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                      }`}>
                        {label}
                      </span>
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>

            {revealed && wq.explanation && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-3 rounded-xl border"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              >
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Explanation
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {wq.explanation}
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterMode = 'learning' | 'mastered' | 'all';

export default function WrongQuestionsPage() {
  const { questions, isLoading, load, recordRevisionAttempt, dismiss, getActive, getMastered } = useWrongQuestionsStore();
  const [filter, setFilter] = useState<FilterMode>('learning');

  useEffect(() => { load(); }, []);

  const active = getActive();
  const mastered = getMastered();
  const displayed = filter === 'learning' ? active : filter === 'mastered' ? mastered : questions;

  const handleRecord = useCallback(async (id: string, correct: boolean) => {
    await recordRevisionAttempt(id, correct);
  }, [recordRevisionAttempt]);

  const handleDismiss = useCallback(async (id: string) => {
    await dismiss(id);
    toast.success('Question removed');
  }, [dismiss]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 h-24 shimmer" style={{ background: 'var(--border)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <Brain size={20} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Wrong Questions
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Answer correctly {MASTERY_THRESHOLD}× in a row to master
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Needs Work', value: active.length, icon: Target, color: '#ef4444', bg: '#ef444418' },
          { label: 'Mastered', value: mastered.length, icon: Trophy, color: '#22c55e', bg: '#22c55e18' },
          { label: 'Total', value: questions.length, icon: Brain, color: '#6366f1', bg: '#6366f118' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-3 text-center">
            <div className="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center" style={{ background: bg }}>
              <Icon size={16} style={{ color }} />
            </div>
            <p className="text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      {questions.length > 0 && (
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--border)' }}>
          {([
            { key: 'learning', label: `Needs Work (${active.length})` },
            { key: 'mastered', label: `Mastered (${mastered.length})` },
            { key: 'all', label: `All (${questions.length})` },
          ] as { key: FilterMode; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === key
                  ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400'
                  : 'hover:bg-white/50 dark:hover:bg-white/5'
              }`}
              style={filter !== key ? { color: 'var(--text-secondary)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Question list */}
      {questions.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={28} className="text-green-500" />}
          title="No wrong questions yet"
          description="When you answer incorrectly in a quiz, questions will appear here for spaced revision."
        />
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} className="text-amber-500" />}
          title={filter === 'mastered' ? 'No mastered questions yet' : 'Nothing here'}
          description={
            filter === 'mastered'
              ? `Answer any question correctly ${MASTERY_THRESHOLD} times in a row to master it.`
              : 'No questions in this category.'
          }
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {displayed.map((wq) => (
              <WQCard
                key={wq.id}
                wq={wq}
                onDismiss={handleDismiss}
                onRecord={handleRecord}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
