import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Star, Clock, ChevronRight } from 'lucide-react';
import { useReaderStore } from '../../store/readerStore';
import { formatDuration } from '../../utils';

export function ContinueReadingWidget() {
  const navigate = useNavigate();
  const { getContinueReading, getFavorites, progress } = useReaderStore();

  const continueReading = getContinueReading().slice(0, 3);
  const favoriteIds = getFavorites();

  if (continueReading.length === 0 && favoriteIds.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {continueReading.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-brand-500" />
            <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Continue Reading
            </h3>
          </div>
          <div className="space-y-2">
            {continueReading.map((p) => (
              <button
                key={p.chapterId}
                onClick={() => navigate(`/chapter/${encodeURIComponent(p.chapterId)}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={16} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {p.chapterId}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[100px]" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.scrollPercent}%` }} />
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {p.scrollPercent}% • {formatDuration(p.timeSpentSeconds)}
                    </span>
                  </div>
                </div>
                <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {favoriteIds.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star size={16} className="text-amber-500" />
            <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Favorite Chapters
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {favoriteIds.map((id) => (
              <button
                key={id}
                onClick={() => navigate(`/chapter/${encodeURIComponent(id)}`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              >
                <Star size={12} fill="currentColor" />
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
