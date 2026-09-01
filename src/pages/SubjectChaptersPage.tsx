import { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, ListChecks } from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import { getChaptersForSubject, type UniversalChapter } from '../services/universalChapterRepository';
import { getQuestionCountByTopic } from '../services/questionRepository';

// Level 2 of the generic Chapters flow: every chapter for one subject,
// straight from the Universal Chapter Repository — content-driven, not a
// hard-coded list, and not special-cased per subject. Current Affairs shows
// up here exactly like Mathematics or Reasoning would; its own richer
// standalone experience (search, highlights, AI summary, daily/monthly
// revision) remains separately reachable from wherever it already is,
// unaffected by this generic flow.

export default function SubjectChaptersPage() {
  const navigate = useNavigate();
  const { subjectId } = useParams<{ subjectId: string }>();
  const { selectedExamId } = useExamStore();
  const subject = subjectId ? subjectRegistry.getSubject(subjectId) : undefined;

  const chapters = subjectId ? getChaptersForSubject(subjectId) : [];
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    if (!subjectId || chapters.length === 0) { setLoadingCounts(false); return; }
    let cancelled = false;
    setLoadingCounts(true);
    Promise.all(
      chapters.map(async (c) => [c.id, await getQuestionCountByTopic(selectedExamId, subjectId, c.id)] as const)
    ).then((entries) => {
      if (cancelled) return;
      setCounts(Object.fromEntries(entries));
      setLoadingCounts(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, selectedExamId, chapters.length]);

  if (!subjectId) return <Navigate to="/chapters" replace />;

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

      {chapters.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No chapters available for {subject?.name ?? subjectId} yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {chapters.map((chapter: UniversalChapter, i) => {
            const questionCount = counts[chapter.id];
            return (
              <motion.button
                key={chapter.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/chapters/${subjectId}/${chapter.id}`)}
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
          })}
        </div>
      )}
    </div>
  );
}
