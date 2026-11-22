import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import type { MockQuestionState } from '../../types/mockSession';
import type { QuestionOrderMode } from '../../types/questionOrder';
import type { UniversalQuestion } from '../../types/universalQuestion';
import { MarkBadge } from '../exam/MarkBadge';
import { effectivePurpose, getMarkPurposeInfo } from '../../types/questionMark';
import { buildQuestionOrder } from '../../utils/questionOrder';
import { QuestionPaletteControls } from '../quiz/QuestionPaletteControls';

interface MockQuestionPaletteProps {
  questionIds: string[];
  states: Record<string, MockQuestionState>;
  currentIndex: number;
  onJump: (index: number) => void;
  questionsById?: Map<string, UniversalQuestion>;
  orderMode?: QuestionOrderMode;
  originalOrderIds?: string[];
  onOrderChange?: (orderIds: string[], mode: QuestionOrderMode) => void;
}

// The palette never reveals correctness in Mock/Sectional exam simulation mode.
export const MockQuestionPalette = memo(function MockQuestionPalette({
  questionIds,
  states,
  currentIndex,
  onJump,
  questionsById,
  orderMode = 'original',
  originalOrderIds,
  onOrderChange,
}: MockQuestionPaletteProps) {
  const answered = questionIds.filter((id) => states[id]?.selectedAnswer !== null).length;
  const notAnswered = questionIds.filter((id) => states[id]?.visited && states[id]?.selectedAnswer === null).length;
  const notVisited = questionIds.filter((id) => !states[id]?.visited).length;
  const marked = questionIds.filter((id) => states[id] && effectivePurpose(states[id])).length;
  const metadata = useMemo(() => new Map(questionIds.map((id) => [id, {
    difficulty: questionsById?.get(id)?.difficulty,
  }])), [questionIds, questionsById]);
  // Always show every question. Sorting changes only the question sequence.
  const visibleItems = questionIds.map((qid, index) => ({ qid, index }));

  function changeOrder(mode: QuestionOrderMode) {
    if (!onOrderChange) return;
    const reorderableIds = questionIds.slice(currentIndex + 1);
    const next = buildQuestionOrder(
      questionIds,
      originalOrderIds?.length === questionIds.length ? originalOrderIds : questionIds,
      metadata,
      mode,
      reorderableIds,
    );
    onOrderChange(next, mode);
  }

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

      <div className="flex items-center justify-between mb-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span>Question numbers</span>
        <span>{questionIds.length} total</span>
      </div>

      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-5 gap-1.5" role="list" aria-label="Question palette">
          {visibleItems.map(({ qid, index: idx }) => {
            const state = states[qid];
            const isCurrent = idx === currentIndex;
            const answeredQ = state?.selectedAnswer !== null;
            const purpose = state ? effectivePurpose(state) : undefined;
            const markedQ = !!purpose;
            const visitedQ = !!state?.visited;

            let bg = 'var(--bg)';
            let color = 'var(--text-muted)';
            let extraClass = 'border';
            let label = 'not visited';

            if (answeredQ && markedQ) {
              bg = '#8b5cf6'; color = '#fff'; extraClass = ''; label = `answered and marked (${getMarkPurposeInfo(purpose)?.label})`;
            } else if (markedQ) {
              bg = '#f59e0b'; color = '#fff'; extraClass = ''; label = `marked (${getMarkPurposeInfo(purpose)?.label})`;
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
                <MarkBadge purpose={purpose} />
              </motion.button>
            );
          })}
        </div>
      ) : null}

      <QuestionPaletteControls
        orderMode={orderMode}
        onOrderModeChange={changeOrder}
        disabled={!onOrderChange || questionIds.length < 2}
      />
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
