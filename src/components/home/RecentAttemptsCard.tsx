import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { mockAttemptsDB, universalAttemptsDB } from '../../services/db';
import { useHistoryStore } from '../../store/historyStore';
import { mergeRecent, recentFromLegacy, recentFromMocks, recentFromUniversal, type RecentKind } from '../../services/homeSnapshots';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { HomeCard, CardSkeleton, CardError, CardEmpty } from './HomeCard';

const KIND_LABEL: Record<RecentKind, string> = { practice: 'Practice', test: 'Test', mock: 'Mock', daily: 'Daily quiz' };

async function load() {
  await useHistoryStore.getState().load();
  const [universal, mocks] = await Promise.all([universalAttemptsDB.getAll(), mockAttemptsDB.getAll()]);
  return mergeRecent([recentFromUniversal(universal), recentFromMocks(mocks), recentFromLegacy(useHistoryStore.getState().tests)], 5);
}

/** The latest finished attempts from every engine (practice, test, mock, daily quiz), newest first. */
export function RecentAttemptsCard() {
  const navigate = useNavigate();
  const [state, reload] = useAsyncSection(load);
  return (
    <HomeCard title="Recent attempts" icon={<History size={16} className="text-brand-500" aria-hidden />} testId="home-recent"
      action={<button type="button" onClick={() => navigate('/history')} className="min-h-11 px-1 text-xs font-medium text-brand-500 hover:text-brand-600">View all →</button>}>
      {state.status === 'loading' && <CardSkeleton rows={3} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && (
        <CardEmpty text="No finished attempts yet." actionLabel="Take a practice test" onAction={() => navigate('/practice/configure')} />
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="space-y-1">
          {state.data.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => navigate(a.route)} className="w-full min-h-11 flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{KIND_LABEL[a.kind]} · {new Date(a.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className="flex-shrink-0 text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {a.accuracy !== null ? `${a.accuracy}% accuracy` : `${a.answered}/${a.total} answered`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
