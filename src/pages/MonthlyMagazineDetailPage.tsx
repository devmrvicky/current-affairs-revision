import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BookOpen, ListChecks, Sparkles, Star,
  PlayCircle, Loader2, Trophy, RotateCcw, CheckCircle2, Circle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useReaderStore } from '../store/readerStore';
import { useChapterStore } from '../store/chapterStore';
import { issueReaderKey, partReaderKey, useMonthlyMagazineStore } from '../store/monthlyMagazineStore';
import { readingProgressDB } from '../services/db';
import {
  getMonthlyMagazineIssue, loadMonthlyMagazineParts, loadMonthlyMagazineTest,
} from '../services/monthlyMagazineRepository';
import { MarkdownRenderer } from '../components/reader/MarkdownRenderer';
import { ReadingModeOverlay } from '../components/reader/ReadingModeOverlay';
import { HighlightMenu } from '../components/reader/HighlightMenu';
import { ChapterSearch } from '../components/reader/ChapterSearch';
import { QuickRevisionPanel } from '../components/reader/QuickRevisionPanel';
import { FloatingQuickRevisionButton } from '../components/reader/FloatingQuickRevisionButton';
import { ExamRevisionMode } from '../components/reader/ExamRevisionMode';
import { AiSummarySheet } from '../components/reader/AiSummarySheet';
import { EmptyState } from '../components/common/EmptyState';
import type { HighlightColor } from '../types';

type TabKey = 'revision' | 'test';

