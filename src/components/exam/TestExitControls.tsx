import { useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { archiveSession } from '../../services/sessionArchive';
import type { ResumableSessionSummary } from '../../types/savedSession';

interface TestExitControlsProps {
  /** The running session as a Resume summary (location 'active'), or null if it no longer exists. */
  getSummary: () => ResumableSessionSummary | null;
  /** Leaves the screen for where the test was opened from (useExitTest). Captured when the learner acts, so it still works after the session is cleared. */
  exit: () => void;
}

const BUTTON = 'w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

/**
 * The two ways out of a test, in the header of every session screen.
 *   ← Back  saves where you are (the clock stops when this screen unmounts) and returns to where the test was opened
 *           from. The session STAYS in Resume Tests. Nothing is submitted, deleted or archived.
 *   ✕ Close asks first, then archives the session (never hard-deletes), removes it from Resume Tests and returns.
 *           If archiving fails the session is kept and an error is shown.
 * One in-flight guard covers both, so a double tap can never navigate twice or race a save against an archive.
 */
export function TestExitControls({ getSummary, exit }: TestExitControlsProps) {
  const inFlight = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function goBack() {
    if (inFlight.current) return;
    inFlight.current = true;
    toast('Progress saved — resume this test from Home.', { icon: '💾', id: 'test-saved' });
    exit();
  }

  async function confirmClose() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const leave = exit;
    try {
      const summary = getSummary();
      const archived = summary ? await archiveSession(summary) : false;
      if (archived) toast.success('Test closed — your answers are archived.', { id: 'test-closed' });
      else toast('This test was already closed.', { id: 'test-closed' });
      leave();
    } catch (err) {
      console.error('Could not archive the test', err);
      toast.error('Could not close the test. It is still in Resume Tests.', { id: 'test-closed' });
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center flex-shrink-0 -ml-1">
        <button type="button" onClick={goBack} disabled={busy} className={BUTTON} aria-label="Back — progress is saved" title="Back — your progress is saved" data-testid="test-back">
          <ArrowLeft size={20} aria-hidden style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={busy} className={BUTTON} aria-label="Close test — archive and remove from Resume" title="Close test — archive and remove from Resume" data-testid="test-close">
          <X size={20} aria-hidden style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>
      <ConfirmDialog open={confirmOpen} title="Close this test?" confirmLabel="Close test" destructive busy={busy} onConfirm={confirmClose} onCancel={() => { if (!inFlight.current) setConfirmOpen(false); }}>
        <p>It will leave Resume Tests and cannot be resumed. Your answers are archived, not deleted.</p>
      </ConfirmDialog>
    </>
  );
}
