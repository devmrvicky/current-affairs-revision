import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useReaderStore } from '../../store/readerStore';
import { resolveChapterLink } from '../../services/chapterLinks';
import { formatDuration } from '../../utils';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { HomeCard, CardSkeleton, CardError, CardEmpty } from './HomeCard';

const loadReaderData = () => useReaderStore.getState().loadAll();

/** The chapters the learner is part-way through reading, from any subject. */
export function ContinueLearningCard() {
  const navigate = useNavigate();
  const [state, reload] = useAsyncSection(loadReaderData);
  const progress = useReaderStore((s) => s.progress);
  const inProgress = Object.values(progress)
    .filter((p) => p.completionStatus === 'reading' && p.scrollPercent > 0 && p.scrollPercent < 95)
    .sort((a, b) => b.lastReadAt - a.lastReadAt)
    .slice(0, 3);

  return (
    <HomeCard title="Continue learning" icon={<BookOpen size={16} className="text-brand-500" aria-hidden />} testId="home-continue">
      {state.status === 'loading' && <CardSkeleton rows={2} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && inProgress.length === 0 && <CardEmpty text="No chapter in progress." actionLabel="Explore chapters" onAction={() => navigate('/chapters')} />}
      {state.status === 'ready' && inProgress.length > 0 && (
        <ul className="space-y-1">
          {inProgress.map((p) => {
            const { route, label } = resolveChapterLink(p.chapterId);
            return (
              <li key={p.chapterId}>
                <button type="button" onClick={() => navigate(route)} className="w-full min-h-11 flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[100px]" style={{ background: 'var(--border)' }}><div className="h-full rounded-full bg-brand-500" style={{ width: `${p.scrollPercent}%` }} /></div>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{p.scrollPercent}% • {formatDuration(p.timeSpentSeconds)}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}
