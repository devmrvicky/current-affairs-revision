import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BookOpen, ListChecks, Sparkles, Star,
  Clock, CheckCircle2, PlayCircle, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useReaderStore } from '../store/readerStore';
import { loadChapterByFileName } from '../services/chapterRepository';
import { loadChapterMarkdown, getChaptersWithMarkdown } from '../services/markdownRepository';
import { MarkdownRenderer } from '../components/reader/MarkdownRenderer';
import { ReadingModeOverlay } from '../components/reader/ReadingModeOverlay';
import { HighlightMenu } from '../components/reader/HighlightMenu';
import { ChapterSearch } from '../components/reader/ChapterSearch';
import { QuickRevisionPanel } from '../components/reader/QuickRevisionPanel';
import { ExamRevisionMode } from '../components/reader/ExamRevisionMode';
import type { HighlightColor } from '../types';

type TabKey = 'revision' | 'test';

export default function ChapterDetailPage() {
  const { chapterName: rawChapterName } = useParams<{ chapterName: string }>();
  const chapterName = decodeURIComponent(rawChapterName ?? '');
  const navigate = useNavigate();
  const { startSession } = useQuizStore();
  const {
    loadAll, highlights, notes, progress, getHighlightsForChapter, getNotesForChapter,
    addHighlight, addNote, loadProgress, toggleFavorite, incrementReadingTime,
  } = useReaderStore();

  const [tab, setTab] = useState<TabKey>('revision');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isLoadingMd, setIsLoadingMd] = useState(true);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [isStartingTest, setIsStartingTest] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [examMode, setExamMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const hasMarkdown = useMemo(() => getChaptersWithMarkdown().has(chapterName), [chapterName]);
  const chapterFileName = `${chapterName}.json`;
  const chapterHighlights = getHighlightsForChapter(chapterName);
  const chapterNotes = getNotesForChapter(chapterName);
  const chapterProgress = progress[chapterName];

  useEffect(() => {
    loadAll();
    loadProgress(chapterName);
  }, [chapterName]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingMd(true);
    loadChapterMarkdown(chapterName).then((content) => {
      if (!cancelled) {
        setMarkdown(content);
        setIsLoadingMd(false);
      }
    });
    loadChapterByFileName(chapterFileName).then((quiz) => {
      if (!cancelled && quiz) setQuestionCount(quiz.questions.length);
    });
    return () => { cancelled = true; };
  }, [chapterName]);

  // Track reading time while on revision tab (inline, non-immersive)
  useEffect(() => {
    if (tab !== 'revision' || readingMode) return;
    const start = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - start) / 1000);
      if (seconds > 3) incrementReadingTime(chapterName, seconds);
    };
  }, [tab, readingMode, chapterName]);

  async function handleStartTest() {
    setIsStartingTest(true);
    try {
      const quiz = await loadChapterByFileName(chapterFileName);
      if (!quiz) {
        toast.error(`Could not load test for "${chapterName}"`);
        return;
      }
      startSession(quiz, chapterFileName);
      navigate('/quiz');
    } catch {
      toast.error('Failed to start test');
    } finally {
      setIsStartingTest(false);
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

  const inlineContainerId = 'chapter-revision-content';

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
              {questionCount !== null && <span>{questionCount} questions</span>}
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
                  Add <code className="px-1 rounded" style={{ background: 'var(--border)' }}>{chapterName}.md</code> to enable revision notes.
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
                  <div className="flex-1 min-w-0 card p-6" id={inlineContainerId}>
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

                  {/* Sidebar */}
                  <div className="lg:w-72 flex-shrink-0">
                    <QuickRevisionPanel
                      content={markdown}
                      highlights={chapterHighlights}
                      notes={chapterNotes}
                      onExamMode={() => setExamMode(true)}
                    />
                  </div>
                </div>

                {/* Highlight menu for inline (non-reading-mode) selection */}
                <HighlightMenu
                  containerRef={{ current: document.getElementById(inlineContainerId) } as React.RefObject<HTMLElement>}
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
            className="card p-8 text-center"
          >
            <div className="w-16 h-16 rounded-3xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-4">
              <ListChecks size={28} className="text-brand-500" />
            </div>
            <h2 className="font-display font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
              {chapterName} Test
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              {questionCount !== null ? `${questionCount} questions • Instant feedback • Track your score` : 'Loading question count...'}
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartTest}
              disabled={isStartingTest}
              className="btn-primary flex items-center justify-center gap-2 mx-auto px-8 py-3"
            >
              {isStartingTest ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              {isStartingTest ? 'Loading…' : 'Start Test'}
            </motion.button>
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
