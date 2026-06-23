import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Search, ChevronRight,
  Target, BarChart2, Layers, Star, Highlighter, ListChecks
} from 'lucide-react';
import { useChapterStore, type ChapterAggregate } from '../store/chapterStore';
import { useReaderStore } from '../store/readerStore';
import { getChapterList, getChapterTotalQuestions, type ChapterInfo } from '../services/chapterRepository';
import { EmptyState } from '../components/common/EmptyState';
import { getBadge, getBadgeColors } from '../utils';
import type { ReadingProgress } from '../types';

type SortKey = 'name' | 'questions' | 'attempts' | 'recent';

interface ChapterCardProps {
  chapter: ChapterInfo;
  questionCount: number;
  aggregate?: ChapterAggregate;
  readingProgress?: ReadingProgress;
  onOpen: (chapterName: string) => void;
  onToggleFavorite: (chapterName: string) => void;
  delay: number;
}

const ChapterCard = memo(function ChapterCard({
  chapter, questionCount, aggregate, readingProgress, onOpen, onToggleFavorite, delay
}: ChapterCardProps) {
  const { chapterName, tests, mdRelPath } = chapter;
  const badge = aggregate ? getBadge(aggregate.bestScore) : null;
  const badgeColors = badge ? getBadgeColors(badge) : null;

  // Pick an emoji per chapter
  const emoji: Record<string, string> = {
    'Government Schemes': '🏛️',
    'International Organizations': '🌐',
    'Sports': '🏆',
    'Awards': '🥇',
    'Science and Technology': '🔬',
    'Books and Authors': '📚',
    'Budget': '💰',
    'Economy': '📈',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.28 }}
      className="card p-5 hover:shadow-lg transition-all duration-200 group cursor-pointer relative"
      onClick={() => onOpen(chapterName)}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(chapterName); }}
        className={`absolute top-3 right-3 p-1.5 rounded-lg transition-colors z-10 ${
          readingProgress?.isFavorite ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'
        }`}
      >
        <Star size={16} fill={readingProgress?.isFavorite ? 'currentColor' : 'none'} />
      </button>

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'var(--border)' }}>
          {emoji[chapterName] ?? '📖'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 pr-6">
            <h3 className="font-display font-bold text-base leading-snug" style={{ color: 'var(--text-primary)' }}>
              {chapterName}
            </h3>
            {badgeColors && badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}>
                {aggregate!.bestScore}%
              </span>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-brand-500">
              <ListChecks size={11} /> {tests.length} Test{tests.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Target size={11} /> {questionCount > 0 ? `${questionCount} questions` : 'Loading…'}
            </span>
            {mdRelPath && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <BookOpen size={11} /> Revision available
              </span>
            )}
            {aggregate && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <BarChart2 size={11} /> {aggregate.totalAttempts} attempt{aggregate.totalAttempts !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Reading progress bar */}
          {readingProgress && readingProgress.scrollPercent > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Reading Progress</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{readingProgress.scrollPercent}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${readingProgress.scrollPercent}%`,
                    background: readingProgress.completionStatus === 'completed' ? '#22c55e' : '#6366f1',
                  }}
                />
              </div>
            </div>
          )}

          {/* Best score progress bar (only if no reading progress to avoid clutter) */}
          {aggregate && (!readingProgress || readingProgress.scrollPercent === 0) && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Best Score · {aggregate.testsAttempted}/{tests.length} tests attempted</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{aggregate.bestScore}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${aggregate.bestScore}%`,
                    background: aggregate.bestScore >= 75 ? '#22c55e' : aggregate.bestScore >= 50 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <ChevronRight
          size={18}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-1"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
    </motion.div>
  );
});

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChapterWisePage() {
  const navigate = useNavigate();
  const { stats: chapterStats, load: loadChapterStats, getAggregateForChapter } = useChapterStore();
  const { progress, loadAll: loadReaderData, toggleFavorite } = useReaderStore();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');

  // Chapter list from glob — no async, it's synchronous
  const allChapters = useMemo(() => getChapterList(), []);

  // Total question counts (summed across every test in a chapter) — loaded lazily, only
  // when this page is opened, not at app startup.
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadChapterStats();
    loadReaderData();
    allChapters.forEach(async (chapter) => {
      const count = await getChapterTotalQuestions(chapter.chapterName);
      setQuestionCounts((prev) => ({ ...prev, [chapter.chapterName]: count }));
    });
  }, [allChapters]);

  const aggregateMap = useMemo(() => {
    const m: Record<string, ChapterAggregate> = {};
    allChapters.forEach((c) => {
      const agg = getAggregateForChapter(c.chapterName);
      if (agg) m[c.chapterName] = agg;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChapters, chapterStats]);

  const filtered = useMemo(() => {
    let result = [...allChapters];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.chapterName.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.chapterName.localeCompare(b.chapterName);
        case 'questions':
          return (questionCounts[b.chapterName] ?? 0) - (questionCounts[a.chapterName] ?? 0);
        case 'attempts':
          return (aggregateMap[b.chapterName]?.totalAttempts ?? 0) - (aggregateMap[a.chapterName]?.totalAttempts ?? 0);
        case 'recent':
          return (aggregateMap[b.chapterName]?.lastAttemptAt ?? 0) - (aggregateMap[a.chapterName]?.lastAttemptAt ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [allChapters, search, sortBy, questionCounts, aggregateMap]);

  const handleOpen = useCallback((chapterName: string) => {
    navigate(`/chapter/${encodeURIComponent(chapterName)}`);
  }, [navigate]);

  const handleToggleFavorite = useCallback((chapterName: string) => {
    toggleFavorite(chapterName);
  }, [toggleFavorite]);

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Chapter Name' },
    { value: 'questions', label: 'Most Questions' },
    { value: 'attempts', label: 'Most Attempted' },
    { value: 'recent', label: 'Recently Attempted' },
  ];

  const attemptedCount = allChapters.filter((c) => aggregateMap[c.chapterName]).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <BookOpen size={20} className="text-brand-500" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
              Chapter Wise
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {allChapters.length} chapters • {attemptedCount} attempted
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {/* My Highlights Button */}
          <button
            onClick={() => navigate('/my-highlights')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border-2 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            title="My Highlights"
          >
            <Highlighter size={15} />
          </button>
          {/* Mixed Revision Button */}
          <button
            onClick={() => navigate('/mixed-revision')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
          >
            <Layers size={15} />
            <span className="hidden sm:inline">Mixed Quiz</span>
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search chapters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="px-3 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors cursor-pointer"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Chapter Grid */}
      {allChapters.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} style={{ color: 'var(--text-muted)' }} />}
          title="No chapters found"
          description="Add a folder with JSON test files (and an optional .md) under src/data/chapters/ to see it here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={28} style={{ color: 'var(--text-muted)' }} />}
          title="No chapters match"
          description={`No chapter found for "${search}"`}
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((chapter, i) => (
              <ChapterCard
                key={chapter.chapterName}
                chapter={chapter}
                questionCount={questionCounts[chapter.chapterName] ?? 0}
                aggregate={aggregateMap[chapter.chapterName]}
                readingProgress={progress[chapter.chapterName]}
                onOpen={handleOpen}
                onToggleFavorite={handleToggleFavorite}
                delay={i * 0.04}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
