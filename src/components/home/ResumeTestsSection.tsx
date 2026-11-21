import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Flag, PlayCircle, RefreshCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { abandonSavedSession, groupResumableSessions, listResumableSessions, resumeSavedSession } from '../../services/sessionManager';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { formatAttemptDate } from '../tests/format';
import type { ResumableSessionSummary } from '../../types/savedSession';

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function resumeLabel(summary: ResumableSessionSummary): string {
  return summary.mode === 'practice' ? 'Resume Practice' : 'Resume Test';
}

interface SessionDetailsProps {
  summary: ResumableSessionSummary;
  onResume: (summary: ResumableSessionSummary) => void;
  onAbandon: (summary: ResumableSessionSummary) => void;
  isResuming: boolean;
  compact?: boolean;
}

function SessionDetails({ summary, onResume, onAbandon, isResuming, compact = false }: SessionDetailsProps) {
  const progress = summary.total > 0 ? Math.min(100, (summary.answered / summary.total) * 100) : 0;

  return (
    <li
      className={compact
        ? 'flex items-center gap-2.5 rounded-xl border p-2.5 min-w-0'
        : 'flex items-center gap-3 rounded-xl border p-3 min-w-0'}
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      data-testid="resume-card"
      data-session-id={summary.id}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold text-sm leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
          {summary.title}
        </p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {summary.subtitle || summary.group}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 rounded-full overflow-hidden flex-1 min-w-0" style={{ background: 'var(--border)' }} aria-hidden>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
            {summary.answered}/{summary.total}
          </span>
        </div>
        {!compact && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>Question {summary.position} of {summary.total}</span>
            <span>{summary.mode === 'mock' ? 'Mock test' : summary.mode === 'test' ? 'Test' : 'Practice'}</span>
            {summary.remainingSeconds !== null && (
              <span className="inline-flex items-center gap-1"><Clock size={11} /> {formatRemaining(summary.remainingSeconds)} left</span>
            )}
            {summary.markedCount > 0 && <span className="inline-flex items-center gap-1"><Flag size={11} /> {summary.markedCount} marked</span>}
            <span>Last active: {formatAttemptDate(summary.lastActiveAt)}</span>
          </p>
        )}
      </div>

      {!compact && (
        <button
          type="button"
          onClick={() => onAbandon(summary)}
          aria-label={`Close test: ${summary.title}`}
          title="Close test — archives your progress"
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0"
        >
          <X size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onResume(summary)}
        disabled={isResuming}
        aria-label={`${resumeLabel(summary)}: ${summary.title}`}
        className={compact
          ? 'btn-primary flex items-center justify-center gap-1.5 text-xs px-3 py-2 flex-shrink-0'
          : 'btn-primary flex items-center justify-center gap-1.5 text-xs px-3 py-2 flex-shrink-0'}
      >
        <PlayCircle size={14} /> {isResuming ? 'Opening…' : compact ? 'Resume' : resumeLabel(summary)}
      </button>
      {compact && (
        <button
          type="button"
          onClick={() => onAbandon(summary)}
          aria-label={`Close test: ${summary.title}`}
          title="Close test — archives your progress"
          className="p-2 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0"
        >
          <X size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
      )}
    </li>
  );
}

