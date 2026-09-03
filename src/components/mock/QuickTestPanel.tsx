import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ListChecks, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { useExamStore } from '../../store/examStore';
import { usePracticeSessionStore } from '../../store/practiceSessionStore';
import { getSubjectsForExam, getExam } from '../../services/examService';
import { getAvailableSubjects } from '../../services/questionRepository';
import { createQuestionPool, buildSessionQuestionIds } from '../../services/practiceService';
import type { UniversalQuestion } from '../../types/universalQuestion';
import type { PracticeConfiguration } from '../../types/practiceSession';

const CUSTOM_SECTIONAL_DURATIONS = [5, 10, 15, 20, 30];
const CUSTOM_FULL_DURATIONS = [30, 45, 60, 90, 120];

/**
 * The old flexible/configurable test builder (question count, duration,
 * subject) — extracted from the former standalone TestConfigurePage so it
 * can live as the "Quick Test" tab inside the canonical /mock-tests hub
 * instead of a second, competing Mock Test page (product spec: "There are
 * currently two competing mock/test experiences... this must be fixed").
 * Uses the flexible Practice engine, deliberately NOT the exam-locked Mock
 * engine — this is quick, adjustable practice under time pressure, not an
 * official simulation.
 */
export function QuickTestPanel() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const { session, startSession, clearSession } = usePracticeSessionStore();

  const exam = getExam(selectedExamId);
  const subjects = useMemo(() => getSubjectsForExam(selectedExamId), [selectedExamId]);

  const [contentSubjectIds, setContentSubjectIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    getAvailableSubjects(selectedExamId).then((avail) => {
      if (!cancelled) setContentSubjectIds(new Set(avail.map((a) => a.subjectId)));
    });
    return () => { cancelled = true; };
  }, [selectedExamId]);

  const [testType, setTestType] = useState<'sectional' | 'full'>('sectional');
  const [subjectId, setSubjectId] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(20);
  const [durationMinutes, setDurationMinutes] = useState<number | 'standard'>('standard');
  const [pool, setPool] = useState<UniversalQuestion[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Default to the first subject that actually has content once known.
  useEffect(() => {
    if (subjectId || contentSubjectIds.size === 0) return;
    const firstWithContent = subjects.find((s) => contentSubjectIds.has(s.id));
    if (firstWithContent) setSubjectId(firstWithContent.id);
  }, [contentSubjectIds, subjects, subjectId]);

  const subject = subjects.find((s) => s.id === subjectId);
  const subjectRef = exam?.subjects.find((s) => s.subjectId === subjectId);
  const sectionalConfig = subjectRef?.sectionalTest;

  // Reset selections sensibly whenever the test type or exam changes.
  useEffect(() => {
    if (testType === 'sectional') {
      setQuestionCount(sectionalConfig?.questionCounts[1] ?? 20);
      setDurationMinutes(sectionalConfig?.durationsMinutes[2] ?? 15);
    } else if (exam) {
      setQuestionCount(exam.mockConfig.questions);
      setDurationMinutes('standard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testType, subjectId, selectedExamId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPoolLoading(true);
      try {
        const config: PracticeConfiguration = {
          examId: selectedExamId,
          subjectIds: testType === 'sectional' ? (subjectId ? [subjectId] : []) : subjects.map((s) => s.id),
          mode: 'test',
          questionCount: 0,
          label: '',
        };
        const combined = testType === 'sectional' && !subjectId ? [] : await createQuestionPool(config);
        if (!cancelled) setPool(combined);
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testType, subjectId, selectedExamId, subjects]);

  if (!exam) {
    return (
      <div className="pt-8 text-center">
        <p style={{ color: 'var(--text-muted)' }}>No exam selected.</p>
        <button onClick={() => navigate('/exams')} className="btn-primary mt-4">Choose an Exam</button>
      </div>
    );
  }

  async function handleStart() {
    if (!exam) return;
    if (testType === 'sectional' && !subjectId) {
      toast.error('Pick a subject');
      return;
    }
    if (pool.length === 0) {
      toast.error('No questions available for this selection yet');
      return;
    }
    if (session && !session.isCompleted) {
      if (!window.confirm('You have an in-progress session. Starting a new test will discard it. Continue?')) return;
      clearSession();
    }

    setIsStarting(true);
    try {
      const count = Math.min(questionCount, pool.length);
      const minutes = durationMinutes === 'standard' ? exam.mockConfig.durationMinutes : durationMinutes;
      const label = testType === 'sectional' ? `${exam.name} — ${subject?.name}` : `${exam.name} Full Mock`;

      const config: PracticeConfiguration = {
        examId: exam.id,
        subjectIds: testType === 'sectional' ? [subjectId] : subjects.map((s) => s.id),
        mode: 'test',
        testType,
        questionCount: count,
        durationSeconds: minutes * 60,
        marking: exam.mockConfig.marking,
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
      {/* Test type */}
      <section className="card p-4">
        <h2 className="text-sm font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Test Type</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTestType('sectional')}
            className={`p-3 rounded-xl text-left transition-colors ${testType === 'sectional' ? 'ring-2 ring-brand-500' : ''}`}
            style={{ border: '1px solid var(--border)' }}
          >
            <ListChecks size={16} style={{ color: '#0ea5e9' }} className="mb-1.5" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Sectional</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>One subject at a time</p>
          </button>
          <button
            onClick={() => setTestType('full')}
            className={`p-3 rounded-xl text-left transition-colors ${testType === 'full' ? 'ring-2 ring-brand-500' : ''}`}
            style={{ border: '1px solid var(--border)' }}
          >
            <Layers size={16} style={{ color: '#a855f7' }} className="mb-1.5" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Full Mock</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {exam.mockConfig.questions} Q · {exam.mockConfig.durationMinutes} min
            </p>
          </button>
        </div>
      </section>

      {/* Subject (sectional only) */}
      {testType === 'sectional' && (
        <section className="card p-4">
          <h2 className="text-sm font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Subject</h2>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const hasContent = contentSubjectIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => hasContent && setSubjectId(s.id)}
                  disabled={!hasContent}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    subjectId === s.id ? 'bg-brand-500 text-white' : ''
                  }`}
                  style={subjectId !== s.id ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                >
                  {s.name}
                  {!hasContent && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}> · Coming Soon</span>}
                </button>
              );
            })}
            {subjects.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No subjects configured for this exam yet.</p>
            )}
          </div>
        </section>
      )}

      {/* Question count — options exceeding the real pool are disabled, not
          silently allowed then silently clamped (Phase 8.5 §27) */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Number of Questions</h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {poolLoading ? 'Checking…' : `${pool.length} available`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(testType === 'sectional' ? sectionalConfig?.questionCounts ?? [10, 20, 25, 50] : [exam.mockConfig.questions]).map((n) => (
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
        {/* §28: never silently run a smaller test under the configured label — say so plainly */}
        {testType === 'full' && !poolLoading && pool.length > 0 && pool.length < exam.mockConfig.questions && (
          <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>
            This exam's full mock is configured for {exam.mockConfig.questions} questions, but only {pool.length} are available in the content bank right now — this run will use all {pool.length}.
          </p>
        )}
      </section>

      {/* Timing */}
      <section className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
          <h2 className="text-sm font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Timing</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDurationMinutes('standard')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              durationMinutes === 'standard' ? 'bg-brand-500 text-white' : ''
            }`}
            style={durationMinutes !== 'standard' ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
          >
            {testType === 'sectional' ? 'Standard' : 'Exam Standard'} ({testType === 'sectional' ? sectionalConfig?.durationsMinutes[2] ?? 15 : exam.mockConfig.durationMinutes} min)
          </button>
          {(testType === 'sectional' ? sectionalConfig?.durationsMinutes ?? CUSTOM_SECTIONAL_DURATIONS : CUSTOM_FULL_DURATIONS).map((m) => (
            <button
              key={m}
              onClick={() => setDurationMinutes(m)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                durationMinutes === m ? 'bg-brand-500 text-white' : ''
              }`}
              style={durationMinutes !== m ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              {m} min
            </button>
          ))}
        </div>
      </section>

      {/* Marking scheme (informational — comes from exam config, not editable here) */}
      <section className="card p-4">
        <h2 className="text-sm font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Marking Scheme</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          +{exam.mockConfig.marking.marksPerCorrect} per correct
          {exam.mockConfig.marking.negativeMarks > 0 && `, −${exam.mockConfig.marking.negativeMarks} per incorrect`}
        </p>
      </section>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleStart}
        disabled={isStarting || pool.length === 0 || (testType === 'sectional' && !subjectId)}
        className="w-full py-3.5 rounded-2xl font-display font-bold text-white bg-brand-500 hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-glow"
      >
        {isStarting ? 'Starting…' : `Start Test (${Math.min(questionCount, pool.length)} Q · ${durationMinutes === 'standard' ? (testType === 'sectional' ? sectionalConfig?.durationsMinutes[2] ?? 15 : exam.mockConfig.durationMinutes) : durationMinutes} min)`}
      </motion.button>
    </div>
  );
}
