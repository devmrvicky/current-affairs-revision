import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, ListChecks, Shuffle, FileText, Search, BookOpen, Sparkles,
  ChevronLeft, ChevronRight, Flag, CheckCircle2, XCircle, PlayCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useExamStore } from '../store/examStore';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useReaderStore } from '../store/readerStore';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import {
  getChapter, chapterReaderKey, loadUniversalChapterNotes,
} from '../services/universalChapterRepository';
import { getQuestionsByExam } from '../services/questionRepository';
import { getChapterAttemptStats, type ChapterAttemptStats } from '../services/attemptLedgerService';
import { buildSessionQuestionIds } from '../services/practiceService';
import type { PracticeConfiguration } from '../types/practiceSession';
import type { UniversalQuestion } from '../types/universalQuestion';
import { MarkdownRenderer } from '../components/reader/MarkdownRenderer';
import { ReadingModeOverlay } from '../components/reader/ReadingModeOverlay';
import { HighlightMenu } from '../components/reader/HighlightMenu';
import { ChapterSearch } from '../components/reader/ChapterSearch';
import { AiSummarySheet } from '../components/reader/AiSummarySheet';
import { QuestionMarkdownRenderer, QuestionOptionContent } from '../components/mock/QuestionMarkdownRenderer';
import { EmptyState } from '../components/common/EmptyState';
import type { HighlightColor } from '../types';

// The ONE Chapter page — Mathematics, Reasoning, English, General Awareness,
// Current Affairs, whatever comes next — all rendered from the same
// UniversalChapter model via universalChapterRepository. Notes on the left,
// a lightweight MCQ practice viewer on the right (desktop); segmented tabs
// on mobile. "Test Mode" and "Mixed Revision" both still funnel into the
// same universal session engine used everywhere else in the app.

type MobileTab = 'notes' | 'mcq';

