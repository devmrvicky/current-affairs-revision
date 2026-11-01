import { Check, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { MARK_PURPOSES, type MarkPurpose } from '../../types/questionMark';

interface MarkPurposeSheetProps {
  open: boolean;
  /** The question's current mark, if any (highlighted; "Remove mark" appears). */
  current: MarkPurpose | undefined;
  questionNumber: number;
  onSelect: (purpose: MarkPurpose) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * "Why are you marking this question?" — a bottom sheet on phones and a compact dialog on larger screens.
 * Marking never happens on the first tap of the Mark button: the learner picks a purpose (or cancels).
 * Picking a purpose replaces any earlier one, so the same question can't be marked twice.
 */
export function MarkPurposeSheet({ open, current, questionNumber, onSelect, onRemove, onClose }: MarkPurposeSheetProps) {
  return (
    <Modal open={open} onClose={onClose} variant="sheet" title={`Mark question ${questionNumber}`} description="Choose why — you can change or remove it later.">
      <div role="radiogroup" aria-label="Mark purpose" className="space-y-2">
        {MARK_PURPOSES.map((p, i) => {
          const selected = current === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onSelect(p.id)}
              className="w-full flex items-start gap-3 text-left p-3 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              style={{ border: `1.5px solid ${selected ? p.color : 'var(--border)'}`, background: selected ? `${p.color}14` : 'transparent' }}
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5" style={{ background: p.color }} aria-hidden>{p.badge}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.label}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.description}</span>
                {p.savesToReviewCenter && <span className="block text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Also saved to your Review Center</span>}
              </span>
              {selected && <Check size={16} className="flex-shrink-0 mt-1" style={{ color: p.color }} />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-4">
        {current && (
          <button type="button" onClick={onRemove} className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-xl font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" style={{ border: '1px solid var(--border)' }}>
            <Trash2 size={14} /> Remove mark
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-secondary flex-1 text-sm py-2.5">Cancel</button>
      </div>
    </Modal>
  );
}
