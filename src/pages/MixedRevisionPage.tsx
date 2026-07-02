import { useState, useMemo, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, CheckSquare, Square, ArrowLeft, Shuffle, Bookmark, XCircle, Flag,
  TrendingDown, Calendar, ChevronDown, ChevronUp, type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { useChapterStore } from '../store/chapterStore';
import { getChapterList, getChapterTotalQuestions, loadMixedChapters } from '../services/chapterRepository';
import { loadQuizByFileName } from '../services/quizService';
import { useAvailableDates } from '../hooks/useAvailableDates';
import { shuffleArray } from '../utils';
import type { Question } from '../types';

const CHAPTER_EMOJIS: Record<string, string> = {
  'Government Schemes': '🏛️',
  'International Organizations': '🌐',
  'Sports': '🏆',
  'Awards': '🥇',
  'Science and Technology': '🔬',
  'Books and Authors': '📚',
  'Budget': '💰',
  'Economy': '📈',
};

const QUESTION_COUNT_OPTIONS = [10, 20, 30, 50, 100] as const;
type SourceKey = 'bookmarked' | 'wrong' | 'marked' | 'weak';
type CAMode = 'none' | 'month' | 'range';

/** Build a Question-shaped object from any of the review-list stores, each of
 * which embeds the full question text but uses a string `id` that conflicts
 * with Question.id (number) — so we deliberately don't widen-assign those
 * objects directly and instead pick out just the fields we need. */
function toQuestionStub(q: { question: string; options: string[]; correctAnswer: string; explanation: string }): Question {
  return { id: 0, question: q.question, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation };
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ─── Chapter selection card (unchanged) ────────────────────────────────────────

interface ChapterSelectCardProps {
  chapterName: string;
  testCount: number;
  questionCount: number;
  selected: boolean;
  onToggle: (chapterName: string) => void;
}

const ChapterSelectCard = memo(function ChapterSelectCard({
  chapterName, testCount, questionCount, selected, onToggle
}: ChapterSelectCardProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onToggle(chapterName)}
      aria-pressed={selected}
      className={`w-full p-4 rounded-2xl border-2 text-left transition-all duration-150 flex items-center gap-3 ${
        selected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
          : 'border-[var(--border)] hover:border-brand-300 dark:hover:border-brand-700'
      }`}
      style={{ background: selected ? undefined : 'var(--card)' }}
    >
      <div className="text-2xl">{CHAPTER_EMOJIS[chapterName] ?? '📖'}</div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${selected ? 'text-brand-700 dark:text-brand-300' : ''}`}
          style={!selected ? { color: 'var(--text-primary)' } : undefined}>
          {chapterName}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {testCount} test{testCount !== 1 ? 's' : ''} · {questionCount > 0 ? `${questionCount} questions` : 'Loading…'}
        </p>
      </div>
      <div className={`flex-shrink-0 ${selected ? 'text-brand-500' : ''}`}
        style={!selected ? { color: 'var(--text-muted)' } : undefined}>
        {selected ? <CheckSquare size={20} /> : <Square size={20} />}
      </div>
    </motion.button>
  );
});

// ─── Source toggle card (new) ───────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-500' },
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-500' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-500' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-500' },
};

interface SourceToggleCardProps {
  icon: LucideIcon;
  label: string;
  subLabel: string;
  disabled: boolean;
  active: boolean;
  color: keyof typeof SOURCE_COLORS;
  onToggle: () => void;
}

const SourceToggleCard = memo(function SourceToggleCard({
  icon: Icon, label, subLabel, disabled, active, color, onToggle,
}: SourceToggleCardProps) {
  const c = SOURCE_COLORS[color];
  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      className={`p-3.5 rounded-2xl border-2 text-left transition-all duration-150 flex items-center gap-3 ${
        active
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
          : 'border-[var(--border)] hover:border-brand-300 dark:hover:border-brand-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ background: active ? undefined : 'var(--card)' }}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>
        <Icon size={16} className={c.text} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${active ? 'text-brand-700 dark:text-brand-300' : ''}`}
          style={!active ? { color: 'var(--text-primary)' } : undefined}>
          {label}
        </p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {subLabel}
        </p>
      </div>
      <div className={`flex-shrink-0 ${active ? 'text-brand-500' : ''}`}
        style={!active ? { color: 'var(--text-muted)' } : undefined}>
        {active ? <CheckSquare size={18} /> : <Square size={18} />}
      </div>
    </motion.button>
  );
});

// ─── Question count pill ────────────────────────────────────────────────────────

function CountPill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
        selected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
          : 'hover:border-brand-300 dark:hover:border-brand-700'
      }`}
      style={!selected ? { borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-secondary)' } : undefined}
    >
      {label}
    </button>
  );
}

const dateInputStyle = {
  background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)',
} as const;
const dateInputClass = 'w-full px-3 py-2 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors';

export default function MixedRevisionPage() {
  const navigate = useNavigate();
  const { startSession } = useQuizStore();
  const allChapters = useMemo(() => getChapterList(), []);

  const { bookmarks, load: loadBookmarks } = useBookmarkStore();
  const { questions: wrongQuestions, getActive: getActiveWrong, load: loadWrong } = useWrongQuestionsStore();
  const { items: markedItems, load: loadMarked } = useMarkedReviewStore();
  const { load: loadChapterStats, getAggregateForChapter } = useChapterStore();
  const { dates: availableDates } = useAvailableDates();

  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<SourceKey>>(new Set());
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [count, setCount] = useState<number | 'all'>(20);
  const [isStarting, setIsStarting] = useState(false);

  const [showCAFilter, setShowCAFilter] = useState(false);
  const [caMode, setCaMode] = useState<CAMode>('none');
  const [caMonth, setCaMonth] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [caQuestionCount, setCaQuestionCount] = useState(0);

  // Load review-list stores + chapter stats once on mount
  useEffect(() => {
    loadBookmarks();
    loadWrong();
    loadMarked();
    loadChapterStats();
  }, [loadBookmarks, loadWrong, loadMarked, loadChapterStats]);

  // Lazily count questions per chapter (used for manual selection + weak-topics sizing)
  useEffect(() => {
    allChapters.forEach(async (chapter) => {
      const c = await getChapterTotalQuestions(chapter.chapterName);
      setQuestionCounts((prev) => ({ ...prev, [chapter.chapterName]: c }));
    });
  }, [allChapters]);

  const activeWrong = useMemo(() => getActiveWrong(), [wrongQuestions, getActiveWrong]);

  // Weak topics: chapters with a meaningful attempt history and sub-60% accuracy
  const weakChapters = useMemo(() => {
    return allChapters
      .map((c) => {
        const agg = getAggregateForChapter(c.chapterName);
        if (!agg || agg.totalQuestions < 5) return null;
        return agg.totalCorrect / agg.totalQuestions < 0.6 ? c.chapterName : null;
      })
      .filter((n): n is string => n !== null);
  }, [allChapters, getAggregateForChapter]);

  const availableMonths = useMemo(() => {
    const set = new Set(availableDates.map((d) => d.dateKey.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [availableDates]);

  const dateBounds = useMemo(() => {
    if (availableDates.length === 0) return undefined;
    const keys = availableDates.map((d) => d.dateKey).sort();
    return { min: keys[0], max: keys[keys.length - 1] };
  }, [availableDates]);

  const caFileNames = useMemo(() => {
    if (caMode === 'month' && caMonth) {
      return availableDates.filter((d) => d.dateKey.startsWith(caMonth)).map((d) => d.fileName);
    }
    if (caMode === 'range' && rangeStart && rangeEnd) {
      return availableDates.filter((d) => d.dateKey >= rangeStart && d.dateKey <= rangeEnd).map((d) => d.fileName);
    }
    return [];
  }, [caMode, caMonth, rangeStart, rangeEnd, availableDates]);

  // Count questions across the matched current-affairs files (separate effect since it requires loading each file)
  useEffect(() => {
    if (caFileNames.length === 0) { setCaQuestionCount(0); return; }
    let cancelled = false;
    (async () => {
      const quizzes = await Promise.all(caFileNames.map(loadQuizByFileName));
      if (cancelled) return;
      setCaQuestionCount(quizzes.reduce((sum, q) => sum + (q?.questions.length ?? 0), 0));
    })();
    return () => { cancelled = true; };
  }, [caFileNames]);

  function toggleChapter(chapterName: string) {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterName)) next.delete(chapterName);
      else next.add(chapterName);
      return next;
    });
  }

  function toggleSource(key: SourceKey) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setCaModeAndReset(mode: CAMode) {
    setCaMode(mode);
    setCaMonth('');
    setRangeStart('');
    setRangeEnd('');
  }

  function selectAllChapters() {
    setSelectedChapters(new Set(allChapters.map((c) => c.chapterName)));
  }
  function clearAllChapters() {
    setSelectedChapters(new Set());
  }

  // Rough estimate shown to the user before sources are loaded/deduped — actual
  // pool may be smaller after dedupe, so this is intentionally labeled "~".
  const estimatedPool = useMemo(() => {
    let total = 0;
    selectedChapters.forEach((name) => { total += questionCounts[name] ?? 0; });
    if (selectedSources.has('bookmarked')) total += bookmarks.length;
    if (selectedSources.has('wrong')) total += activeWrong.length;
    if (selectedSources.has('marked')) total += markedItems.length;
    if (selectedSources.has('weak')) {
      total += weakChapters.reduce((sum, name) => sum + (questionCounts[name] ?? 0), 0);
    }
    total += caQuestionCount;
    return total;
  }, [selectedChapters, questionCounts, selectedSources, bookmarks.length, activeWrong.length, markedItems.length, weakChapters, caQuestionCount]);

  const hasAnySource = selectedChapters.size > 0 || selectedSources.size > 0 || caFileNames.length > 0;
  const finalCount = count === 'all' ? estimatedPool : Math.min(count, estimatedPool);

  async function handleStart() {
    if (!hasAnySource) {
      toast.error('Select at least one source to revise');
      return;
    }
    setIsStarting(true);
    try {
      const pool: Question[] = [];

      if (selectedChapters.size > 0) {
        const quiz = await loadMixedChapters([...selectedChapters]);
        if (quiz) pool.push(...quiz.questions);
      }
      if (selectedSources.has('weak') && weakChapters.length > 0) {
        const quiz = await loadMixedChapters(weakChapters);
        if (quiz) pool.push(...quiz.questions);
      }
      if (selectedSources.has('bookmarked')) {
        pool.push(...bookmarks.map(toQuestionStub));
      }
      if (selectedSources.has('wrong')) {
        pool.push(...activeWrong.map(toQuestionStub));
      }
      if (selectedSources.has('marked')) {
        pool.push(...markedItems.map(toQuestionStub));
      }
      if (caFileNames.length > 0) {
        const quizzes = await Promise.all(caFileNames.map(loadQuizByFileName));
        quizzes.forEach((q) => { if (q) pool.push(...q.questions); });
      }

      if (pool.length === 0) {
        toast.error('No questions found for the selected filters');
        return;
      }

      // A question can legitimately appear in more than one source (e.g. both
      // bookmarked and wrong) — dedupe by question text before sampling.
      const seen = new Set<string>();
      const deduped = pool.filter((q) => {
        const key = q.question.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Always shuffle question order — never sequential.
      let ordered = shuffleArray(deduped);
      if (count !== 'all') ordered = ordered.slice(0, count);

      // Note: option order no longer needs shuffling here — startSession()
      // now does that centrally for every quiz type, so every question
      // still just needs a stable numeric id reassigned for this session.
      const finalQuestions: Question[] = ordered.map((q, i) => ({
        ...q,
        id: i + 1,
      }));

      startSession({ date: 'Mixed Revision', questions: finalQuestions }, `mixed_${Date.now()}.json`);
      navigate('/quiz');
    } catch (err) {
      console.error('[MixedRevision] Failed to build quiz:', err);
      toast.error('Failed to create mixed quiz');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/chapter-wise-current-affairs')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Layers size={20} className="text-purple-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Mixed Revision
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Combine any sources into one shuffled quiz
          </p>
        </div>
      </div>

      {/* Source toggles */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Revise From
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <SourceToggleCard
            icon={Bookmark}
            label="Bookmarked"
            subLabel={`${bookmarks.length} question${bookmarks.length !== 1 ? 's' : ''}`}
            disabled={bookmarks.length === 0}
            active={selectedSources.has('bookmarked')}
            color="amber"
            onToggle={() => toggleSource('bookmarked')}
          />
          <SourceToggleCard
            icon={XCircle}
            label="Wrong Questions"
            subLabel={`${activeWrong.length} question${activeWrong.length !== 1 ? 's' : ''}`}
            disabled={activeWrong.length === 0}
            active={selectedSources.has('wrong')}
            color="red"
            onToggle={() => toggleSource('wrong')}
          />
          <SourceToggleCard
            icon={Flag}
            label="Marked for Review"
            subLabel={`${markedItems.length} question${markedItems.length !== 1 ? 's' : ''}`}
            disabled={markedItems.length === 0}
            active={selectedSources.has('marked')}
            color="blue"
            onToggle={() => toggleSource('marked')}
          />
          <SourceToggleCard
            icon={TrendingDown}
            label="Weak Topics"
            subLabel={weakChapters.length > 0 ? `${weakChapters.length} chapter${weakChapters.length !== 1 ? 's' : ''} <60%` : 'None yet'}
            disabled={weakChapters.length === 0}
            active={selectedSources.has('weak')}
            color="purple"
            onToggle={() => toggleSource('weak')}
          />
        </div>
      </section>

      {/* Current Affairs date filter */}
      <section className="card p-4">
        <button
          onClick={() => setShowCAFilter((v) => !v)}
          className="w-full flex items-center justify-between"
          aria-expanded={showCAFilter}
        >
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-brand-500" />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Current Affairs</span>
            {caMode !== 'none' && caQuestionCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
                {caQuestionCount} q
              </span>
            )}
          </div>
          {showCAFilter ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </button>
        <AnimatePresence initial={false}>
          {showCAFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-3">
                <div className="flex gap-2">
                  {(['none', 'month', 'range'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setCaModeAndReset(m)}
                      aria-pressed={caMode === m}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        caMode === m
                          ? 'bg-brand-500 text-white'
                          : 'hover:bg-gray-100 dark:hover:bg-white/10'
                      }`}
                      style={caMode !== m ? { color: 'var(--text-secondary)', background: 'var(--border)' } : undefined}
                    >
                      {m === 'none' ? 'Off' : m === 'month' ? 'By Month' : 'Date Range'}
                    </button>
                  ))}
                </div>

                {caMode === 'month' && (
                  availableMonths.length > 0 ? (
                    <select
                      value={caMonth}
                      onChange={(e) => setCaMonth(e.target.value)}
                      className={dateInputClass}
                      style={dateInputStyle}
                    >
                      <option value="">Select a month…</option>
                      {availableMonths.map((ym) => (
                        <option key={ym} value={ym}>{monthLabel(ym)}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No current affairs data available yet.</p>
                  )
                )}

                {caMode === 'range' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={rangeStart}
                      min={dateBounds?.min}
                      max={rangeEnd || dateBounds?.max}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className={dateInputClass}
                      style={dateInputStyle}
                    />
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>to</span>
                    <input
                      type="date"
                      value={rangeEnd}
                      min={rangeStart || dateBounds?.min}
                      max={dateBounds?.max}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className={dateInputClass}
                      style={dateInputStyle}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Chapter selection */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Chapters · {selectedChapters.size} of {allChapters.length} selected
          </h2>
          <div className="flex gap-2">
            <button onClick={selectAllChapters} className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20">
              All
            </button>
            <button onClick={clearAllChapters} className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-gray-100 dark:hover:bg-white/10" style={{ color: 'var(--text-secondary)' }}>
              Clear
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {allChapters.map((chapter) => (
            <ChapterSelectCard
              key={chapter.chapterName}
              chapterName={chapter.chapterName}
              testCount={chapter.tests.length}
              questionCount={questionCounts[chapter.chapterName] ?? 0}
              selected={selectedChapters.has(chapter.chapterName)}
              onToggle={toggleChapter}
            />
          ))}
        </div>
      </section>

      {/* Question count selector */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          How many questions?
        </h2>
        <div className="flex gap-2 flex-wrap">
          {QUESTION_COUNT_OPTIONS.map((n) => (
            <CountPill key={n} label={String(n)} selected={count === n} onClick={() => setCount(n)} />
          ))}
          <CountPill label="All" selected={count === 'all'} onClick={() => setCount('all')} />
        </div>
      </section>

      {/* Start button — sticky */}
      <div className="sticky bottom-20 md:bottom-4">
        <motion.button
          whileHover={hasAnySource ? { scale: 1.01 } : {}}
          whileTap={hasAnySource ? { scale: 0.98 } : {}}
          onClick={handleStart}
          disabled={!hasAnySource || isStarting}
          className="w-full btn-primary flex items-center justify-center gap-3 py-4 text-base"
        >
          {isStarting ? (
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Shuffle size={18} />
              {!hasAnySource
                ? 'Select sources to start'
                : `Start Mixed Quiz (~${finalCount} questions)`
              }
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
