import { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, ListChecks } from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import { getAvailableTopics, type AvailableTopic } from '../services/questionRepository';
import { getSyllabusChaptersForSubject } from '../services/syllabusRepository';

// Level 2 (product-refactor §29): chapters for one subject. For every
// native subject this is content-derived (getAvailableTopics — no registry
// edit needed per chapter, same as Practice's topic picker). Current
// Affairs already has a rich, established chapter experience
// (/chapter-wise-current-affairs) with its own search/quiz variety — rather
// than rebuild a thinner version of it here, this redirects there. That's a
// deliberate reuse decision, not a gap: CA's chapters remain fully
// functional, just reached via one hop.

export default function SubjectChaptersPage() {
  const navigate = useNavigate();
  const { subjectId } = useParams<{ subjectId: string }>();
  const { selectedExamId } = useExamStore();
  const subject = subjectId ? subjectRegistry.getSubject(subjectId) : undefined;

  const [topics, setTopics] = useState<AvailableTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const notesChapters = new Set((subjectId ? getSyllabusChaptersForSubject(subjectId) : []).map((c) => c.chapterId));

  useEffect(() => {
    if (!subjectId || subjectId === 'current-affairs') return;
    let cancelled = false;
    setLoading(true);
    getAvailableTopics(selectedExamId, subjectId).then((t) => { if (!cancelled) { setTopics(t); setLoading(false); } });
    return () => { cancelled = true; };
  }, [subjectId, selectedExamId]);

  if (!subjectId) return <Navigate to="/chapters" replace />;
  if (subjectId === 'current-affairs') return <Navigate to="/chapter-wise-current-affairs" replace />;

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

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => <div key={i} className="card h-16 shimmer" style={{ background: 'var(--border)' }} />)}
        </div>
      ) : topics.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No chapters available for {subject?.name ?? subjectId} yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {topics.map((topic, i) => (
            <motion.button
              key={topic.topicId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/chapters/${subjectId}/${topic.topicId}`)}
              className="card p-4 w-full text-left flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{topic.topicName}</p>
                <div className="flex items-center gap-3 mt-1">
                  {notesChapters.has(topic.topicId) && (
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><FileText size={11} /> Notes</span>
                  )}
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><ListChecks size={11} /> {topic.questionCount} questions</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
