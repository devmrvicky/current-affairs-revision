import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, ListChecks, Newspaper, ChevronRight } from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import { getChaptersForSubject, type UniversalChapter } from '../services/universalChapterRepository';
import { getQuestionCountByTopic } from '../services/questionRepository';
import { usePracticeTestLibrary, type PracticeTestLibraryData } from '../hooks/usePracticeTestLibrary';
import { ChapterTestsButton, ChapterTestsPanel } from '../components/tests/ChapterTests';

// Level 2 of the generic Chapters flow: every chapter for one subject,
// straight from the Universal Chapter Repository — content-driven, not a
// hard-coded list, and not special-cased per subject.
//
// General Awareness gets exactly one deliberate addition: Current Affairs'
// own topic-wise chapters (Modi Mantrimandal, App & Portal, ...) — genuinely
// date/CA-workflow-specific content, audited by actual substance rather than
// historical folder location — are merged in underneath their own "Current
// Affairs" heading — real content, reachable from here, each opening in the
// same universal chapter workspace as any other chapter — plus a single
// link to the full Current Affairs hub for Daily/Calendar/Monthly, which
// stay CA-only extensions rather than becoming generic chapter features
// (data-architecture migration §3/§10/§11).

interface ChapterRow extends UniversalChapter {
  /** The chapter's OWN subjectId for navigation — distinct from the page's subjectId when this row was merged in from Current Affairs. */
  navSubjectId: string;
}

/**
 * One chapter row: the existing "open chapter" area (notes + question count),
 * plus the compact "T" control that reveals this chapter's individual tests in
 * place. Defined at module level so toggling T re-renders only this row — an
 * inline component would remount every row (and replay its entrance animation).
 */
function ChapterCard({ chapter, index, questionLabel, testsOpen, onToggleTests, testsData, onOpen }: {
  chapter: ChapterRow;
  index: number;
  questionLabel: string;
  testsOpen: boolean;
  onToggleTests: () => void;
  testsData: PracticeTestLibraryData;
  onOpen: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="card overflow-hidden"
    >
      <div className="flex items-center gap-2 pr-3 hover:shadow-md transition-shadow">
        <button onClick={onOpen} className="flex-1 min-w-0 p-4 text-left">
          <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{chapter.title}</p>
          <div className="flex items-center gap-3 mt-1">
            {chapter.hasNotes && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><FileText size={11} /> Notes</span>
            )}
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <ListChecks size={11} />
              {questionLabel}
            </span>
            {chapter.testFileCount > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{chapter.testFileCount} test file{chapter.testFileCount === 1 ? '' : 's'}</span>
            )}
          </div>
        </button>
        {chapter.testFileCount > 0 && <ChapterTestsButton chapterTitle={chapter.title} open={testsOpen} onToggle={onToggleTests} />}
      </div>
      {testsOpen && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <ChapterTestsPanel data={testsData} chapterId={chapter.id} chapterSubjectId={chapter.navSubjectId} chapterTitle={chapter.title} />
        </div>
      )}
    </motion.div>
  );
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

  // "T" — which chapters have their tests open, and whether each library has been asked for yet.
  const [openTests, setOpenTests] = useState<Set<string>>(new Set());
  const [ownTestsRequested, setOwnTestsRequested] = useState(false);
  const [caTestsRequested, setCaTestsRequested] = useState(false);
  const ownTests = usePracticeTestLibrary(selectedExamId, subjectId ?? null, ownTestsRequested);
  const caTests = usePracticeTestLibrary(selectedExamId, isGeneralAwareness ? 'current-affairs' : null, caTestsRequested);
  function toggleTests(key: string, isCurrentAffairs: boolean) {
    if (isCurrentAffairs) setCaTestsRequested(true);
    else setOwnTestsRequested(true);
    setOpenTests((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  // Tests load only once a chapter's "T" has been opened — the library and ledger aren't touched until then.
  function renderChapterCard(chapter: ChapterRow, index: number) {
    const key = `${chapter.navSubjectId}::${chapter.id}`;
    const questionCount = counts[key];
    const isCurrentAffairs = chapter.navSubjectId === 'current-affairs';
    return (
      <ChapterCard
        key={key}
        chapter={chapter}
        index={index}
        questionLabel={loadingCounts ? '…' : `${questionCount ?? 0} questions`}
        testsOpen={openTests.has(key)}
        onToggleTests={() => toggleTests(key, isCurrentAffairs)}
        testsData={isCurrentAffairs ? caTests : ownTests}
        onOpen={() => navigate(`/chapters/${chapter.navSubjectId}/${chapter.id}`)}
      />
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
              {ownChapters.map((chapter, i) => renderChapterCard(chapter, i))}
            </div>
          )}

          {currentAffairsChapters.length > 0 && (
            <div>
              <h2 className="text-sm font-display font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                Current Affairs — Topic-wise
              </h2>
              <div className="space-y-2.5">
                {currentAffairsChapters.map((chapter, i) => renderChapterCard(chapter, i))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
