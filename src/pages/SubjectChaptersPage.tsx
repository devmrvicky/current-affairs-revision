import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, ListChecks, Newspaper, ChevronRight } from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import { getChaptersForSubject, type UniversalChapter } from '../services/universalChapterRepository';
import { getQuestionCountByTopic } from '../services/questionRepository';

// Level 2 of the generic Chapters flow: every chapter for one subject,
// straight from the Universal Chapter Repository — content-driven, not a
// hard-coded list, and not special-cased per subject.
//
// General Awareness gets exactly one deliberate addition: Current Affairs'
// own topic-wise chapters (Budget, GI Tags, ...) are merged in underneath
// their own "Current Affairs" heading — real content, reachable from here,
// each opening in the same universal chapter workspace as any other chapter
// — plus a single link to the full Current Affairs hub for Daily/Calendar/
// Monthly, which stay CA-only extensions rather than becoming generic
// chapter features (data-architecture migration §3/§10/§11).

interface ChapterRow extends UniversalChapter {
  /** The chapter's OWN subjectId for navigation — distinct from the page's subjectId when this row was merged in from Current Affairs. */
  navSubjectId: string;
}

export default function SubjectChaptersPage() {
  const navigate = useNavigate();
  const { subjectId } = useParams<{ subjectId: string }>();
  const { selectedExamId } = useExamStore();
  const subject = subjectId ? subjectRegistry.getSubject(subjectId) : undefined;
  const isGeneralAwareness = subjectId === 'general-awareness';

  const ownChapters: ChapterRow[] = useMemo(
    () => (subjectId ? getChaptersForSubject(subjectId).map((c) => ({ ...c, navSubjectId: subjectId })) : []),
    [subjectId]
  );
  const currentAffairsChapters: ChapterRow[] = useMemo(
    () => (isGeneralAwareness ? getChaptersForSubject('current-affairs').map((c) => ({ ...c, navSubjectId: 'current-affairs' })) : []),
    [isGeneralAwareness]
  );
  const allChapters = [...ownChapters, ...currentAffairsChapters];

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    if (allChapters.length === 0) { setLoadingCounts(false); return; }
    let cancelled = false;
    setLoadingCounts(true);
    Promise.all(
      allChapters.map(async (c) => [`${c.navSubjectId}::${c.id}`, await getQuestionCountByTopic(selectedExamId, c.navSubjectId, c.id)] as const)
    ).then((entries) => {
      if (cancelled) return;
      setCounts(Object.fromEntries(entries));
      setLoadingCounts(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, selectedExamId, ownChapters.length, currentAffairsChapters.length]);

  if (!subjectId) return <Navigate to="/chapters" replace />;

  function ChapterCard({ chapter, index }: { chapter: ChapterRow; index: number }) {
    const questionCount = counts[`${chapter.navSubjectId}::${chapter.id}`];
    return (
      <motion.button
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        onClick={() => navigate(`/chapters/${chapter.navSubjectId}/${chapter.id}`)}
        className="card p-4 w-full text-left flex items-center justify-between hover:shadow-md transition-shadow"
      >
        <div>
          <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{chapter.title}</p>
          <div className="flex items-center gap-3 mt-1">
            {chapter.hasNotes && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><FileText size={11} /> Notes</span>
            )}
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <ListChecks size={11} />
              {loadingCounts ? '…' : `${questionCount ?? 0} questions`}
            </span>
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/chapters')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Back">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{subject?.name ?? subjectId}</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chapters</p>
        </div>
      </div>

      {isGeneralAwareness && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/current-affairs')}
          className="card p-4 w-full text-left flex items-center justify-between hover:shadow-md transition-shadow border-l-4"
          style={{ borderLeftColor: '#6366f1' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
              <Newspaper size={16} className="text-indigo-500" />
            </div>
            <div>
              <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Current Affairs</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Daily · Monthly · Revision Calendar</p>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
        </motion.button>
      )}

      {ownChapters.length === 0 && currentAffairsChapters.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No chapters available for {subject?.name ?? subjectId} yet.</p>
        </div>
      ) : (
        <>
          {ownChapters.length > 0 && (
            <div className="space-y-2.5">
              {ownChapters.map((chapter, i) => <ChapterCard key={`${chapter.navSubjectId}-${chapter.id}`} chapter={chapter} index={i} />)}
            </div>
          )}

          {currentAffairsChapters.length > 0 && (
            <div>
              <h2 className="text-sm font-display font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                Current Affairs — Topic-wise
              </h2>
              <div className="space-y-2.5">
                {currentAffairsChapters.map((chapter, i) => <ChapterCard key={`${chapter.navSubjectId}-${chapter.id}`} chapter={chapter} index={i} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
