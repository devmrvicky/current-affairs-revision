import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Layers, ChevronRight } from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { examRegistry } from '../data/registry/examRegistry';
import { getSubjectsForExam } from '../services/examService';
import { getSubjectIdsWithChapterContent } from '../services/universalChapterRepository';

// Level 1 of the generic Chapters flow (product-refactor §27-29): every
// subject configured for the selected exam, in the exam's own order — no
// subject (including Current Affairs) gets special first-place treatment.

export default function ChaptersPage() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const exam = examRegistry.getExam(selectedExamId);
  const subjects = getSubjectsForExam(selectedExamId);

  // Content-driven, not a per-subject special case: a subject shows "Notes &
  // Tests" the moment the Universal Chapter Repository can find at least one
  // chapter for it (any source — canonical, legacy, or syllabus), never
  // because of which subjectId it happens to be.
  const contentSubjectIds = getSubjectIdsWithChapterContent();

  if (!exam) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center">
        <p style={{ color: 'var(--text-muted)' }}>No exam selected.</p>
        <button onClick={() => navigate('/exams')} className="btn-primary mt-4">Choose an Exam</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Back">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
          <Layers size={20} className="text-sky-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Chapters</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{exam.name}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {subjects.map((subject, i) => {
          const hasContent = contentSubjectIds.has(subject.id);
          return (
            <motion.button
              key={subject.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/chapters/${subject.id}`)}
              className="card p-4 w-full text-left flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{subject.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {hasContent ? 'Notes & Tests' : 'Coming soon'}
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
            </motion.button>
          );
        })}
        {subjects.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No subjects configured for this exam yet.</p>
        )}
      </div>
    </div>
  );
}