/** Home shows only the latest unfinished session; the full subject-grouped list lives in a focused sheet. */
export function ResumeTestsSection() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ResumableSessionSummary[] | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [toAbandon, setToAbandon] = useState<ResumableSessionSummary | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [activeGroup, setActiveGroup] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSessions(await listResumableSessions());
      setLoadFailed(false);
    } catch (err) {
      console.error('Could not read saved sessions', err);
      setSessions([]);
      setLoadFailed(true);
    }
  }, []);

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
        setResumingId(null);
        await refresh();
        return;
      }
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
      const archived = await abandonSavedSession(toAbandon);
      if (archived) toast.success('Test closed — progress archived');
      else toast.error('That test is no longer available.');
      setToAbandon(null);
      await refresh();
    } catch (err) {
      console.error('Could not archive session', err);
      toast.error("Couldn't close that test — it is still under Resume Tests.");
    } finally {
      setAbandoning(false);
    }
  }

  const groups = useMemo(() => groupResumableSessions(sessions ?? []), [sessions]);
  const selectedGroup = groups.find((group) => group.label === activeGroup) ?? groups[0];
  const latest = sessions?.[0];

  return (
    <>
      <section aria-labelledby="resume-tests-heading" data-testid="home-resume-tests">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 id="resume-tests-heading" className="font-display font-semibold text-sm flex items-center gap-2 min-w-0" style={{ color: 'var(--text-primary)' }}>
            <RefreshCcw size={14} className="text-brand-500 flex-shrink-0" /> Resume Tests
            {sessions && sessions.length > 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{sessions.length}</span>}
          </h2>
          {sessions && sessions.length > 1 && (
            <button type="button" onClick={() => setShowAll(true)} className="min-h-8 px-1 text-xs font-semibold text-brand-500 hover:text-brand-600 flex-shrink-0">
              View all ({sessions.length}) →
            </button>
          )}
        </div>

        {sessions === null ? (
          <div className="h-16 rounded-xl shimmer" style={{ background: 'var(--border)' }} aria-busy="true" aria-label="Loading unfinished tests" />
        ) : sessions.length === 0 && loadFailed ? (
          <div className="rounded-xl p-4 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }} role="alert">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Couldn't read your saved tests</p>
            <button type="button" onClick={() => { void refresh(); }} className="btn-secondary mt-2 px-4 py-2 text-xs">Try again</button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }} role="status">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No unfinished tests</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>A test you leave part-way will be saved here so you can resume it.</p>
          </div>
        ) : latest ? (
          <ul className="space-y-2">
            <SessionDetails summary={latest} onResume={handleResume} onAbandon={setToAbandon} isResuming={resumingId !== null} compact />
          </ul>
        ) : null}
      </section>

      <Modal
        open={showAll}
        onClose={() => setShowAll(false)}
        title="All resumable tests"
        description="Choose a subject to find the test you left unfinished."
        variant="sheet"
        size="lg"
      >
        {groups.length === 0 ? (
          <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>There are no unfinished tests right now.</p>
        ) : (
          <>
            <div role="tablist" aria-label="Subjects" className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
              {groups.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  role="tab"
                  aria-selected={(selectedGroup?.label ?? '') === group.label}
                  onClick={() => setActiveGroup(group.label)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 border"
                  style={(selectedGroup?.label ?? '') === group.label
                    ? { background: 'var(--brand-soft, rgba(99,102,241,0.12))', color: 'var(--brand-600, #6366f1)', borderColor: 'var(--brand-400, #818cf8)' }
                    : { background: 'var(--card)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                  {group.label} <span className="ml-1 opacity-75">{group.sessions.length}</span>
                </button>
              ))}
            </div>
            {selectedGroup && (
              <div role="tabpanel" aria-label={`${selectedGroup.label} resumable tests`}>
                <ul className="space-y-2">
                  {selectedGroup.sessions.map((summary) => (
                    <SessionDetails key={summary.id} summary={summary} onResume={handleResume} onAbandon={setToAbandon} isResuming={resumingId !== null} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={toAbandon !== null}
        title="Close this test?"
        confirmLabel="Close test"
        busy={abandoning}
        onConfirm={confirmAbandon}
        onCancel={() => setToAbandon(null)}
      >
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>{toAbandon?.title}</strong> — {toAbandon?.answered} of {toAbandon?.total} questions answered.
        </p>
        <p>It will leave Resume Tests and can no longer be resumed. Your answers are archived, not deleted.</p>
      </ConfirmDialog>
    </>
  );
}
