import { ConfirmDialog } from '../common/ConfirmDialog';

interface SubmitTestDialogProps {
  open: boolean;
  total: number;
  answered: number;
  marked?: number;
  busy?: boolean;
  /** Extra sentence for engine-specific rules (e.g. "This also locks the remaining sections"). */
  note?: string;
  /** Replaces the default "Out of N questions. You won't be able to change your answers after submitting." line. */
  message?: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The shared "are you sure you want to submit?" summary used by every engine's sidebar Submit button. */
export function SubmitTestDialog({ open, total, answered, marked = 0, busy = false, note, message, title = 'Submit Test?', confirmLabel = 'Submit Test', onConfirm, onCancel }: SubmitTestDialogProps) {
  const unanswered = Math.max(0, total - answered);
  return (
    <ConfirmDialog open={open} title={title} confirmLabel={confirmLabel} busy={busy} onConfirm={onConfirm} onCancel={onCancel}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl py-2" style={{ background: 'var(--border)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }} data-testid="submit-answered">{answered}</p>
          <p className="text-[11px]">Answered</p>
        </div>
        <div className="rounded-xl py-2" style={{ background: 'var(--border)' }}>
          <p className="text-lg font-bold" style={{ color: unanswered > 0 ? '#d97706' : 'var(--text-primary)' }} data-testid="submit-unanswered">{unanswered}</p>
          <p className="text-[11px]">Unanswered</p>
        </div>
        <div className="rounded-xl py-2" style={{ background: 'var(--border)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }} data-testid="submit-marked">{marked}</p>
          <p className="text-[11px]">Marked</p>
        </div>
      </div>
      <p>{message ?? `Out of ${total} questions. You won't be able to change your answers after submitting.`}</p>
      {note && <p>{note}</p>}
    </ConfirmDialog>
  );
}
