import { motion } from 'framer-motion';
import type { QuestionAttempt } from '../../types';
import { CheckCircle2, XCircle, Circle, Flag } from 'lucide-react';

interface QuestionPaletteProps {
  attempts: QuestionAttempt[];
  currentIndex: number;
  visitedIndices: number[];
  onJump: (index: number) => void;
}

export function QuestionPalette({ attempts, currentIndex, visitedIndices, onJump }: QuestionPaletteProps) {
  const correct = attempts.filter((a) => a.status === 'correct').length;
  const wrong = attempts.filter((a) => a.status === 'wrong').length;
  const unanswered = attempts.filter((a) => a.status === 'unanswered').length;
  const marked = attempts.filter((a) => a.markedForReview).length;
  const visited = new Set(visitedIndices ?? []);

  return (
    <div className="card p-4 h-fit">
      {/* Legend */}
      <div className="mb-4 space-y-2">
        <h3 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
          Question Palette
        </h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span style={{ color: 'var(--text-secondary)' }}>Correct ({correct})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span style={{ color: 'var(--text-secondary)' }}>Wrong ({wrong})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded ring-2 ring-amber-400" style={{ background: 'var(--card)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-dashed" style={{ background: 'var(--border)', borderColor: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Visited, skipped</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Not visited</span>
          </div>
          {marked > 0 && (
            <div className="flex items-center gap-1.5">
              <Flag size={11} className="text-amber-500" fill="currentColor" />
              <span style={{ color: 'var(--text-secondary)' }}>Marked ({marked})</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid — every question is always clickable; jump freely, no sequential restriction */}
      <div className="grid grid-cols-5 gap-1.5">
        {attempts.map((attempt, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered = attempt.status !== 'unanswered';
          const isVisited = visited.has(idx);

          let bg = 'var(--bg)';           // not visited
          let textColor = 'var(--text-muted)';
          let extraClass = 'border';
          let borderColor = 'var(--border)';

          if (attempt.status === 'correct') {
            bg = '#22c55e'; textColor = '#fff'; extraClass = '';
          } else if (attempt.status === 'wrong') {
            bg = '#ef4444'; textColor = '#fff'; extraClass = '';
          } else if (isVisited) {
            // visited but skipped
            bg = 'var(--border)'; textColor = 'var(--text-secondary)'; extraClass = 'border-2 border-dashed';
            borderColor = 'var(--text-muted)';
          }

          if (attempt.markedForReview) {
            borderColor = '#f59e0b';
            extraClass = `${extraClass.includes('border') ? extraClass : 'border-2'}`.replace('border-dashed', 'border-solid');
          }

          return (
            <motion.button
              key={idx}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onJump(idx)}
              className={`quiz-palette-btn relative ${extraClass} ${isCurrent ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
              style={{ background: bg, color: textColor, borderColor }}
              title={`Q${idx + 1}: ${attempt.markedForReview ? 'marked for review, ' : ''}${isAnswered ? attempt.status : isVisited ? 'visited' : 'not visited'}`}
            >
              {idx + 1}
              {attempt.bookmarked && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-purple-500 rounded-full" />
              )}
              {attempt.markedForReview && (
                <Flag size={9} className="absolute -top-1 -left-1 text-amber-500" fill="currentColor" />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-green-500 mb-0.5">
            <CheckCircle2 size={14} />
            <span className="text-sm font-bold">{correct}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Right</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-red-500 mb-0.5">
            <XCircle size={14} />
            <span className="text-sm font-bold">{wrong}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Wrong</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5" style={{ color: 'var(--text-muted)' }}>
            <Circle size={14} />
            <span className="text-sm font-bold">{unanswered}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Left</p>
        </div>
      </div>
    </div>
  );
}
