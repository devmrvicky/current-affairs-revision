import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useReaderStore } from '../../store/readerStore';
import { resolveChapterLink } from '../../services/chapterLinks';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { HomeCard, CardSkeleton, CardError, CardEmpty } from './HomeCard';

const loadReaderData = () => useReaderStore.getState().loadAll();

/** Favorite chapters from every subject in one place. The ★ that adds one lives on each chapter (every subject's chapter list and chapter page). */
export function FavoriteChaptersCard() {
  const navigate = useNavigate();
  const [state, reload] = useAsyncSection(loadReaderData);
  const progress = useReaderStore((s) => s.progress);
  const toggleFavorite = useReaderStore((s) => s.toggleFavorite);
  const favorites = Object.values(progress).filter((p) => p.isFavorite).sort((a, b) => b.lastReadAt - a.lastReadAt);

  return (
    <HomeCard title="Favorite chapters" icon={<Star size={16} className="text-amber-500" aria-hidden />} testId="home-favorites">
      {state.status === 'loading' && <CardSkeleton rows={2} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && favorites.length === 0 && (
        <CardEmpty text="No favorite chapters yet. Tap the ★ on any chapter, in any subject, to keep it here." actionLabel="Explore chapters" onAction={() => navigate('/chapters')} />
      )}
      {state.status === 'ready' && favorites.length > 0 && (
        <ul className="space-y-1">
          {favorites.map((p) => {
            const { route, label } = resolveChapterLink(p.chapterId);
            return (
              <li key={p.chapterId} className="flex items-center gap-1">
                <button type="button" onClick={() => navigate(route)} className="flex-1 min-w-0 min-h-11 text-left text-sm font-medium truncate px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>{label}</button>
                <button type="button" onClick={() => { void toggleFavorite(p.chapterId); }} aria-label={`Remove ${label} from favorites`} aria-pressed className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0">
                  <Star size={16} className="text-amber-500" fill="currentColor" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}
