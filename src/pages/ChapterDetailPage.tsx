import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BookOpen, ListChecks, Sparkles, Star,
  PlayCircle, Loader2, Trophy, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useReaderStore } from '../store/readerStore';
import { useChapterStore } from '../store/chapterStore';
import {
  getChapterByName, loadChapterTest, loadChapterMarkdown,
} from '../services/chapterRepository';
import { MarkdownRenderer } from '../components/reader/MarkdownRenderer';
import { ReadingModeOverlay } from '../components/reader/ReadingModeOverlay';
import { HighlightMenu } from '../components/reader/HighlightMenu';
import { ChapterSearch } from '../components/reader/ChapterSearch';
import { QuickRevisionPanel } from '../components/reader/QuickRevisionPanel';
import { FloatingQuickRevisionButton } from '../components/reader/FloatingQuickRevisionButton';
import { ExamRevisionMode } from '../components/reader/ExamRevisionMode';
import { EmptyState } from '../components/common/EmptyState';
import type { HighlightColor } from '../types';

type TabKey = 'revision' | 'test';

export default function ChapterDetailPage() {
  const { chapterName: rawChapterName } = useParams<{ chapterName: string }>();
  const chapterName = decodeURIComponent(rawChapterName ?? '');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { startSession } = useQuizStore();
  const { getByFileName: getTestStats, load: loadChapterStats } = useChapterStore();
  const {
    loadAll, progress, getHighlightsForChapter, getNotesForChapter,
    addHighlight, addNote, loadProgress, toggleFavorite, incrementReadingTime,
  } = useReaderStore();

  // The chapter (folder) itself — undefined means the route doesn't match any known chapter folder.
  const chapter = useMemo(() => getChapterByName(chapterName), [chapterName]);

  const [tab, setTab] = useState<TabKey>('revision');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isLoadingMd, setIsLoadingMd] = useState(true);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [startingTest, setStartingTest] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  const [examMode, setExamMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const hasMarkdown = chapter?.mdRelPath != null;
  const chapterHighlights = getHighlightsForChapter(chapterName);
  const chapterNotes = getNotesForChapter(chapterName);
  const chapterProgress = progress[chapterName];

  useEffect(() => {
    loadAll();
    loadProgress(chapterName);
    loadChapterStats();
  }, [chapterName]);

  useEffect(() => {
    if (!chapter) { setIsLoadingMd(false); return; }
    let cancelled = false;
    setIsLoadingMd(true);
    loadChapterMarkdown(chapterName).then((content) => {
      if (!cancelled) {
        setMarkdown(content);
        setIsLoadingMd(false);
      }
    });
    // Lazily load each test's question count for the Test tab cards.
    chapter.tests.forEach(async (t) => {
      const quiz = await loadChapterTest(t.relPath);
      if (!cancelled && quiz) {
        setQuestionCounts((prev) => ({ ...prev, [t.relPath]: quiz.questions.length }));
      }
    });
    return () => { cancelled = true; };
  }, [chapterName, chapter]);

  // Track reading time while on revision tab (inline, non-immersive)
  useEffect(() => {
    if (tab !== 'revision' || readingMode) return;
    const start = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - start) / 1000);
      if (seconds > 3) incrementReadingTime(chapterName, seconds);
    };
  }, [tab, readingMode, chapterName]);

  function flashElement(el: Element) {
    el.classList.remove('revision-jump-flash');
    // restart the animation even if the same element was just flashed
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

  // Deep linking: /chapter/X?section=some-heading-slug scrolls there on load.
  // Retries briefly since the markdown DOM needs a render pass after `markdown` loads.
  useEffect(() => {
    if (!markdown || tab !== 'revision' || readingMode) return;
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
  }, [markdown, tab, readingMode]);

  async function handleStartTest(relPath: string) {
    setStartingTest(relPath);
    try {
      const quiz = await loadChapterTest(relPath);
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
    addHighlight(chapterName, text, color, 0, text.length);
    toast.success('Highlighted!', { duration: 1200 });
  }

  const [notePrompt, setNotePrompt] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  function handleAddNotePrompt(text: string) {
    setNotePrompt(text);
  }

  function handleSaveNote() {
    if (!notePrompt || !noteText.trim()) return;
    addNote(chapterName, noteText.trim(), notePrompt);
    toast.success('Note saved!');
    setNotePrompt(null);
    setNoteText('');
  }

  const revisionContentRef = useRef<HTMLDivElement>(null);

  // Chapter folder doesn't exist — friendly fallback instead of a blank/crashed page.
  if (!chapter) {
    return (
      <div className="max-w-md mx-auto pt-10">
        <EmptyState
          icon={<BookOpen size={28} style={{ color: 'var(--text-muted)' }} />}
          title="Chapter not found"
          description={`"${chapterName}" doesn't match any chapter folder.`}
          action={
            <button onClick={() => navigate('/chapter-wise-current-affairs')} className="btn-primary mt-4 text-sm py-2 px-5">
              Back to Chapters
            </button>
          }
        />
      </div>
    );
  }

  const totalQuestions = chapter.tests.reduce((sum, t) => sum + (questionCounts[t.relPath] ?? 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/chapter-wise-current-affairs')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0">
            <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {chapterName}
            </h1>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{chapter.tests.length} Test{chapter.tests.length !== 1 ? 's' : ''}</span>
              {totalQuestions > 0 && (
                <>
                  <span>·</span>
                  <span>{totalQuestions} questions</span>
                </>
              )}
              {chapterProgress && chapterProgress.scrollPercent > 0 && (
                <>
                  <span>·</span>
                  <span>{chapterProgress.scrollPercent}% read</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => toggleFavorite(chapterName)}
          className={`p-2 rounded-xl flex-shrink-0 transition-colors ${
            chapterProgress?.isFavorite ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'
          }`}
          style={!chapterProgress?.isFavorite ? { color: 'var(--text-muted)' } : undefined}
        >
          <Star size={18} fill={chapterProgress?.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Progress bar (if reading) */}
      {chapterProgress && chapterProgress.scrollPercent > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${chapterProgress.scrollPercent}%` }}
            className={`h-full rounded-full ${chapterProgress.completionStatus === 'completed' ? 'bg-green-500' : 'bg-gradient-to-r from-brand-500 to-purple-600'}`}
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
            ) : !hasMarkdown || !markdown ? (
              <div className="card p-8 text-center">
                <BookOpen size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No revision content available
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Add a <code className="px-1 rounded" style={{ background: 'var(--border)' }}>.md</code> file inside the{' '}
                  <code className="px-1 rounded" style={{ background: 'var(--border)' }}>{chapterName}/</code> folder to enable revision notes.
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
                    <ChapterSearch content={markdown} query={searchQuery} onQueryChange={setSearchQuery} />
                  </div>
                  <button
                    onClick={() => setReadingMode(true)}
                    className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 flex-shrink-0"
                  >
                    <Sparkles size={14} /> Start Reading
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Markdown content */}
                  <div className="flex-1 min-w-0 card p-6" ref={revisionContentRef}>
                    <MarkdownRenderer
                      content={markdown}
                      highlights={chapterHighlights}
                      searchQuery={searchQuery}
                      fontSize={16}
                      fontFamily="sans"
                      lineHeight={1.7}
                      maxWidth={9999}
                    />
                  </div>

                  {/* Sidebar — desktop/tablet only; mobile gets the floating button below */}
                  <div className="hidden lg:block lg:w-72 flex-shrink-0">
                    <QuickRevisionPanel
                      content={markdown}
                      highlights={chapterHighlights}
                      notes={chapterNotes}
                      onJumpToHeading={handleJumpToHeading}
                      onJumpToHighlight={handleJumpToHighlight}
                      onExamMode={() => setExamMode(true)}
                    />
                  </div>
                </div>

                {/* Mobile/tablet: floating draggable Quick Revision button (replaces the sidebar below lg) */}
                <FloatingQuickRevisionButton
                  content={markdown}
                  highlights={chapterHighlights}
                  notes={chapterNotes}
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
            {chapter.tests.length === 0 ? (
              <div className="card p-8 text-center">
                <ListChecks size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No tests available</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Add JSON test files inside the <code className="px-1 rounded" style={{ background: 'var(--border)' }}>{chapterName}/</code> folder.
                </p>
              </div>
            ) : (
              chapter.tests.map((test, i) => {
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
        {readingMode && markdown && (
          <ReadingModeOverlay
            chapterId={chapterName}
            content={markdown}
            onClose={() => setReadingMode(false)}
          />
        )}
      </AnimatePresence>

      {/* Exam Revision Mode */}
      <AnimatePresence>
        {examMode && (
          <ExamRevisionMode
            chapterName={chapterName}
            highlights={chapterHighlights}
            notes={chapterNotes}
            onClose={() => setExamMode(false)}
          />
        )}
      </AnimatePresence>

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
