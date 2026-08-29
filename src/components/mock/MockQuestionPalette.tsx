import { memo } from 'react';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import type { MockQuestionState } from '../../types/mockSession';

interface MockQuestionPaletteProps {
  questionIds: string[];
  states: Record<string, MockQuestionState>;
  currentIndex: number;
  onJump: (index: number) => void;
}

// Palette states per product spec §15: NOT_VISITED / VISITED_NOT_ANSWERED /
// ANSWERED / MARKED_FOR_REVIEW / ANSWERED_AND_MARKED_FOR_REVIEW / CURRENT.
// Never reveals correctness — this is exam-simulation mode (product spec §45).
export const MockQuestionPalette = memo(function MockQuestionPalette({ questionIds, states, currentIndex, onJump }: MockQuestionPaletteProps) {
  const answered = questionIds.filter((id) => states[id]?.selectedAnswer !== null).length;
  const notAnswered = questionIds.filter((id) => states[id]?.visited && states[id]?.selectedAnswer === null).length;
  const notVisited = questionIds.filter((id) => !states[id]?.visited).length;
  const marked = questionIds.filter((id) => states[id]?.isMarkedForReview).length;

  return (
    <div className="card p-4 h-fit">
      <h3 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
        Question Palette
      </h3>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] mb-4">
        <Legend swatch="var(--bg)" border="var(--border)" label={`Not visited (${notVisited})`} />
        <Legend swatch="var(--border)" dashed label={`Not answered (${notAnswered})`} />
        <Legend swatch="#22c55e" label={`Answered (${answered})`} />
        <Legend icon={<Flag size={10} className="text-amber-500" fill="currentColor" />} label={`Marked (${marked})`} />
      </div>

      <div className="grid grid-cols-5 gap-1.5" role="list" aria-label="Question palette">
        {questionIds.map((qid, idx) => {
          const state = states[qid];
          const isCurrent = idx === currentIndex;
          const answeredQ = state?.selectedAnswer !== null;
          const markedQ = !!state?.isMarkedForReview;
          const visitedQ = !!state?.visited;

          let bg = 'var(--bg)';
          let color = 'var(--text-muted)';
          let extraClass = 'border';
          let label = 'not visited';

          if (answeredQ && markedQ) {
            bg = '#8b5cf6'; color = '#fff'; extraClass = ''; label = 'answered and marked for review';
          } else if (markedQ) {
            bg = '#f59e0b'; color = '#fff'; extraClass = ''; label = 'marked for review';
          } else if (answeredQ) {
            bg = '#22c55e'; color = '#fff'; extraClass = ''; label = 'answered';
          } else if (visitedQ) {
            bg = 'var(--border)'; color = 'var(--text-secondary)'; extraClass = 'border-2 border-dashed'; label = 'visited, not answered';
          }

          return (
            <motion.button
              key={qid}
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onJump(idx)}
              className={`quiz-palette-btn relative ${extraClass} ${isCurrent ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
              style={{ background: bg, color }}
              aria-label={`Question ${idx + 1}: ${label}${isCurrent ? ', current' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              {idx + 1}
              {markedQ && <Flag size={9} className="absolute -top-1 -left-1 text-amber-600" fill="currentColor" />}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
});

function Legend({ swatch, border, dashed, icon, label }: { swatch?: string; border?: string; dashed?: boolean; icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon ?? (
        <div
          className={`w-3 h-3 rounded ${dashed ? 'border-2 border-dashed' : swatch === 'var(--bg)' ? 'border' : ''}`}
          style={{ background: swatch, borderColor: border ?? 'var(--text-muted)' }}
        />
      )}
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}
