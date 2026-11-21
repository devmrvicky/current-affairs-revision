import { useNavigate } from 'react-router-dom';
import { TrendingDown } from 'lucide-react';
import { universalAttemptsDB } from '../../services/db';
import { weakSnapshot } from '../../services/homeSnapshots';
import { subjectRegistry, getTopicDisplayName } from '../../data/registry/subjectRegistry';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { HomeCard, CardSkeleton, CardError, CardEmpty } from './HomeCard';

const load = async () => weakSnapshot(await universalAttemptsDB.getAll(), 3);

/** The three weakest topics. A topic is only rated once it has enough answered attempts (the same sample-size rule as Review Center). */
export function WeakTopicsCard() {
  const navigate = useNavigate();
  const [state, reload] = useAsyncSection(load);
  const action = <button type="button" onClick={() => navigate('/review-center')} className="min-h-11 px-1 text-xs font-medium text-brand-500 hover:text-brand-600">Review Center →</button>;

  return (
    <HomeCard title="Weak topics" icon={<TrendingDown size={16} className="text-red-500" aria-hidden />} action={action} testId="home-weak-topics">
      {state.status === 'loading' && <CardSkeleton rows={3} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.totalTopics === 0 && (
        <CardEmpty text="No attempts yet. Answer some practice questions and your weak topics will show up here." actionLabel="Start practising" onAction={() => navigate('/practice/configure')} />
      )}
      {state.status === 'ready' && state.data.totalTopics > 0 && state.data.top.length === 0 && (
        state.data.ratedCount === 0
          ? <CardEmpty text={`Not enough data yet. A topic is only rated after ${state.data.minAttempts} answered attempts — ${state.data.insufficientCount} topic${state.data.insufficientCount === 1 ? ' has' : 's have'} fewer so far.`} />
          : <CardEmpty text={`No weak topics right now — ${state.data.ratedCount} topic${state.data.ratedCount === 1 ? ' is' : 's are'} rated and none is weak.`} />
      )}
      {state.status === 'ready' && state.data.top.length > 0 && (
        <ol className="space-y-2">
          {state.data.top.map((t) => (
            <li key={t.topicId} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{getTopicDisplayName(t.subjectId, t.topicId)}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subjectRegistry.getSubject(t.subjectId)?.name ?? t.subjectId} · {t.attempted} attempted</p>
              </div>
              <span className="flex-shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">Weak · {t.accuracy}%</span>
            </li>
          ))}
        </ol>
      )}
    </HomeCard>
  );
}
