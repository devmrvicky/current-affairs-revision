import { Check, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { MARK_PURPOSES, type MarkPurpose } from '../../types/questionMark';

interface MarkPurposeSheetProps {
  open: boolean;
  /** Every purpose the question currently carries (it can carry several). */
  selected: MarkPurpose[];
  questionNumber: number;
  /** Tick or untick one purpose. Applied immediately. */
  onToggle: (purpose: MarkPurpose) => void;
  /** Clear every purpose. */
  onRemove: () => void;
  onClose: () => void;
}

/**
 * "Why are you marking this question?" — a bottom sheet on phones and a compact dialog on larger screens.
 * Marking never happens on the first tap of the Mark button. Purposes are independent ticks: a question can be Doubtful,
 * Further Practice and Revision at once (it is still ONE saved question), and each can be changed or removed later.
 */
export function MarkPurposeSheet({ open, selected, questionNumber, onToggle, onRemove, onClose }: MarkPurposeSheetProps) {
  return (
    <Modal open={open} onClose={onClose} variant="sheet" title={`Mark question ${questionNumber}`} description="Choose one or more reasons — change or remove any of them later.">
      <div role="group" aria-label="Mark purposes" className="space-y-2">
        {MARK_PURPOSES.map((p, i) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onToggle(p.id)}
              className="w-full flex items-start gap-3 text-left p-3 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              style={{ border: `1.5px solid ${on ? p.color : 'var(--border)'}`, background: on ? `${p.color}14` : 'transparent' }}
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5" style={{ background: p.color }} aria-hidden>{p.badge}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.label}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.description}</span>
                {p.savesToReviewCenter && <span className="block text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Also saved to your Review Center</span>}
              </span>
              {on && <Check size={16} className="flex-shrink-0 mt-1" style={{ color: p.color }} aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-4">
        {selected.length > 0 && (
          <button type="button" onClick={onRemove} className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-xl font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" style={{ border: '1px solid var(--border)' }}>
            <Trash2 size={14} /> Remove all
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-primary flex-1 text-sm py-2.5">Done</button>
      </div>
    </Modal>
  );
}
