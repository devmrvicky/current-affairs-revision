import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Search, SlidersHorizontal, ChevronRight,
  Trophy, Clock, Target, BarChart2, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useChapterStore } from '../store/chapterStore';
import { getChapterList, loadChapterByFileName } from '../services/chapterRepository';
import { EmptyState } from '../components/common/EmptyState';
import { getBadge, getBadgeColors, formatRelativeDate } from '../utils';
import type { ChapterStats } from '../types';

type SortKey = 'name' | 'questions' | 'attempts' | 'recent';

interface ChapterCardProps {
  chapterName: string;
  fileName: string;
  questionCount: number;
  stats?: ChapterStats;
  onStart: (fileName: string, chapterName: string) => void;
  delay: number;
}

const ChapterCard = memo(function ChapterCard({
  chapterName, fileName, questionCount, stats, onStart, delay
}: ChapterCardProps) {
  const badge = stats ? getBadge(stats.bestScore) : null;
  const badgeColors = badge ? getBadgeColors(badge) : null;

  // Pick an emoji per chapter
  const emoji: Record<string, string> = {
    'Government Schemes': '🏛️',
    'International Organizations': '🌐',
    'Sports': '🏆',
    'Awards': '🥇',
    'Science and Technology': '🔬',
    'Books and Authors': '📚',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.28 }}
      className="card p-5 hover:shadow-lg transition-all duration-200 group cursor-pointer"
      onClick={() => onStart(fileName, chapterName)}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'var(--border)' }}>
          {emoji[chapterName] ?? '📖'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-bold text-base leading-snug" style={{ color: 'var(--text-primary)' }}>
              {chapterName}
            </h3>
            {badgeColors && badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}>
                {stats!.bestScore}%
              </span>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Target size={11} /> {questionCount} questions
            </span>
            {stats && (
              <>
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <BarChart2 size={11} /> {stats.totalAttempts} attempt{stats.totalAttempts !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={11} /> {formatRelativeDate(stats.lastAttemptAt)}
                </span>
              </>
            )}
          </div>

          {/* Best score progress bar */}
          {stats && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Best Score</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{stats.bestScore}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${stats.bestScore}%`,
                    background: stats.bestScore >= 75 ? '#22c55e' : stats.bestScore >= 50 ? '#f59e0b' : '#ef4444',
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
  const { startSession } = useQuizStore();
  const { stats: chapterStats, load: loadChapterStats } = useChapterStore();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [isStarting, setIsStarting] = useState<string | null>(null);

  // Chapter list from glob — no async, it's synchronous
  const allChapters = useMemo(() => getChapterList(), []);

  // We need question counts — load them lazily
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadChapterStats();
    // Load all chapters to get question counts (lazy, cached in chapterRepository)
    allChapters.forEach(async ({ fileName, chapterName }) => {
      const quiz = await loadChapterByFileName(fileName);
      if (quiz) {
        setQuestionCounts((prev) => ({ ...prev, [fileName]: quiz.questions.length }));
      }
    });
  }, [allChapters]);

  const statsMap = useMemo(() => {
    const m: Record<string, ChapterStats> = {};
    chapterStats.forEach((s) => { m[s.fileName] = s; });
    return m;
  }, [chapterStats]);

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
          return (questionCounts[b.fileName] ?? 0) - (questionCounts[a.fileName] ?? 0);
        case 'attempts':
          return (statsMap[b.fileName]?.totalAttempts ?? 0) - (statsMap[a.fileName]?.totalAttempts ?? 0);
        case 'recent':
          return (statsMap[b.fileName]?.lastAttemptAt ?? 0) - (statsMap[a.fileName]?.lastAttemptAt ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [allChapters, search, sortBy, questionCounts, statsMap]);

  const handleStart = useCallback(async (fileName: string, chapterName: string) => {
    setIsStarting(fileName);
    try {
      const quiz = await loadChapterByFileName(fileName);
      if (!quiz) {
        toast.error(`Could not load "${chapterName}" — file may be missing or corrupted.`);
        return;
      }
      startSession(quiz, fileName);
      navigate('/quiz');
    } catch {
      toast.error('Failed to start chapter quiz');
    } finally {
      setIsStarting(null);
    }
  }, [startSession, navigate]);

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Chapter Name' },
    { value: 'questions', label: 'Most Questions' },
    { value: 'attempts', label: 'Most Attempted' },
    { value: 'recent', label: 'Recently Attempted' },
  ];

  const attemptedCount = allChapters.filter((c) => statsMap[c.fileName]).length;

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

        {/* Mixed Revision Button */}
        <button
          onClick={() => navigate('/mixed-revision')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors flex-shrink-0"
        >
          <Layers size={15} />
          <span className="hidden sm:inline">Mixed Quiz</span>
        </button>
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
          description="Add JSON files to src/data/chapters/ to see them here."
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
                key={chapter.fileName}
                fileName={chapter.fileName}
                chapterName={chapter.chapterName}
                questionCount={questionCounts[chapter.fileName] ?? 0}
                stats={statsMap[chapter.fileName]}
                onStart={handleStart}
                delay={i * 0.04}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Starting overlay */}
      {isStarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="card px-8 py-6 flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Loading chapter…</p>
          </div>
        </div>
      )}
    </div>
  );
}
