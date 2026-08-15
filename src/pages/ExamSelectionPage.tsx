import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, TrainFront, Landmark, Newspaper, Check, ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ExamCategory } from '../types/exam';
import { getAllExams } from '../services/examService';
import { useExamStore } from '../store/examStore';

const CATEGORY_META: Record<ExamCategory, { label: string; icon: LucideIcon; color: string }> = {
  other:    { label: 'Current Affairs',  icon: Newspaper,     color: '#6366f1' },
  ssc:      { label: 'SSC',              icon: GraduationCap, color: '#a855f7' },
  railway:  { label: 'Railway',          icon: TrainFront,    color: '#0ea5e9' },
  banking:  { label: 'Banking',          icon: Landmark,      color: '#22c55e' },
  defence:  { label: 'Defence',          icon: GraduationCap, color: '#f97316' },
  teaching: { label: 'Teaching',         icon: GraduationCap, color: '#eab308' },
  upsc:     { label: 'UPSC',             icon: GraduationCap, color: '#ef4444' },
  state:    { label: 'State-level',      icon: GraduationCap, color: '#14b8a6' },
};

const CATEGORY_ORDER: ExamCategory[] = ['other', 'ssc', 'railway', 'banking', 'defence', 'teaching', 'upsc', 'state'];

export default function ExamSelectionPage() {
  const navigate = useNavigate();
  const { selectedExamId, setSelectedExam } = useExamStore();
  const allExams = getAllExams();

  const byCategory = CATEGORY_ORDER
    .map((category) => ({ category, exams: allExams.filter((e) => e.category === category) }))
    .filter((group) => group.exams.length > 0);

  function handleSelect(examId: string) {
    setSelectedExam(examId);
    navigate('/');
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="pt-2 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Choose Your Exam
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your dashboard, practice, and tests adapt to this
          </p>
        </div>
      </motion.div>

      {byCategory.map(({ category, exams }, groupIndex) => {
        const meta = CATEGORY_META[category];
        return (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.05 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <meta.icon size={16} style={{ color: meta.color }} />
              <h2 className="text-sm font-display font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {meta.label}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {exams.map((exam) => {
                const isSelected = exam.id === selectedExamId;
                return (
                  <button
                    key={exam.id}
                    onClick={() => handleSelect(exam.id)}
                    className={`card p-4 text-left relative transition-all hover:shadow-md ${
                      isSelected ? 'ring-2' : ''
                    }`}
                    style={isSelected ? ({ '--tw-ring-color': meta.color } as React.CSSProperties) : undefined}
                  >
                    {isSelected && (
                      <div
                        className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: meta.color }}
                      >
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    <p className="font-display font-semibold text-sm mb-0.5" style={{ color: 'var(--text-primary)' }}>
                      {exam.name}
                    </p>
                    {exam.fullName && (
                      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                        {exam.fullName}
                      </p>
                    )}
                    <p className="text-xs" style={{ color: exam.active ? meta.color : 'var(--text-muted)' }}>
                      {exam.active ? `${exam.subjects.length} subjects available` : 'Question bank coming soon'}
                    </p>
                  </button>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