export default function GenericChapterDetailPage() {
  const navigate = useNavigate();
  const { subjectId = '', chapterId = '' } = useParams<{ subjectId: string; chapterId: string }>();
  const { selectedExamId } = useExamStore();
  const { startSession, session, clearSession } = usePracticeSessionStore();
  const {
    progress, loadProgress, toggleFavorite, updateProgress, incrementReadingTime,
    getHighlightsForChapter, getNotesForChapter, addHighlight, addNote,
  } = useReaderStore();

  const subject = subjectRegistry.getSubject(subjectId);
  const chapter = useMemo(() => getChapter(subjectId, chapterId), [subjectId, chapterId]);
  const readerKey = chapterReaderKey(subjectId, chapterId);
  const chapterProgress = progress[readerKey];
  const chapterHighlights = getHighlightsForChapter(readerKey);
  const personalNotes = getNotesForChapter(readerKey);

  const [notes, setNotes] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(true);
  const [questions, setQuestions] = useState<UniversalQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [attemptStats, setAttemptStats] = useState<ChapterAttemptStats | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('notes');

  // Inline practice viewer — local, session-less state (Test Mode is what
  // persists; this is a lightweight companion for reading-while-practicing).
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());

  // Notes panel chrome
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [readingMode, setReadingMode] = useState(false);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [notePrompt, setNotePrompt] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const notesContainerRef = useRef<HTMLDivElement>(null);
  const scrollStart = useRef(0);

  useEffect(() => {
    if (!chapter) return;
    loadProgress(readerKey, { examId: selectedExamId, subjectId, chapterName: chapter.title });
    scrollStart.current = Date.now();
    return () => {
      const seconds = Math.floor((Date.now() - scrollStart.current) / 1000);
      if (seconds > 3) incrementReadingTime(readerKey, seconds);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerKey, chapter]);

  useEffect(() => {
    if (!chapter) { setNotesLoading(false); return; }
    setNotesLoading(true);
    loadUniversalChapterNotes(chapter).then((content) => { setNotes(content); setNotesLoading(false); });
  }, [chapter]);

  useEffect(() => {
    if (!chapter) { setQuestionsLoading(false); return; }
    let cancelled = false;
    setQuestionsLoading(true);
    setQIndex(0);
    setAnswers({});
    setMarked(new Set());
    getQuestionsByExam(selectedExamId).then((pool) => {
      if (cancelled) return;
      setQuestions(pool.filter((q) => q.subjectId === chapter.subjectId && q.topicId === chapter.id));
      setQuestionsLoading(false);
    });
    getChapterAttemptStats(chapter.id).then((stats) => { if (!cancelled) setAttemptStats(stats); });
    return () => { cancelled = true; };
  }, [chapter, selectedExamId]);

  function handleNotesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const percent = el.scrollHeight <= el.clientHeight ? 100 : Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
    const status = percent >= 90 ? 'completed' : percent > 0 ? 'reading' : 'not_started';
    updateProgress(readerKey, { scrollPercent: Math.min(100, percent), scrollY: el.scrollTop, completionStatus: status });
  }

  async function startChapterSession(mode: 'practice' | 'test', mixedAcrossSubject: boolean) {
    if (!chapter) return;
    if (session && !session.isCompleted) {
      if (!window.confirm('You have an in-progress session. Starting a new one will discard it. Continue?')) return;
      clearSession();
    }
    setIsStarting(true);
    try {
      const config: PracticeConfiguration = {
        examId: selectedExamId,
        subjectIds: [subjectId],
        topicId: mixedAcrossSubject ? undefined : chapter.id,
        difficulty: 'mixed',
        questionCount: 20,
        mode,
        label: mixedAcrossSubject ? `${subject?.name ?? subjectId} — Mixed Revision` : `${subject?.name ?? subjectId} — ${chapter.title}`,
      };
      const questionIds = await buildSessionQuestionIds(config);
      if (questionIds.length === 0) {
        toast.error('No questions available for this yet');
        return;
      }
      startSession(config, questionIds);
      navigate('/session');
    } finally {
      setIsStarting(false);
    }
  }

  function handleHighlight(text: string, color: HighlightColor) {
    addHighlight(readerKey, text, color, 0, text.length);
    toast.success('Highlighted!', { duration: 1200 });
  }

  function handleSaveNote() {
    if (!notePrompt || !noteText.trim()) return;
    addNote(readerKey, noteText.trim(), notePrompt);
    toast.success('Note saved!');
    setNotePrompt(null);
    setNoteText('');
  }

  function selectAnswer(questionId: string, optionId: string) {
    setAnswers((prev) => (prev[questionId] ? prev : { ...prev, [questionId]: optionId }));
  }

  function toggleMark(questionId: string) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      return next;
    });
  }

  if (!chapter) {
    return (
      <div className="max-w-md mx-auto pt-10">
        <EmptyState
          icon={<BookOpen size={28} style={{ color: 'var(--text-muted)' }} />}
          title="Chapter not found"
          description="This chapter doesn't exist yet."
          action={<button onClick={() => navigate(`/chapters/${subjectId}`)} className="btn-primary">Back to Chapters</button>}
        />
      </div>
    );
  }

  const currentQuestion = questions[qIndex];
  const combinedNotes = notes ?? '';

  return (
    <div className="max-w-6xl mx-auto pb-28 lg:pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/chapters/${subjectId}`)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0" aria-label="Back">
            <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold truncate" style={{ color: 'var(--text-primary)' }}>{chapter.title}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{subject?.name ?? subjectId}</p>
          </div>
        </div>
        <button
          onClick={() => toggleFavorite(readerKey)}
          className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${chapterProgress?.isFavorite ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'}`}
          style={!chapterProgress?.isFavorite ? { color: 'var(--text-muted)' } : undefined}
          aria-label="Favorite this chapter"
          aria-pressed={!!chapterProgress?.isFavorite}
        >
          <Star size={18} fill={chapterProgress?.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Mobile segmented tabs */}
      <div className="lg:hidden sticky top-0 z-20 -mx-1 px-1 py-2 mb-3" style={{ background: 'var(--bg)' }}>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: 'var(--border)' }}>
          <button
            onClick={() => setMobileTab('notes')}
            className="py-2 rounded-lg text-sm font-medium transition-colors"
            style={mobileTab === 'notes' ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
          >
            Notes
          </button>
          <button
            onClick={() => setMobileTab('mcq')}
            className="py-2 rounded-lg text-sm font-medium transition-colors"
            style={mobileTab === 'mcq' ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
          >
            MCQ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] gap-4 lg:gap-5 items-start">
        {/* LEFT — Notes */}
        <div className={mobileTab === 'notes' ? 'block' : 'hidden lg:block'}>
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-brand-500" />
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Notes</h2>
              </div>
              {notes && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowSearch((s) => !s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Search notes">
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => setReadingMode(true)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Reading mode">
                    <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => setAiSummaryOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="AI summary">
                    <Sparkles size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              )}
            </div>

            {showSearch && notes && (
              <div className="mb-3">
                <ChapterSearch content={notes} query={searchQuery} onQueryChange={setSearchQuery} />
              </div>
            )}

            {notesLoading ? (
              <div className="h-40 shimmer rounded-xl" style={{ background: 'var(--border)' }} />
            ) : notes ? (
              <div
                ref={notesContainerRef}
                onScroll={handleNotesScroll}
                className="overflow-y-auto"
                style={{ maxHeight: '70vh' }}
              >
                <MarkdownRenderer content={notes} highlights={chapterHighlights} searchQuery={searchQuery} maxWidth={9999} />
                <HighlightMenu containerRef={notesContainerRef} onHighlight={handleHighlight} onAddNote={setNotePrompt} />
              </div>
            ) : (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Notes not available yet.</p>
            )}
          </div>
        </div>

        {/* RIGHT — MCQ */}
        <div className={`${mobileTab === 'mcq' ? 'block' : 'hidden lg:block'} lg:sticky lg:top-4 space-y-3`}>
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ListChecks size={15} className="text-purple-500" />
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Practice</h2>
              </div>
              {questions.length > 0 && (
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{qIndex + 1} / {questions.length}</span>
              )}
            </div>

            {questionsLoading ? (
              <div className="h-56 shimmer rounded-xl" style={{ background: 'var(--border)' }} />
            ) : questions.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Practice questions are not available yet.</p>
            ) : currentQuestion ? (
              <AnimatePresence mode="wait">
                <motion.div key={currentQuestion.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
                    <QuestionMarkdownRenderer content={currentQuestion.question} baseDir={currentQuestion.sourceMockBaseDir} />
                  </div>
                  <div className="space-y-2">
                    {currentQuestion.options.map((opt) => {
                      const selected = answers[currentQuestion.id];
                      const isSelected = selected === opt.id;
                      const isAnswered = !!selected;
                      const isCorrectOpt = opt.id === currentQuestion.correctAnswer;
                      let borderColor = 'var(--border)';
                      let background = 'var(--card)';
                      if (isAnswered && isCorrectOpt) { borderColor = '#22c55e'; background = 'rgba(34,197,94,0.08)'; }
                      else if (isAnswered && isSelected && !isCorrectOpt) { borderColor = '#ef4444'; background = 'rgba(239,68,68,0.08)'; }
                      else if (isSelected) { borderColor = 'var(--brand-500, #6366f1)'; }
                      return (
                        <button
                          key={opt.id}
                          onClick={() => selectAnswer(currentQuestion.id, opt.id)}
                          disabled={isAnswered}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl border-2 transition-colors flex items-start gap-2.5 text-sm disabled:cursor-default"
                          style={{ borderColor, background, color: 'var(--text-primary)' }}
                        >
                          <span
                            className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center text-[11px] font-semibold"
                            style={{ borderColor, color: isAnswered && isCorrectOpt ? '#22c55e' : isAnswered && isSelected ? '#ef4444' : 'var(--text-muted)' }}
                          >
                            {isAnswered && isCorrectOpt ? <CheckCircle2 size={13} /> : isAnswered && isSelected ? <XCircle size={13} /> : opt.id}
                          </span>
                          <QuestionOptionContent text={opt.text} image={opt.image} baseDir={currentQuestion.sourceMockBaseDir} />
                        </button>
                      );
                    })}
                  </div>
                  {answers[currentQuestion.id] && currentQuestion.explanation && (
                    <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                      <QuestionMarkdownRenderer content={currentQuestion.explanation} baseDir={currentQuestion.sourceMockBaseDir} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : null}

            {questions.length > 0 && (
              <div className="hidden lg:flex items-center justify-between gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setQIndex((i) => Math.max(0, i - 1))} disabled={qIndex === 0} className="btn-secondary px-3 py-2 text-xs disabled:opacity-40 flex items-center gap-1">
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  onClick={() => currentQuestion && toggleMark(currentQuestion.id)}
                  className="px-3 py-2 rounded-xl text-xs flex items-center gap-1"
                  style={{ color: currentQuestion && marked.has(currentQuestion.id) ? '#f59e0b' : 'var(--text-muted)' }}
                >
                  <Flag size={14} fill={currentQuestion && marked.has(currentQuestion.id) ? 'currentColor' : 'none'} /> Mark
                </button>
                <button onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={qIndex >= questions.length - 1} className="btn-secondary px-3 py-2 text-xs disabled:opacity-40 flex items-center gap-1">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {questions.length > 0 && (
            <div className="card p-4">
              {attemptStats && (
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  Attempted {attemptStats.timesAttempted}× · Best {attemptStats.bestCorrect}/{attemptStats.bestTotal} ({attemptStats.bestAccuracy}%)
                </p>
              )}
              <button onClick={() => startChapterSession('test', false)} disabled={isStarting} className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-1.5">
                <PlayCircle size={15} /> Test Mode
              </button>
              <button onClick={() => startChapterSession('practice', true)} disabled={isStarting} className="w-full mt-2 py-2 text-xs flex items-center justify-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Shuffle size={12} /> Mixed Revision — {subject?.name ?? subjectId}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky Prev/Mark/Next — MCQ tab only */}
      {mobileTab === 'mcq' && questions.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setQIndex((i) => Math.max(0, i - 1))} disabled={qIndex === 0} className="btn-secondary flex-1 py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-1">
            <ChevronLeft size={16} /> Prev
          </button>
          <button
            onClick={() => currentQuestion && toggleMark(currentQuestion.id)}
            className="p-2.5 rounded-xl"
            style={{ color: currentQuestion && marked.has(currentQuestion.id) ? '#f59e0b' : 'var(--text-muted)' }}
            aria-label="Mark for review"
          >
            <Flag size={18} fill={currentQuestion && marked.has(currentQuestion.id) ? 'currentColor' : 'none'} />
          </button>
          <button onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={qIndex >= questions.length - 1} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-1">
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Reading Mode Overlay */}
      <AnimatePresence>
        {readingMode && combinedNotes && (
          <ReadingModeOverlay chapterId={readerKey} content={combinedNotes} onClose={() => setReadingMode(false)} />
        )}
      </AnimatePresence>

      {/* AI Summary */}
      <AiSummarySheet
        isOpen={aiSummaryOpen}
        onClose={() => setAiSummaryOpen(false)}
        contentKey={readerKey}
        title={chapter.title}
        markdown={combinedNotes}
        onSaveAsNote={(text) => addNote(readerKey, text, `AI Summary — ${chapter.title}`)}
      />

      {/* Note prompt modal */}
      <AnimatePresence>
        {notePrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-black/60"
            onClick={() => setNotePrompt(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="card p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Add Note</h3>
              <p className="text-xs mb-3 p-2 rounded-lg italic" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                "{notePrompt.slice(0, 100)}{notePrompt.length > 100 ? '…' : ''}"
              </p>
              <textarea
                autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note..." rows={3}
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

      {personalNotes.length > 0 && null}
    </div>
  );
}
