import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Zap, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { useExamStore } from '../store/examStore';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { getSubjectsForExam } from '../services/examService';
import { getAvailableTopics, getAvailableSubjects, type AvailableTopic } from '../services/questionRepository';
import { createQuestionPool, buildSessionQuestionIds } from '../services/practiceService';
import type { UniversalQuestion, Difficulty } from '../types/universalQuestion';
import type { PracticeConfiguration } from '../types/practiceSession';

const COUNT_OPTIONS = [10, 20, 25, 50];
const DIFFICULTY_OPTIONS: { id: Difficulty | 'mixed'; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

// Phase 8: this configurator now produces a PracticeConfiguration and hands
// off to the universal session engine (practiceSessionStore + practiceService)
// — it never builds a DailyQuiz or calls toLegacyQuestion (master prompt §23).

export default function PracticeConfigurePage() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const { session, startSession, clearSession } = usePracticeSessionStore();

  const subjects = useMemo(() => getSubjectsForExam(selectedExamId), [selectedExamId]);

  // Official syllabus (subjects) vs actual available content — a subject the
  // exam config lists but with zero real questions is shown disabled with
  // "Coming Soon" rather than silently behaving as if it had content
  // (master prompt Phase 8 §7, §38).
  const [contentSubjectIds, setContentSubjectIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    getAvailableSubjects(selectedExamId).then((avail) => {
      if (!cancelled) setContentSubjectIds(new Set(avail.map((a) => a.subjectId)));
    });
    return () => { cancelled = true; };
  }, [selectedExamId]);

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [mode, setMode] = useState<'practice' | 'test'>('practice');
  const [pool, setPool] = useState<UniversalQuestion[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [topics, setTopics] = useState<AvailableTopic[]>([]);

  // Default the selection to the first subject that actually has content,
  // once we know which ones do — never default to an empty subject.
  useEffect(() => {
    if (selectedSubjectIds.length > 0 || contentSubjectIds.size === 0) return;
    const firstWithContent = subjects.find((s) => contentSubjectIds.has(s.id));
    if (firstWithContent) setSelectedSubjectIds([firstWithContent.id]);
  }, [contentSubjectIds, subjects, selectedSubjectIds.length]);

  // Topics come from actual content (getAvailableTopics), not a manually
  // maintained registry — a subject's topics show up here the instant a
  // question file with that topicId exists, no code/registry edit required.
  useEffect(() => {
    if (selectedSubjectIds.length !== 1) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    getAvailableTopics(selectedExamId, selectedSubjectIds[0]).then((t) => { if (!cancelled) setTopics(t); });
    return () => { cancelled = true; };
  }, [selectedSubjectIds, selectedExamId]);

  useEffect(() => {
    setSelectedTopicId('all');
  }, [selectedSubjectIds.join(',')]);

  useEffect(() => {
    if (selectedSubjectIds.length === 0) { setPool([]); return; }
    let cancelled = false;
    (async () => {
      setPoolLoading(true);
      try {
        const config: PracticeConfiguration = {
          examId: selectedExamId,
          subjectIds: selectedSubjectIds,
          topicId: selectedSubjectIds.length === 1 && selectedTopicId !== 'all' ? selectedTopicId : undefined,
          difficulty,
          questionCount,
          mode,
          label: '',
        };
        const combined = await createQuestionPool(config);
        if (!cancelled) setPool(combined);
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSubjectIds, selectedTopicId, difficulty, selectedExamId]);

  function toggleSubject(id: string) {
    if (!contentSubjectIds.has(id)) return; // Coming Soon subjects aren't selectable
    setSelectedSubjectIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleStart() {
    if (selectedSubjectIds.length === 0) {
      toast.error('Pick at least one subject');
      return;
    }
    if (pool.length === 0) {
      toast.error('No questions available for this selection yet');
      return;
    }
    if (session && !session.isCompleted) {
      if (!window.confirm('You have an in-progress session. Starting a new practice will discard it. Continue?')) return;
      clearSession();
    }

    setIsStarting(true);
    try {
      const label =
        selectedSubjectIds.length === 1
          ? subjects.find((s) => s.id === selectedSubjectIds[0])?.name ?? 'Practice'
          : 'Mixed Practice';

      const config: PracticeConfiguration = {
        examId: selectedExamId,
        subjectIds: selectedSubjectIds,
        topicId: selectedSubjectIds.length === 1 && selectedTopicId !== 'all' ? selectedTopicId : undefined,
        difficulty,
        questionCount: Math.min(questionCount, pool.length),
        mode,
        label,
      };

      const questionIds = await buildSessionQuestionIds(config);
      startSession(config, questionIds);
      navigate('/session');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="space-y-6 pb-4">
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
            Practice
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Configure your set, then start
          </p>
        </div>
      </motion.div>

      {/* Subjects */}
      <section className="card p-4">
        <h2 className="text-sm font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Subjects {selectedSubjectIds.length > 1 && <span style={{ color: 'var(--text-muted)' }}>· Mixed</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          {subjects.map((subject) => {
            const active = selectedSubjectIds.includes(subject.id);
            const hasContent = contentSubjectIds.has(subject.id);
            return (
              <button
                key={subject.id}
                onClick={() => toggleSubject(subject.id)}
                disabled={!hasContent}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  active ? 'bg-brand-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
                style={!active ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
              >
                {active && <Check size={12} />}
                {subject.name}
                {!hasContent && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· Coming Soon</span>}
              </button>
            );
          })}
          {subjects.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No subjects configured for this exam yet.</p>
          )}
        </div>
      </section>

      {/* Topic — only when a single subject is selected */}
      {selectedSubjectIds.length === 1 && topics.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Topic
          </h2>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            <button
              onClick={() => setSelectedTopicId('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedTopicId === 'all' ? 'bg-brand-500 text-white' : ''
              }`}
              style={selectedTopicId !== 'all' ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              All Topics
            </button>
            {topics.map((topic) => (
              <button
                key={topic.topicId}
                onClick={() => setSelectedTopicId(topic.topicId)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedTopicId === topic.topicId ? 'bg-brand-500 text-white' : ''
                }`}
                style={selectedTopicId !== topic.topicId ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
              >
                {topic.topicName} ({topic.questionCount})
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Difficulty */}
      <section className="card p-4">
        <h2 className="text-sm font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Difficulty
        </h2>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setDifficulty(opt.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                difficulty === opt.id ? 'bg-brand-500 text-white' : ''
              }`}
              style={difficulty !== opt.id ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Question count — never allow more than the actual pool (master prompt §37) */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-semibold" style={{ color: 'var(--text-primary)' }}>
            Number of Questions
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {poolLoading ? 'Checking availability…' : `${pool.length} available`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setQuestionCount(n)}
              disabled={pool.length > 0 && n > pool.length}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                questionCount === n ? 'bg-brand-500 text-white' : ''
              }`}
              style={questionCount !== n ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              {n}
            </button>
          ))}
          {pool.length > 0 && (
            <button
              onClick={() => setQuestionCount(pool.length)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                questionCount === pool.length ? 'bg-brand-500 text-white' : ''
              }`}
              style={questionCount !== pool.length ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              All ({pool.length})
            </button>
          )}
        </div>
      </section>

      {/* Mode — practice reveals per-question, test withholds until submission (drives config.mode, not a global setting) */}
      <section className="card p-4">
        <h2 className="text-sm font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Mode
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('practice')}
            className={`p-3 rounded-xl text-left transition-colors ${mode === 'practice' ? 'ring-2 ring-brand-500' : ''}`}
            style={{ border: '1px solid var(--border)' }}
          >
            <Zap size={16} style={{ color: '#22c55e' }} className="mb-1.5" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Practice</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Instant feedback + explanation</p>
          </button>
          <button
            onClick={() => setMode('test')}
            className={`p-3 rounded-xl text-left transition-colors ${mode === 'test' ? 'ring-2 ring-brand-500' : ''}`}
            style={{ border: '1px solid var(--border)' }}
          >
            <ClipboardList size={16} style={{ color: '#ef4444' }} className="mb-1.5" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Test</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Answers revealed at the end</p>
          </button>
        </div>
      </section>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleStart}
        disabled={isStarting || pool.length === 0 || selectedSubjectIds.length === 0}
        className="w-full py-3.5 rounded-2xl font-display font-bold text-white bg-brand-500 hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-glow"
      >
        {isStarting ? 'Starting…' : `Start ${mode === 'practice' ? 'Practice' : 'Test'} (${Math.min(questionCount, pool.length)} Q)`}
      </motion.button>
    </div>
  );
}
