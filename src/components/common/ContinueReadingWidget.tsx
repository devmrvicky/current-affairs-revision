import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Star, ChevronRight, ChevronDown } from 'lucide-react';
import { useReaderStore } from '../../store/readerStore';
import { formatDuration, lsGet, lsSet } from '../../utils';
import { subjectRegistry, getTopicDisplayName } from '../../data/registry/subjectRegistry';

const COLLAPSE_KEY = 'continue-reading-collapsed';

/**
 * readerStore keys everything by a flat `chapterId` string. Native subject
 * chapters use the composite key `syllabus::{subjectId}::{chapterId}`
 * (syllabusRepository.syllabusReaderKey) so they can never collide with a
 * legacy Current Affairs chapter, whose id is just its bare chapter name in
 * the same namespace. This resolves either shape to a route + display label
 * without readerStore itself needing to know the difference.
 */
function resolveChapterLink(chapterId: string): { route: string; label: string } {
  if (chapterId.startsWith('syllabus::')) {
    const [, subjectId, subChapterId] = chapterId.split('::');
    const subjectName = subjectRegistry.getSubject(subjectId)?.name ?? subjectId;
    const chapterName = getTopicDisplayName(subjectId, subChapterId);
    return { route: `/chapters/${subjectId}/${subChapterId}`, label: `${chapterName} · ${subjectName}` };
  }
  return { route: `/chapter/${encodeURIComponent(chapterId)}`, label: chapterId };
}

export function ContinueReadingWidget() {
  const navigate = useNavigate();
  const { getContinueReading, getFavorites, progress } = useReaderStore();
  const [collapsed, setCollapsed] = useState(() => lsGet(COLLAPSE_KEY, false));

  const continueReading = getContinueReading().slice(0, 3);
  const favoriteIds = getFavorites();

  if (continueReading.length === 0 && favoriteIds.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={16} className="text-brand-500" />
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Continue Learning</h3>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>No active chapter yet.</p>
        <button onClick={() => navigate('/chapters')} className="text-xs font-medium text-brand-500 hover:text-brand-600">
          Explore Chapters →
        </button>
      </motion.div>
    );
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      lsSet(COLLAPSE_KEY, next);
      return next;
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {continueReading.length > 0 && (
        <div className="card p-5">
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center justify-between gap-2 mb-0 -m-0"
            aria-expanded={!collapsed}
          >
            <div className={`flex items-center gap-2 ${collapsed ? '' : 'mb-3'}`}>
              <BookOpen size={16} className="text-brand-500" />
              <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Continue Learning
              </h3>
            </div>
            <ChevronDown
              size={16}
              className="transition-transform"
              style={{ color: 'var(--text-muted)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            />
          </button>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-2">
                  {continueReading.map((p) => {
                    const { route, label } = resolveChapterLink(p.chapterId);
                    return (
                      <button
                        key={p.chapterId}
                        onClick={() => navigate(route)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                          <BookOpen size={16} className="text-brand-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {label}
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
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
            {favoriteIds.map((id) => {
              const { route, label } = resolveChapterLink(id);
              return (
                <button
                  key={id}
                  onClick={() => navigate(route)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <Star size={12} fill="currentColor" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
