import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body — a sentence, or a small summary block. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red). */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Explicit-answer confirmation. Cancel is focused first, so Enter never confirms by accident. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', destructive = false, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} alert hideCloseButton>
      <div className="text-sm space-y-3" style={{ color: 'var(--text-secondary)' }}>{children}</div>
      <div className="flex gap-2 mt-5">
        <button type="button" data-autofocus onClick={onCancel} disabled={busy} className="btn-secondary flex-1 text-sm py-2.5">{cancelLabel}</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`flex-1 text-sm py-2.5 rounded-xl font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${destructive ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-500' : 'bg-brand-500 hover:bg-brand-600 focus-visible:outline-brand-500'}`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