export default function MonthlyMagazineDetailPage() {
  const { issueKey: rawIssueKey } = useParams<{ issueKey: string }>();
  const issueKey = decodeURIComponent(rawIssueKey ?? '');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { startSession } = useQuizStore();
  const { getByFileName: getTestStats, load: loadChapterStats } = useChapterStore();
  const { refreshCard } = useMonthlyMagazineStore();
  const {
    loadAll, progress, getHighlightsForChapter, getNotesForChapter,
    addHighlight, addNote, loadProgress, toggleFavorite, incrementReadingTime,
  } = useReaderStore();

  // The issue (Year/Month folder) — undefined means the route doesn't match any known issue.
  const issue = useMemo(() => getMonthlyMagazineIssue(issueKey), [issueKey]);
  const readerKey = issueReaderKey(issueKey);
  const displayLabel = issue ? `${issue.month} ${issue.year}` : issueKey;

  const [tab, setTab] = useState<TabKey>('revision');
  const [parts, setParts] = useState<{ label: string; content: string }[]>([]);
  const [isLoadingMd, setIsLoadingMd] = useState(true);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [startingTest, setStartingTest] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  const [examMode, setExamMode] = useState(false);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [partCompletion, setPartCompletion] = useState<Record<number, boolean>>({});

  const hasMarkdown = parts.length > 0;
  // One joined string for anything that needs a single content blob (outline,
  // reading mode, search, exam mode) — parts stay separately loaded/rendered
  // for the inline tab view below, this is purely a display-time join, never
  // written back to storage.
  const combinedMarkdown = useMemo(() => parts.map((p) => p.content).join('\n\n---\n\n'), [parts]);
  const issueHighlights = getHighlightsForChapter(readerKey);
  const issueNotes = getNotesForChapter(readerKey);
  const issueProgress = progress[readerKey];

  useEffect(() => {
    loadAll();
    loadProgress(readerKey);
    loadChapterStats();
  }, [readerKey]);

  useEffect(() => {
    if (!issue) return;
    let cancelled = false;
    setIsLoadingMd(true);
    loadMonthlyMagazineParts(issue.issueKey).then((loaded) => {
      if (!cancelled) {
        setParts(loaded);
        setIsLoadingMd(false);
      }
    });
    // Lazily load each test's question count for the Test tab cards.
    issue.tests.forEach(async (t) => {
      const quiz = await loadMonthlyMagazineTest(t.relPath);
      if (!cancelled && quiz) {
        setQuestionCounts((prev) => ({ ...prev, [t.relPath]: quiz.questions.length }));
      }
    });
    return () => { cancelled = true; };
  }, [issueKey, issue]);

  // Load each part's individually-tracked completion status once we know how many parts exist.
  useEffect(() => {
    if (!issue || parts.length === 0) return;
    let cancelled = false;
    Promise.all(
      parts.map((_, i) => readingProgressDB.getByChapter(partReaderKey(issue.issueKey, i)))
    ).then((records) => {
      if (cancelled) return;
      const next: Record<number, boolean> = {};
      records.forEach((r, i) => { next[i] = r?.completionStatus === 'completed'; });
      setPartCompletion(next);
    });
    return () => { cancelled = true; };
  }, [issue, parts]);

  async function handleTogglePartCompletion(index: number) {
    if (!issue) return;
    const key = partReaderKey(issue.issueKey, index);
    const current = await readingProgressDB.getOrCreate(key);
    const nowCompleted = current.completionStatus !== 'completed';
    await readingProgressDB.upsert({
      ...current,
      completionStatus: nowCompleted ? 'completed' : 'reading',
      lastReadAt: Date.now(),
    });
    setPartCompletion((prev) => ({ ...prev, [index]: nowCompleted }));
    refreshCard(issue.issueKey); // keep the calendar list card's "X/Y sections" in sync
  }

  // Track reading time while on revision tab (inline, non-immersive)
  useEffect(() => {
    if (tab !== 'revision' || readingMode) return;
    const start = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - start) / 1000);
      if (seconds > 3) incrementReadingTime(readerKey, seconds);
    };
  }, [tab, readingMode, readerKey]);

  function flashElement(el: Element) {
    el.classList.remove('revision-jump-flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('revision-jump-flash');
    setTimeout(() => el.classList.remove('revision-jump-flash'), 1600);
  }

  function handleJumpToHeading(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flashElement(el);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', id);
      return next;
    }, { replace: true });
  }

  function handleJumpToHighlight(highlightId: string) {
    const el = document.querySelector(`[data-highlight-id="${highlightId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashElement(el);
  }

  // Deep linking: /monthly-magazine/X?section=some-heading-slug scrolls there on load.
  useEffect(() => {
    if (parts.length === 0 || tab !== 'revision' || readingMode) return;
    const section = searchParams.get('section');
    if (!section) return;
    let attempts = 0;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        flashElement(el);
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 150);
      }
    };
    requestAnimationFrame(tryScroll);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, tab, readingMode]);

  async function handleStartTest(relPath: string) {
    setStartingTest(relPath);
    try {
      const quiz = await loadMonthlyMagazineTest(relPath);
      if (!quiz) {
        toast.error('Could not load this test');
        return;
      }
      startSession(quiz, relPath);
      navigate('/quiz');
    } catch {
      toast.error('Failed to start test');
    } finally {
      setStartingTest(null);
    }
  }

  function handleHighlight(text: string, color: HighlightColor) {
    addHighlight(readerKey, text, color, 0, text.length);
    toast.success('Highlighted!', { duration: 1200 });
  }

  const [notePrompt, setNotePrompt] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  function handleAddNotePrompt(text: string) {
    setNotePrompt(text);
  }

  function handleSaveNote() {
    if (!notePrompt || !noteText.trim()) return;
    addNote(readerKey, noteText.trim(), notePrompt);
    toast.success('Note saved!');
    setNotePrompt(null);
    setNoteText('');
  }

  const revisionContentRef = useRef<HTMLDivElement>(null);

  // Issue folder doesn't exist — friendly fallback instead of a blank/crashed page.
  if (!issue) {
    return (
      <div className="max-w-md mx-auto pt-10">
        <EmptyState
          icon={<BookOpen size={28} style={{ color: 'var(--text-muted)' }} />}
          title="Magazine not found"
          description={`"${issueKey}" doesn't match any monthly magazine folder.`}
          action={
            <button onClick={() => navigate('/revision-calendar')} className="btn-primary mt-4 text-sm py-2 px-5">
              Back to Calendar
            </button>
          }
        />
      </div>
    );
  }

  const totalQuestions = issue.tests.reduce((sum, t) => sum + (questionCounts[t.relPath] ?? 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/revision-calendar')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0">
            <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {displayLabel}
            </h1>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{issue.tests.length} Test{issue.tests.length !== 1 ? 's' : ''}</span>
              {totalQuestions > 0 && (
                <>
                  <span>·</span>
                  <span>{totalQuestions} questions</span>
                </>
              )}
              {issueProgress && issueProgress.scrollPercent > 0 && (
                <>
                  <span>·</span>
                  <span>{issueProgress.scrollPercent}% read</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => toggleFavorite(readerKey)}
          className={`p-2 rounded-xl flex-shrink-0 transition-colors ${
            issueProgress?.isFavorite ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'
          }`}
          style={!issueProgress?.isFavorite ? { color: 'var(--text-muted)' } : undefined}
        >
          <Star size={18} fill={issueProgress?.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Progress bar (if reading) */}
      {issueProgress && issueProgress.scrollPercent > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${issueProgress.scrollPercent}%` }}
            className={`h-full rounded-full ${issueProgress.completionStatus === 'completed' ? 'bg-green-500' : 'bg-gradient-to-r from-brand-500 to-purple-600'}`}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--border)' }}>
        <button
          onClick={() => setTab('revision')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === 'revision' ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400' : ''
          }`}
          style={tab !== 'revision' ? { color: 'var(--text-secondary)' } : undefined}
        >
          <BookOpen size={15} /> Revision
        </button>
        <button
          onClick={() => setTab('test')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === 'test' ? 'bg-white dark:bg-[var(--card)] shadow-sm text-brand-600 dark:text-brand-400' : ''
          }`}
          style={tab !== 'test' ? { color: 'var(--text-secondary)' } : undefined}
        >
          <ListChecks size={15} /> Test
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {tab === 'revision' ? (
          <motion.div
            key="revision"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {isLoadingMd ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />
                ))}
              </div>
            ) : !hasMarkdown ? (
              <div className="card p-8 text-center">
                <BookOpen size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No revision content available
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Add a <code className="px-1 rounded" style={{ background: 'var(--border)' }}>.md</code> file inside the{' '}
                  <code className="px-1 rounded" style={{ background: 'var(--border)' }}>{issue.issueKey}/</code> folder to enable revision notes.
                </p>
                <button onClick={() => setTab('test')} className="btn-primary mt-4 text-sm py-2">
                  Go to Test instead
                </button>
              </div>
            ) : (
              <>
                {/* Actions row */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="flex-1">
                    <ChapterSearch content={combinedMarkdown} query={searchQuery} onQueryChange={setSearchQuery} />
                  </div>
                  <button
                    onClick={() => setAiSummaryOpen(true)}
                    className="btn-secondary flex items-center justify-center gap-2 text-sm py-2.5 flex-shrink-0"
                  >
                    <Sparkles size={14} /> Generate Summary
                  </button>
                  <button
                    onClick={() => setReadingMode(true)}
                    className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 flex-shrink-0"
                  >
                    <Sparkles size={14} /> Start Reading
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Markdown content — every part rendered in order, each labeled */}
                  <div className="flex-1 min-w-0 space-y-6" ref={revisionContentRef}>
                    {parts.map((part, i) => {
                      const isPartDone = !!partCompletion[i];
                      return (
                        <div key={part.label} className="card p-6">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                              {parts.length > 1 ? part.label : 'Revision'}
                            </p>
                            <button
                              onClick={() => handleTogglePartCompletion(i)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                                isPartDone ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-300 dark:border-green-800' : ''
                              }`}
                              style={!isPartDone ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
                            >
                              {isPartDone ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                              {isPartDone ? 'Read' : 'Mark as read'}
                            </button>
                          </div>
                          <MarkdownRenderer
                            content={part.content}
                            highlights={issueHighlights}
                            searchQuery={searchQuery}
                            fontSize={16}
                            fontFamily="sans"
                            lineHeight={1.7}
                            maxWidth={9999}
                          />
                          {i < parts.length - 1 && <hr className="mt-6" style={{ borderColor: 'var(--border)' }} />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sidebar — desktop/tablet only; mobile gets the floating button below */}
                  <div className="hidden lg:block lg:w-72 flex-shrink-0">
                    <QuickRevisionPanel
                      content={combinedMarkdown}
                      highlights={issueHighlights}
                      notes={issueNotes}
                      onJumpToHeading={handleJumpToHeading}
                      onJumpToHighlight={handleJumpToHighlight}
                      onExamMode={() => setExamMode(true)}
                    />
                  </div>
                </div>

                {/* Mobile/tablet: floating draggable Index button (replaces the sidebar below lg) */}
                <FloatingQuickRevisionButton
                  content={combinedMarkdown}
                  highlights={issueHighlights}
                  notes={issueNotes}
                  onJumpToHeading={handleJumpToHeading}
                  onJumpToHighlight={handleJumpToHighlight}
                  onExamMode={() => setExamMode(true)}
                />

                {/* Highlight menu for inline (non-reading-mode) selection */}
                <HighlightMenu
                  containerRef={revisionContentRef}
                  onHighlight={handleHighlight}
                  onAddNote={handleAddNotePrompt}
                />
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="test"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {issue.tests.length === 0 ? (
              <div className="card p-8 text-center">
                <ListChecks size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No tests available</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Add JSON test files inside the <code className="px-1 rounded" style={{ background: 'var(--border)' }}>{issue.issueKey}/</code> folder.
                </p>
              </div>
            ) : (
              issue.tests.map((test, i) => {
                const stats = getTestStats(test.relPath);
                const qCount = questionCounts[test.relPath];
                const progressPct = stats?.bestScore ?? 0;
                const attempted = !!stats;
                const isStarting = startingTest === test.relPath;

                return (
                  <motion.div
                    key={test.relPath}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="card p-4 sm:p-5 flex items-center gap-4"
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      attempted ? 'bg-green-100 dark:bg-green-900/30' : 'bg-brand-100 dark:bg-brand-900/30'
                    }`}>
                      {attempted
                        ? <Trophy size={18} className="text-green-500" />
                        : <ListChecks size={18} className="text-brand-500" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-display font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {test.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Questions: {qCount ?? '…'}
                        {attempted && (
                          <>
                            {' • '}Progress: <strong style={{ color: 'var(--text-secondary)' }}>{progressPct}%</strong>
                            {' • '}{stats!.totalAttempts} attempt{stats!.totalAttempts !== 1 ? 's' : ''}
                          </>
                        )}
                      </p>
                      {attempted && (
                        <div className="h-1.5 rounded-full overflow-hidden mt-2 max-w-[200px]" style={{ background: 'var(--border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progressPct}%`,
                              background: progressPct >= 75 ? '#22c55e' : progressPct >= 50 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleStartTest(test.relPath)}
                      disabled={isStarting}
                      className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm flex-shrink-0"
                    >
                      {isStarting
                        ? <Loader2 size={14} className="animate-spin" />
                        : attempted ? <RotateCcw size={14} /> : <PlayCircle size={14} />
                      }
                      <span className="hidden sm:inline">{attempted ? 'Retake' : 'Start'}</span>
                    </motion.button>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reading Mode Overlay */}
      <AnimatePresence>
        {readingMode && combinedMarkdown && (
          <ReadingModeOverlay
            chapterId={readerKey}
            content={combinedMarkdown}
            onClose={() => setReadingMode(false)}
          />
        )}
      </AnimatePresence>

      {/* Exam Revision Mode */}
      <AnimatePresence>
        {examMode && (
          <ExamRevisionMode
            chapterName={displayLabel}
            highlights={issueHighlights}
            notes={issueNotes}
            onClose={() => setExamMode(false)}
          />
        )}
      </AnimatePresence>

      {/* AI Summary */}
      <AiSummarySheet
        isOpen={aiSummaryOpen}
        onClose={() => setAiSummaryOpen(false)}
        contentKey={readerKey}
        title={displayLabel}
        markdown={combinedMarkdown}
        onSaveAsNote={(text) => addNote(readerKey, text, `AI Summary — ${displayLabel}`)}
      />

      {/* Note prompt modal (inline mode) */}
      <AnimatePresence>
        {notePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-black/60"
            onClick={() => setNotePrompt(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="card p-5 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Add Note</h3>
              <p className="text-xs mb-3 p-2 rounded-lg italic" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                "{notePrompt.slice(0, 100)}{notePrompt.length > 100 ? '…' : ''}"
              </p>
              <textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm border outline-none focus:border-brand-400 resize-none"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setNotePrompt(null)} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
                <button onClick={handleSaveNote} className="flex-1 btn-primary text-sm py-2">Save Note</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
