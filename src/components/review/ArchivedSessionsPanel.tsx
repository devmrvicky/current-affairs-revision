import { useCallback, useState } from 'react';
import { Archive, ChevronDown } from 'lucide-react';
import { QuestionWiseTable } from '../results/QuestionWiseTable';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { CardEmpty, CardError, CardSkeleton } from '../home/HomeCard';
import { archivedQuestionRows, listArchivedSessions } from '../../services/archivedView';
import type { ArchivedSessionRecord } from '../../types/savedSession';
import type { QuestionRow } from '../../services/resultTables';

const KIND: Record<ArchivedSessionRecord['kind'], string> = { universal: 'Practice / Test', legacy: 'Quiz', mock: 'Mock' };

function ArchivedRow({ record }: { record: ArchivedSessionRecord }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) {
      try { setRows(await archivedQuestionRows(record)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this test.'); }
    }
  }

  return (
    <li className="card p-3" data-testid="archived-session">
      <button type="button" onClick={() => { void toggle(); }} aria-expanded={open} className="w-full min-h-11 flex items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{record.title}</span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {KIND[record.kind]}{record.subtitle ? ` · ${record.subtitle}` : ''} · closed {new Date(record.archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {record.answered}/{record.total} answered
          </span>
        </span>
        <ChevronDown size={16} aria-hidden className={`flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3">
          {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
            : rows === null ? <CardSkeleton rows={2} />
            : rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">The questions of this test are no longer available, so there is nothing to show.</p>
            : <QuestionWiseTable rows={rows} showSection={rows.some((r) => r.sectionTitle !== null)} />}
        </div>
      )}
    </li>
  );
}

/**
 * Tests closed with ✕. VIEW ONLY: you can look at what you answered and what was correct, but a closed test can't be resumed or re-submitted
 * (the ✕ confirmation said so). Nothing here changes or deletes anything.
 */
export function ArchivedSessionsPanel() {
  const loader = useCallback(() => listArchivedSessions(), []);
  const [state, reload] = useAsyncSection(loader);
  return (
    <div className="space-y-3" data-testid="archived-panel">
      <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <Archive size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
        <span><b>View only.</b> Closed tests can't be resumed or re-submitted. Your answers are kept here, not deleted.</span>
      </p>
      {state.status === 'loading' && <CardSkeleton rows={3} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && <div className="card p-5"><CardEmpty text="No closed tests. When you close a test with ✕, it is kept here for you to look back on." /></div>}
      {state.status === 'ready' && state.data.length > 0 && <ul className="space-y-2" aria-label="Closed tests">{state.data.map((r) => <ArchivedRow key={r.id} record={r} />)}</ul>}
    </div>
  );
}
