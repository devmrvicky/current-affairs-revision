import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Flag, MoreHorizontal, PlayCircle, RefreshCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { abandonSavedSession, listResumableSessions, resumeSavedSession } from '../../services/sessionManager';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatAttemptDate } from '../tests/format';
import type { ResumableSessionSummary } from '../../types/savedSession';

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** "More options" — a tiny menu; closes on outside click and Escape. */
function CardMenu({ title, onAbandon }: { title: string; onAbandon: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for ${title}`}
        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        style={{ border: '1px solid var(--border)' }}
      >
        <MoreHorizontal size={16} style={{ color: 'var(--text-secondary)' }} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full mb-1 z-20 min-w-[170px] rounded-xl py-1 shadow-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onAbandon(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
          >
            <Trash2 size={14} /> Abandon test…
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Home's "Resume Tests": one compact card per unfinished test, from every engine, read from the
 * persisted sessions (the three engine stores and the saved-session registry) — nothing hardcoded.
 * Cards carry only counts and metadata, so no question content is loaded to render them.
 */
export function ResumeTestsSection() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ResumableSessionSummary[] | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [toAbandon, setToAbandon] = useState<ResumableSessionSummary | null>(null);
  const [abandoning, setAbandoning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSessions(await listResumableSessions());
    } catch (err) {
      console.error('Could not read saved sessions', err);
      setSessions([]);
    }
  }, []);

  // Read on mount (Home remounts after a test is started, completed or closed), and again whenever the tab regains focus.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  async function handleResume(summary: ResumableSessionSummary) {
    if (resumingId) return;
    setResumingId(summary.id);
    try {
      const route = await resumeSavedSession(summary);
      if (!route) {
        toast.error('That test is no longer available.');
        await refresh();
        return;
      }
      // Closing the test later returns here, to where it was resumed from.
      navigate(route, { state: { returnTo: '/', returnIdx: (window.history.state as { idx?: number } | null)?.idx ?? 0 } });
    } catch (err) {
      console.error('Could not resume session', err);
      toast.error("Couldn't resume that test — please try again.");
      setResumingId(null);
    }
  }

  async function confirmAbandon() {
    if (!toAbandon) return;
    setAbandoning(true);
    try {
      await abandonSavedSession(toAbandon);
      toast.success('Test abandoned');
      setToAbandon(null);
      await refresh();
    } catch (err) {
      console.error('Could not abandon session', err);
      toast.error("Couldn't abandon that test.");
    } finally {
      setAbandoning(false);
    }
  }

  if (sessions === null) {
    return <div className="card h-24 shimmer" style={{ background: 'var(--border)' }} aria-busy="true" aria-label="Loading unfinished tests" />;
  }

  return (
    <section aria-labelledby="resume-tests-heading">
      <div className="flex items-center justify-between mb-2">
        <h2 id="resume-tests-heading" className="font-display font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <RefreshCcw size={14} className="text-brand-500" /> Resume Tests
          {sessions.length > 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{sessions.length}</span>}
        </h2>
      </div>

      {sessions.length === 0 ? (
        <div className="card p-5 text-center" role="status">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No unfinished tests</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Start a test and leave it part-way — it will wait for you here.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sessions.map((s) => (
            <li key={s.id} className="card p-4 flex flex-col gap-3" data-testid="resume-card" data-session-id={s.id}>
              <div className="min-w-0">
                <p className="font-display font-semibold text-sm leading-snug break-words" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                {s.subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.subtitle}</p>}
              </div>

              <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <p>Progress: <strong style={{ color: 'var(--text-primary)' }}>{s.answered} of {s.total}</strong> questions answered</p>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} aria-hidden>
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.total > 0 ? (s.answered / s.total) * 100 : 0}%` }} />
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
                  <span>On question {s.position} of {s.total}</span>
                  {s.remainingSeconds !== null && (
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> {formatRemaining(s.remainingSeconds)} left</span>
                  )}
                  {s.markedCount > 0 && <span className="inline-flex items-center gap-1"><Flag size={11} /> {s.markedCount} marked</span>}
                </p>
                <p style={{ color: 'var(--text-muted)' }}>Last active: {formatAttemptDate(s.lastActiveAt)}</p>
              </div>

              <div className="flex items-center gap-2 mt-auto">
                <button
                  type="button"
                  onClick={() => handleResume(s)}
                  disabled={resumingId !== null}
                  aria-label={`Resume Test: ${s.title}`}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm py-2"
                >
                  <PlayCircle size={14} /> {resumingId === s.id ? 'Opening…' : 'Resume Test'}
                </button>
                <CardMenu title={s.title} onAbandon={() => setToAbandon(s)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toAbandon !== null}
        title="Abandon this test?"
        confirmLabel="Abandon test"
        destructive
        busy={abandoning}
        onConfirm={confirmAbandon}
        onCancel={() => setToAbandon(null)}
      >
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>{toAbandon?.title}</strong> — {toAbandon?.answered} of {toAbandon?.total} questions answered.
        </p>
        <p>Its saved progress will be permanently removed. No attempt is recorded in your history. This can't be undone.</p>
      </ConfirmDialog>
    </section>
  );
}
