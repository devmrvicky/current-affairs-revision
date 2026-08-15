import { useEffect, useState, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark, XCircle, Flag, Trash2, ArrowLeft, CheckCircle2,
  Sparkles, ListChecks, History as HistoryIcon, TrendingDown, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useMarkedReviewStore } from '../store/markedReviewStore';
import { useHistoryStore } from '../store/historyStore';
import { useChapterStore } from '../store/chapterStore';
import { useExamStore } from '../store/examStore';
import { useQuizStore } from '../store/quizStore';
import { examRegistry } from '../data/registry/examRegistry';
import { resolveTopicId, getUnattemptedQuestions, getRandomQuestions, resolveQuestionsByIds } from '../services/questionRepository';
import { getTopicPerformance, getRecentAttemptRecords } from '../services/attemptLedgerService';
import { toLegacyQuestion } from '../services/legacyQuestionAdapter';
import { subjectRegistry, getTopicDisplayName } from '../data/registry/subjectRegistry';
import { EmptyState } from '../components/common/EmptyState';
import { formatRelativeDate } from '../utils';
import type { DailyQuiz } from '../types';

type ReviewTab = 'bookmarked' | 'wrong' | 'marked' | 'recent' | 'weak' | 'unattempted';

interface CommonItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sourceLabel: string;
  timestamp: number;
  meta?: string;
}

interface ReviewItemCardProps {
  item: CommonItem;
  accentClass: string;
  onRemove?: (id: string) => void;
  delay: number;
}

