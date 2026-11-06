import { useState, type FormEvent } from 'react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { ImportResult } from '../../services/author/authorDb';
import type { ConflictPolicy } from '../../types/authorStudio';

interface NameDialogProps {
  open: boolean;
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  /** Resolve with an error message to keep the dialog open, or nothing to close it. */
  onSubmit: (name: string) => Promise<string | void>;
  onCancel: () => void;
}

/** One text field + submit. Keyed by the opener so state resets on every open. */
export function NameDialog(props: NameDialogProps) {
  return props.open ? <NameDialogInner {...props} /> : null;
}

function NameDialogInner({ title, label, initial = '', confirmLabel, onSubmit, onCancel }: NameDialogProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const msg = await onSubmit(value);
    setBusy(false);
    if (msg) setError(msg);
  }
  return (
    <Modal open onClose={onCancel} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          <input data-autofocus value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} maxLength={120}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </label>
        <p role="alert" className="text-sm min-h-5" style={{ color: '#dc2626' }}>{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary flex-1 text-sm py-2.5">Cancel</button>
          <button type="submit" disabled={busy || value.trim() === ''} className="btn-primary flex-1 text-sm py-2.5">{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

interface ConflictDialogProps {
  open: boolean;
  conflicts: string[];
  total: number;
  busy?: boolean;
  onChoose: (policy: ConflictPolicy) => void;
  onCancel: () => void;
}

/** Existing files with the same name. Skip and Keep-both are safe; Replace asks again before it overwrites anything. */
export function ImportConflictDialog({ open, conflicts, total, busy, onChoose, onCancel }: ConflictDialogProps) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  return (
    <>
      <Modal open={open && !confirmReplace} onClose={onCancel} title="Files with the same name already exist" description={`${conflicts.length} of ${total} file(s) clash with existing files.`}>
        <ul className="max-h-40 overflow-y-auto rounded-xl p-2 text-xs space-y-0.5" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          {conflicts.map((c) => <li key={c} className="truncate">{c}</li>)}
        </ul>
        <div className="mt-4 grid gap-2">
          <button type="button" disabled={busy} onClick={() => onChoose('rename')} className="btn-primary text-sm py-2.5">Keep both (rename the new ones)</button>
          <button type="button" disabled={busy} onClick={() => onChoose('skip')} className="btn-secondary text-sm py-2.5">Skip the clashing files</button>
          <button type="button" disabled={busy} onClick={() => setConfirmReplace(true)} className="text-sm py-2.5 rounded-xl font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Replace existing files…</button>
          <button type="button" disabled={busy} onClick={onCancel} className="btn-ghost text-sm">Cancel import</button>
        </div>
      </Modal>
      <ConfirmDialog open={open && confirmReplace} title="Replace existing files?" confirmLabel="Replace" destructive busy={busy}
        onConfirm={() => { setConfirmReplace(false); onChoose('replace'); }} onCancel={() => setConfirmReplace(false)}>
        <p>The content of <strong>{conflicts.length}</strong> existing file(s) will be overwritten with the uploaded versions. Their names, locations and favourites are kept.</p>
        <p>This cannot be undone from the app — export a backup first if you might want the old versions.</p>
      </ConfirmDialog>
    </>
  );
}

export function ImportReportDialog({ result, onClose }: { result: ImportResult | null; onClose: () => void }) {
  return (
    <Modal open={result !== null} onClose={onClose} title="Import finished">
      {result && (
        <div className="space-y-3 text-sm">
          <p style={{ color: 'var(--text-secondary)' }}>
            {result.added} added · {result.renamed} renamed · {result.replaced} replaced · {result.skipped} skipped · {result.failed} failed
          </p>
          <ul className="max-h-56 overflow-y-auto rounded-xl p-2 text-xs space-y-1" style={{ border: '1px solid var(--border)' }}>
            {result.outcomes.filter((o) => o.outcome !== 'added').map((o, i) => (
              <li key={i} style={{ color: o.outcome === 'failed' ? '#dc2626' : 'var(--text-secondary)' }}>
                <strong>{o.name}</strong> — {o.outcome}{o.finalName ? ` as ${o.finalName}` : ''}{o.reason ? ` (${o.reason})` : ''}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onClose} className="btn-primary w-full text-sm py-2.5">Done</button>
        </div>
      )}
    </Modal>
  );
}
