import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Star, ListChecks, Shuffle, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { useExamStore } from '../store/examStore';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useReaderStore } from '../store/readerStore';
import { subjectRegistry, getTopicDisplayName } from '../data/registry/subjectRegistry';
import { getSyllabusChapter, loadSyllabusNotes, syllabusReaderKey } from '../services/syllabusRepository';
import { getQuestionsByExam, getRandomQuestions } from '../services/questionRepository';
import { getChapterAttemptStats, type ChapterAttemptStats } from '../services/attemptLedgerService';
import { buildSessionQuestionIds } from '../services/practiceService';
import type { PracticeConfiguration } from '../types/practiceSession';

// Level 3 (product-refactor §30-31, §71-72): Notes first, Related Tests
// below, Favorite + Mixed Revision as consistent chapter-page actions.
// Every action funnels into the SAME universal session engine used
// everywhere else — no separate "chapter test" engine.

export default function GenericChapterDetailPage() {
  const navigate = useNavigate();
  const { subjectId = '', chapterId = '' } = useParams<{ subjectId: string; chapterId: string }>();
  const { selectedExamId } = useExamStore();
  const { startSession, session, clearSession } = usePracticeSessionStore();
  const { progress, loadProgress, toggleFavorite, updateProgress, incrementReadingTime } = useReaderStore();

  const subject = subjectRegistry.getSubject(subjectId);
  const chapterName = getTopicDisplayName(subjectId, chapterId);
  const chapter = getSyllabusChapter(subjectId, chapterId);
  const readerKey = syllabusReaderKey(subjectId, chapterId);

  const [notes, setNotes] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(true);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [attemptStats, setAttemptStats] = useState<ChapterAttemptStats | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const scrollStart = useRef(Date.now());
  const chapterProgress = progress[readerKey];

  useEffect(() => {
    loadProgress(readerKey, { examId: selectedExamId, subjectId, chapterName });
    scrollStart.current = Date.now();
    return () => {
      const seconds = Math.floor((Date.now() - scrollStart.current) / 1000);
      if (seconds > 3) incrementReadingTime(readerKey, seconds);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerKey]);

  useEffect(() => {
    setNotesLoading(true);
    if (chapter) {
      loadSyllabusNotes(chapter).then((content) => { setNotes(content); setNotesLoading(false); });
    } else {
      setNotes(null);
      setNotesLoading(false);
    }
  }, [chapter]);

  useEffect(() => {
    let cancelled = false;
    getQuestionsByExam(selectedExamId).then((pool) => {
      if (!cancelled) setQuestionCount(pool.filter((q) => q.subjectId === subjectId && q.topicId === chapterId).length);
    });
    getChapterAttemptStats(chapterId).then((stats) => { if (!cancelled) setAttemptStats(stats); });
    return () => { cancelled = true; };
  }, [selectedExamId, subjectId, chapterId]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const percent = el.scrollHeight <= el.clientHeight ? 100 : Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
    const status = percent >= 90 ? 'completed' : percent > 0 ? 'reading' : 'not_started';
    updateProgress(readerKey, { scrollPercent: Math.min(100, percent), scrollY: el.scrollTop, completionStatus: status });
  }

  async function startChapterSession(mode: 'practice' | 'test', mixedAcrossSubject: boolean) {
    if (session && !session.isCompleted) {
      if (!window.confirm('You have an in-progress session. Starting a new one will discard it. Continue?')) return;
      clearSession();
    }
    setIsStarting(true);
    try {
      const config: PracticeConfiguration = {
        examId: selectedExamId,
        subjectIds: [subjectId],
        topicId: mixedAcrossSubject ? undefined : chapterId,
        difficulty: 'mixed',
        questionCount: 20,
        mode,
        label: mixedAcrossSubject ? `${subject?.name ?? subjectId} — Mixed Revision` : `${subject?.name ?? subjectId} — ${chapterName}`,
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

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/chapters/${subjectId}`)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0" aria-label="Back">
            <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold truncate" style={{ color: 'var(--text-primary)' }}>{chapterName}</h1>
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

      {/* Notes */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={15} className="text-brand-500" />
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Notes</h2>
        </div>
        {notesLoading ? (
          <div className="h-40 shimmer rounded-xl" style={{ background: 'var(--border)' }} />
        ) : notes ? (
          <div
            onScroll={handleScroll}
            className="prose prose-sm dark:prose-invert max-w-none overflow-y-auto"
            style={{ maxHeight: '60vh', color: 'var(--text-secondary)' }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Notes unavailable for this chapter yet.</p>
        )}
      </div>

      {/* Related Tests — same universal engine as everywhere else */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={15} className="text-purple-500" />
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Related Tests</h2>
        </div>
        {questionCount === null ? (
          <div className="h-12 shimmer rounded-xl" style={{ background: 'var(--border)' }} />
        ) : questionCount === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No tests available yet.</p>
        ) : (
          <>
            {attemptStats && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Attempted {attemptStats.timesAttempted}× · Best {attemptStats.bestCorrect}/{attemptStats.bestTotal} ({attemptStats.bestAccuracy}%)
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => startChapterSession('practice', false)} disabled={isStarting} className="btn-secondary py-2.5 text-sm">
                Practice ({questionCount})
              </button>
              <button onClick={() => startChapterSession('test', false)} disabled={isStarting} className="btn-primary py-2.5 text-sm">
                Test Mode
              </button>
            </div>
          </>
        )}
      </div>

      {/* Mixed Revision — scoped to this chapter's subject, not a global pool */}
      <button
        onClick={() => startChapterSession('practice', true)}
        disabled={isStarting}
        className="card p-4 w-full flex items-center gap-3 hover:shadow-md transition-shadow disabled:opacity-60"
      >
        <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
          <Shuffle size={16} className="text-green-500" />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Mixed Revision</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Shuffled {subject?.name ?? subjectId} questions across topics</p>
        </div>
      </button>
    </div>
  );
}