const ReviewItemCard = memo(function ReviewItemCard({ item, accentClass, onRemove, delay }: ReviewItemCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`card p-4 border-l-4 ${accentClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button className="flex-1 text-left min-w-0" onClick={() => setExpanded((e) => !e)}>
          <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {item.question}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{item.sourceLabel}</span>
            <span>·</span>
            <span>{formatRelativeDate(item.timestamp)}</span>
            {item.meta && (
              <>
                <span>·</span>
                <span>{item.meta}</span>
              </>
            )}
          </div>
        </button>
        {onRemove && (
          <button
            onClick={() => onRemove(item.id)}
            className="p-2 rounded-xl text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors flex-shrink-0"
            title="Remove"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {item.options.map((opt) => {
                const isCorrect = opt === item.correctAnswer;
                return (
                  <div
                    key={opt}
                    className={`px-3 py-2 rounded-lg text-sm border ${
                      isCorrect
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'border-transparent'
                    }`}
                    style={!isCorrect ? { color: 'var(--text-secondary)' } : undefined}
                  >
                    {isCorrect && '✓ '}{opt}
                  </div>
                );
              })}
            </div>
            {item.explanation && (
              <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Explanation: </strong>{item.explanation}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Weak Topics ──────────────────────────────────────────────────────────────
// Thresholds mirror master prompt §32/§85; adjust here only, nowhere else.
const WEAK_THRESHOLD = 60;
const STRONG_THRESHOLD = 80;

interface TopicDisplayRow {
  topicId: string;
  topicName: string;
  accuracy: number;
  status: 'Weak' | 'Average' | 'Strong';
  attempted: number;
}

function statusFor(accuracy: number): TopicDisplayRow['status'] {
  return accuracy < WEAK_THRESHOLD ? 'Weak' : accuracy < STRONG_THRESHOLD ? 'Average' : 'Strong';
}

const TopicRow = memo(function TopicRow({ topic, delay }: { topic: TopicDisplayRow; delay: number }) {
  const statusColor = topic.status === 'Weak' ? '#ef4444' : topic.status === 'Average' ? '#f59e0b' : '#22c55e';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{topic.topicName}</p>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${statusColor}20`, color: statusColor }}>
          {topic.status}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${topic.accuracy}%`, background: statusColor }} />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{topic.accuracy}% accuracy · {topic.attempted} attempted</p>
    </motion.div>
  );
});

const PAGE_SIZE = 20;

export default function ReviewCenterPage() {
  const navigate = useNavigate();
  const { bookmarks, isLoading: loadingBookmarks, load: loadBookmarks, remove: removeBookmark } = useBookmarkStore();
  const { questions: wrongQuestions, isLoading: loadingWrong, load: loadWrong, dismiss: dismissWrong } = useWrongQuestionsStore();
  const { items: markedItems, isLoading: loadingMarked, load: loadMarked, remove: removeMarked } = useMarkedReviewStore();
  const { tests, isLoading: loadingHistory, load: loadHistory } = useHistoryStore();
  const { stats: chapterStats, isLoading: loadingChapters, load: loadChapters } = useChapterStore();
  const { selectedExamId } = useExamStore();
  const { startSession } = useQuizStore();
  const exam = examRegistry.getExam(selectedExamId);

  const [unattemptedCount, setUnattemptedCount] = useState<number | null>(null);
  const [loadingUnattempted, setLoadingUnattempted] = useState(false);
  const [isStartingUnattempted, setIsStartingUnattempted] = useState(false);

  const [tab, setTab] = useState<ReviewTab>('bookmarked');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    loadBookmarks();
    loadWrong();
    loadMarked();
    loadHistory();
    loadChapters();
  }, []);

  const isLoading = loadingBookmarks || loadingWrong || loadingMarked;

  const bookmarkedItems: CommonItem[] = useMemo(() => bookmarks.map((b) => ({
    id: b.id, question: b.question, options: b.options, correctAnswer: b.correctAnswer,
    explanation: b.explanation, sourceLabel: b.sourceDate, timestamp: b.bookmarkedAt,
  })), [bookmarks]);

  const wrongItems: CommonItem[] = useMemo(() => wrongQuestions.map((w) => ({
    id: w.id, question: w.question, options: w.options, correctAnswer: w.correctAnswer,
    explanation: w.explanation, sourceLabel: w.displayDate, timestamp: w.lastAttemptAt,
    meta: w.status === 'mastered' ? 'Mastered ✓' : `Wrong ${w.wrongCount}×`,
  })), [wrongQuestions]);

  const markedReviewItems: CommonItem[] = useMemo(() => markedItems.map((m) => ({
    id: m.id, question: m.question, options: m.options, correctAnswer: m.correctAnswer,
    explanation: m.explanation, sourceLabel: m.sourceDate, timestamp: m.markedAt,
  })), [markedItems]);

  const [recentItems, setRecentItems] = useState<CommonItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [weakTopics, setWeakTopics] = useState<TopicDisplayRow[]>([]);
  const [loadingWeak, setLoadingWeak] = useState(false);

  // Recently Attempted — the universal attempt ledger is the canonical,
  // cross-subject source (works for Maths/Reasoning/English the instant they
  // have attempts, no Current-Affairs-specific code). historyStore is kept
  // ONLY as a compatibility bridge for sessions the ledger doesn't cover yet
  // (Monthly Magazine, Mixed Revision) — and explicitly skipped for any
  // fileName the ledger already has, so a mock test that writes to both
  // never appears twice (master prompt §28: no duplicate recording surfaced
  // to the user, even if two systems both hold a copy internally).
  useEffect(() => {
    if (tab !== 'recent') return;
    let cancelled = false;
    setLoadingRecent(true);
    (async () => {
      const ledgerRecords = await getRecentAttemptRecords(80);
      const ids = ledgerRecords.map((r) => r.universalQuestionId).filter((id): id is string => Boolean(id));
      const resolved = await resolveQuestionsByIds(ids);
      const byId = new Map(resolved.map((q) => [q.id, q]));

      const ledgerItems: CommonItem[] = ledgerRecords
        .filter((r) => r.universalQuestionId && byId.has(r.universalQuestionId))
        .map((r) => {
          const q = byId.get(r.universalQuestionId!)!;
          const subject = subjectRegistry.getSubject(r.subjectId);
          const topic = r.topicId ? subjectRegistry.getTopicsForSubject(r.subjectId).find((t) => t.id === r.topicId) : undefined;
          return {
            id: `ledger-${r.id}`,
            question: q.question,
            options: q.options.map((o) => o.text),
            correctAnswer: q.options.find((o) => o.id === q.correctAnswer)?.text ?? '',
            explanation: q.explanation ?? '',
            sourceLabel: [subject?.name ?? r.subjectId, topic?.name].filter(Boolean).join(' · '),
            timestamp: r.attemptedAt,
            meta: !r.wasAnswered ? 'Skipped' : r.isCorrect ? 'Correct' : 'Wrong',
          };
        });

      const ledgerFileNames = new Set(ledgerRecords.map((r) => r.sourceFileName));
      const historyItems: CommonItem[] = [...tests]
        .filter((test) => !ledgerFileNames.has(test.fileName))
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, 15)
        .flatMap((test) =>
          test.questions.map((q, idx) => ({
            id: `${test.id}-${idx}`,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            sourceLabel: test.displayDate,
            timestamp: test.savedAt,
            meta: q.status === 'correct' ? 'Correct' : q.status === 'wrong' ? 'Wrong' : 'Skipped',
          }))
        );

      const merged = [...ledgerItems, ...historyItems].sort((a, b) => b.timestamp - a.timestamp).slice(0, 60);
      if (!cancelled) setRecentItems(merged);
    })().finally(() => { if (!cancelled) setLoadingRecent(false); });
    return () => { cancelled = true; };
  }, [tab, tests]);

  // Weak Topics — ledger-derived performance works for ANY subject/topic the
  // moment attempts exist for it (no `if (subjectId === 'current-affairs')`
  // anywhere here). chapterStore is a fallback ONLY for chapter-topics that
  // have zero ledger data — i.e. attempts recorded before the ledger existed
  // — so historical signal isn't lost, but the ledger is authoritative
  // wherever both have data.
  useEffect(() => {
    if (tab !== 'weak') return;
    let cancelled = false;
    setLoadingWeak(true);
    (async () => {
      const ledgerTopics = await getTopicPerformance();
      const rows: TopicDisplayRow[] = ledgerTopics
        .filter((t) => t.attempted > 0)
        .map((t) => {
          const topicName = getTopicDisplayName(t.subjectId, t.topicId);
          const accuracy = Math.round((t.correct / t.attempted) * 100);
          return { topicId: t.topicId, topicName, accuracy, attempted: t.attempted, status: statusFor(accuracy) };
        });

      const ledgerTopicIds = new Set(rows.map((r) => r.topicId));
      const byChapter = new Map<string, { correct: number; total: number; attempts: number }>();
      for (const row of chapterStats) {
        const existing = byChapter.get(row.chapterName) ?? { correct: 0, total: 0, attempts: 0 };
        existing.correct += row.totalCorrect;
        existing.total += row.totalQuestions;
        existing.attempts += row.totalAttempts;
        byChapter.set(row.chapterName, existing);
      }
      for (const [chapterName, agg] of byChapter) {
        if (agg.total === 0) continue;
        const topicId = resolveTopicId(chapterName);
        if (topicId && ledgerTopicIds.has(topicId)) continue; // ledger already has this topic — don't double-count
        const topicName = topicId ? getTopicDisplayName('current-affairs', topicId) : chapterName;
        const accuracy = Math.round((agg.correct / agg.total) * 100);
        rows.push({ topicId: topicId ?? chapterName, topicName, accuracy, attempted: agg.attempts, status: statusFor(accuracy) });
      }

      // Weakest first — matches master prompt §33/§86 (surface what needs attention).
      rows.sort((a, b) => a.accuracy - b.accuracy);
      if (!cancelled) setWeakTopics(rows);
    })().finally(() => { if (!cancelled) setLoadingWeak(false); });
    return () => { cancelled = true; };
  }, [tab, chapterStats]);

  useEffect(() => {
    if (tab !== 'unattempted' || !exam) return;
    let cancelled = false;
    setLoadingUnattempted(true);
    getUnattemptedQuestions(exam.id)
      .then((qs) => { if (!cancelled) setUnattemptedCount(qs.length); })
      .finally(() => { if (!cancelled) setLoadingUnattempted(false); });
    return () => { cancelled = true; };
  }, [tab, exam?.id]);

  async function handlePracticeUnattempted() {
    if (!exam) return;
    setIsStartingUnattempted(true);
    try {
      const pool = await getUnattemptedQuestions(exam.id);
      if (pool.length === 0) { toast('No unattempted questions left!'); return; }
      const picked = await getRandomQuestions(Math.min(20, pool.length), pool);
      const quiz: DailyQuiz = { date: 'Unattempted Questions', questions: picked.map(toLegacyQuestion) };
      startSession(quiz, `unattempted_${Date.now()}.json`);
      navigate('/quiz');
    } finally {
      setIsStartingUnattempted(false);
    }
  }

  function handleRemove(id: string) {
    if (tab === 'bookmarked') { removeBookmark(id); toast.success('Removed bookmark'); }
    else if (tab === 'wrong') { dismissWrong(id); toast.success('Removed from wrong questions'); }
    else if (tab === 'marked') { removeMarked(id); toast.success('Removed mark'); }
  }

  const tabs: { key: ReviewTab; label: string; icon: React.ReactNode; count: number; accent: string }[] = [
    { key: 'bookmarked', label: 'Bookmarked', icon: <Bookmark size={14} />, count: bookmarkedItems.length, accent: 'border-l-purple-500' },
    { key: 'wrong', label: 'Wrong Questions', icon: <XCircle size={14} />, count: wrongItems.length, accent: 'border-l-red-500' },
    { key: 'marked', label: 'Marked For Review', icon: <Flag size={14} />, count: markedReviewItems.length, accent: 'border-l-amber-500' },
    { key: 'recent', label: 'Recently Attempted', icon: <HistoryIcon size={14} />, count: recentItems.length, accent: 'border-l-blue-500' },
    { key: 'weak', label: 'Weak Topics', icon: <TrendingDown size={14} />, count: weakTopics.filter((t) => t.status === 'Weak').length, accent: 'border-l-orange-500' },
    { key: 'unattempted', label: 'Unattempted', icon: <Layers size={14} />, count: unattemptedCount ?? 0, accent: 'border-l-teal-500' },
  ];

  const activeItems =
    tab === 'bookmarked' ? bookmarkedItems :
    tab === 'wrong' ? wrongItems :
    tab === 'marked' ? markedReviewItems :
    tab === 'recent' ? recentItems : [];
  const activeAccent = tabs.find((t) => t.key === tab)!.accent;
  const canRemove = tab === 'bookmarked' || tab === 'wrong' || tab === 'marked';

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [tab]);
  const visibleItems = activeItems.slice(0, visibleCount);
  const hasMore = activeItems.length > visibleCount;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <Sparkles size={20} className="text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Review Center
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Everything you've saved, missed, or flagged — in one place
          </p>
        </div>
      </div>

      {/* Tabs — horizontally scrollable, never overflow */}
      <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar" style={{ background: 'var(--border)' }}>
        {tabs.map(({ key, label, icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400'
                : 'hover:bg-white/50 dark:hover:bg-white/5'
            }`}
            style={tab !== key ? { color: 'var(--text-secondary)' } : undefined}
          >
            {icon} {label}
            {count > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs ${
                tab === key
                  ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                  : 'bg-gray-200 dark:bg-white/10'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'unattempted' ? (
        !exam ? (
          <EmptyState
            icon={<Layers size={28} style={{ color: 'var(--text-muted)' }} />}
            title="No exam selected"
            description="Choose an exam to see how much of its question bank you haven't touched yet."
            action={<button onClick={() => navigate('/exams')} className="btn-primary mt-4 text-sm py-2 px-5">Choose an Exam</button>}
          />
        ) : loadingUnattempted || unattemptedCount === null ? (
          <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} />
        ) : unattemptedCount === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={28} className="text-green-400" />}
            title="You've attempted everything!"
            description={`Every question in ${exam.name}'s current bank has been attempted at least once.`}
          />
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6 text-center">
            <p className="text-3xl font-display font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{unattemptedCount}</p>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>questions you haven't attempted yet</p>
            <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>in {exam.name}</p>
            <button onClick={handlePracticeUnattempted} disabled={isStartingUnattempted} className="btn-primary text-sm py-2.5 px-6">
              {isStartingUnattempted ? 'Starting…' : `Practice ${Math.min(20, unattemptedCount)} of Them`}
            </button>
          </motion.div>
        )
      ) : tab === 'weak' ? (
        loadingWeak ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />)}
          </div>
        ) : weakTopics.length === 0 ? (
          <EmptyState
            icon={<TrendingDown size={28} style={{ color: 'var(--text-muted)' }} />}
            title="Not enough data yet"
            description="Attempt a few topic-tagged questions — Chapter-wise Current Affairs, or Practice by Topic for any exam — and weak areas will show up here automatically."
            action={
              <button onClick={() => navigate('/practice/configure')} className="btn-primary mt-4 text-sm py-2 px-5 flex items-center gap-2">
                <ListChecks size={14} /> Practice by Topic
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {weakTopics.map((t, i) => <TopicRow key={t.topicId} topic={t} delay={i * 0.03} />)}
          </div>
        )
      ) : isLoading || (tab === 'recent' && loadingRecent) ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />)}
        </div>
      ) : activeItems.length === 0 ? (
        <EmptyState
          icon={
            tab === 'bookmarked' ? <Bookmark size={28} style={{ color: 'var(--text-muted)' }} /> :
            tab === 'wrong' ? <CheckCircle2 size={28} className="text-green-400" /> :
            tab === 'recent' ? <HistoryIcon size={28} style={{ color: 'var(--text-muted)' }} /> :
            <Flag size={28} style={{ color: 'var(--text-muted)' }} />
          }
          title={
            tab === 'bookmarked' ? 'No bookmarked questions yet' :
            tab === 'wrong' ? "You're all caught up!" :
            tab === 'recent' ? 'No tests attempted yet' :
            'No questions marked for review'
          }
          description={
            tab === 'bookmarked' ? 'Bookmark questions during a quiz to revisit them here.' :
            tab === 'wrong' ? 'No wrong answers in your revision queue right now.' :
            tab === 'recent' ? 'Complete a practice set, test, or daily quiz to see it here.' :
            'Use the flag button during a quiz to mark questions you want to revisit.'
          }
          action={
            <button onClick={() => navigate('/chapter-wise-current-affairs')} className="btn-primary mt-4 text-sm py-2 px-5 flex items-center gap-2">
              <ListChecks size={14} /> Take a Test
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item, i) => (
            <ReviewItemCard key={item.id} item={item} accentClass={activeAccent} onRemove={canRemove ? handleRemove : undefined} delay={i * 0.03} />
          ))}
          {hasMore && (
            <div className="flex justify-center pt-3">
              <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="btn-ghost text-sm px-5 py-2">
                Show {Math.min(PAGE_SIZE, activeItems.length - visibleCount)} more ({activeItems.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
