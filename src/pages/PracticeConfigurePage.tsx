import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Settings2, X, ListChecks, Zap, ClipboardList, Newspaper } from 'lucide-react';
import toast from 'react-hot-toast';
import { useExamStore } from '../store/examStore';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { examRegistry } from '../data/registry/examRegistry';
import { getSubjectsForExam } from '../services/examService';
import { getAvailableTopics, getAvailableSubjects, getRandomQuestions, type AvailableTopic } from '../services/questionRepository';
import { createQuestionPool } from '../services/practiceService';
import { getPracticeTests, describeTestSource, type PracticeTestDefinition } from '../services/practiceTestRepository';
import type { Difficulty } from '../types/universalQuestion';
import type { PracticeConfiguration } from '../types/practiceSession';

const COUNT_OPTIONS = [10, 20, 25, 50];
const DIFFICULTY_OPTIONS: { id: Difficulty | 'mixed'; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

// Practice by Topic (product-refactor §43-53): horizontal subject selector,
// a settings gear instead of controls occupying the main screen, and a real
// list of available tests/mocks per subject — not just abstract filters.
// Every "Start" button, whichever source the card came from, ends at the
// same universal session engine (§60-63).

export default function PracticeConfigurePage() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const exam = examRegistry.getExam(selectedExamId);
  const { session, startSession, clearSession } = usePracticeSessionStore();

  const subjects = getSubjectsForExam(selectedExamId);
  const [contentSubjectIds, setContentSubjectIds] = useState<Set<string>>(new Set());
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    getAvailableSubjects(selectedExamId).then((avail) => {
      if (!cancelled) setContentSubjectIds(new Set(avail.map((a) => a.subjectId)));
    });
    return () => { cancelled = true; };
  }, [selectedExamId]);

  useEffect(() => {
    if (selectedSubjectId || contentSubjectIds.size === 0) return;
    const first = subjects.find((s) => contentSubjectIds.has(s.id));
    if (first) setSelectedSubjectId(first.id);
  }, [contentSubjectIds, subjects, selectedSubjectId]);

  // Settings — applies to Quick Practice and to non-mock fixed tests when
  // started in Test mode. Fixed Exam Mocks always ignore these and use
  // their own marking/mode (§100-101).
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [questionCount, setQuestionCount] = useState(20);
  const [mode, setMode] = useState<'practice' | 'test'>('practice');

  const [topics, setTopics] = useState<AvailableTopic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [quickPool, setQuickPool] = useState(0);
  const [quickPoolLoading, setQuickPoolLoading] = useState(false);
  const [tests, setTests] = useState<PracticeTestDefinition[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!selectedSubjectId) return;
    let cancelled = false;
    getAvailableTopics(selectedExamId, selectedSubjectId).then((t) => { if (!cancelled) setTopics(t); });
    setSelectedTopicIds([]);
    return () => { cancelled = true; };
  }, [selectedSubjectId, selectedExamId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    let cancelled = false;
    setQuickPoolLoading(true);
    (async () => {
      const config: PracticeConfiguration = {
        examId: selectedExamId, subjectIds: [selectedSubjectId],
        topicId: selectedTopicIds.length === 1 ? selectedTopicIds[0] : undefined,
        difficulty, questionCount: 0, mode, label: '',
      };
      let pool = await createQuestionPool(config);
      if (selectedTopicIds.length > 1) pool = pool.filter((q) => q.topicId && selectedTopicIds.includes(q.topicId));
      if (!cancelled) setQuickPool(pool.length);
    })().finally(() => { if (!cancelled) setQuickPoolLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSubjectId, selectedTopicIds, difficulty, selectedExamId]);

  useEffect(() => {
    if (!selectedSubjectId) { setTests([]); return; }
    let cancelled = false;
    setTestsLoading(true);
    getPracticeTests(selectedExamId, selectedSubjectId).then((t) => { if (!cancelled) setTests(t); }).finally(() => { if (!cancelled) setTestsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSubjectId, selectedExamId]);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) => (prev.includes(topicId) ? prev.filter((t) => t !== topicId) : [...prev, topicId]));
  }

  async function guardActiveSession(): Promise<boolean> {
    if (session && !session.isCompleted) {
      if (!window.confirm('You have an in-progress session. Starting a new one will discard it. Continue?')) return false;
      clearSession();
    }
    return true;
  }

  async function handleStartQuickPractice() {
    if (!(await guardActiveSession())) return;
    if (quickPool === 0) { toast.error('No questions available for this selection yet'); return; }
    setIsStarting(true);
    try {
      const subject = subjects.find((s) => s.id === selectedSubjectId);
      const config: PracticeConfiguration = {
        examId: selectedExamId, subjectIds: [selectedSubjectId],
        topicId: selectedTopicIds.length === 1 ? selectedTopicIds[0] : undefined,
        difficulty, questionCount: Math.min(questionCount, quickPool), mode,
        label: subject?.name ?? 'Practice',
      };
      let pool = await createQuestionPool(config);
      if (selectedTopicIds.length > 1) pool = pool.filter((q) => q.topicId && selectedTopicIds.includes(q.topicId));
      const picked = await getRandomQuestions(config.questionCount, pool);
      startSession(config, picked.map((q) => q.id));
      navigate('/session');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStartTest(test: PracticeTestDefinition) {
    if (!(await guardActiveSession())) return;
    setIsStarting(true);
    try {
      const useTestMode = test.isFixedMock || mode === 'test';
      const config: PracticeConfiguration = {
        examId: test.examId,
        subjectIds: [test.subjectId],
        questionCount: test.questionCount,
        mode: useTestMode ? 'test' : 'practice',
        label: test.title,
        ...(useTestMode
          ? {
              marking: exam?.mockConfig.marking ?? { marksPerCorrect: 1, negativeMarks: 0 },
              // No per-file duration metadata for mocks/chapter tests yet — a
              // reasonable 90s/question default rather than the exam's full
              // mock duration, which would be misleadingly generous for a
              // short set. Documented simplification, not a hidden guess.
              durationSeconds: Math.max(300, test.questionCount * 90),
              testType: test.isFixedMock ? 'sectional' : undefined,
            }
          : {}),
      };
      startSession(config, test.questionIds);
      navigate('/session');
    } finally {
      setIsStarting(false);
    }
  }

  if (!exam) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center">
        <p style={{ color: 'var(--text-muted)' }}>No exam selected.</p>
        <button onClick={() => navigate('/exams')} className="btn-primary mt-4">Choose an Exam</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Practice by Topic</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{exam.name}</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Practice settings"
        >
          <Settings2 size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      {/* Horizontal subject selector — scrolls, never wraps (§44) */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {subjects.map((subject) => {
          const hasContent = contentSubjectIds.has(subject.id) || subject.id === 'current-affairs';
          const active = selectedSubjectId === subject.id;
          return (
            <button
              key={subject.id}
              onClick={() => hasContent && setSelectedSubjectId(subject.id)}
              disabled={!hasContent}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                active ? 'bg-brand-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/10'
              }`}
              style={!active ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              {subject.name}
            </button>
          );
        })}
      </div>

      {selectedSubjectId === 'current-affairs' ? (
        <div className="card p-5 flex items-start gap-3">
          <Newspaper size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Current Affairs has its own hub</p>
            <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Daily quiz, chapters, and mixed revision live together there.</p>
            <button onClick={() => navigate('/current-affairs')} className="btn-primary text-sm py-2 px-4">Open Current Affairs</button>
          </div>
        </div>
      ) : !selectedSubjectId ? (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pick a subject above to get started.</p>
        </div>
      ) : (
        <>
          {/* Quick Practice — topic multi-select + Start, using current settings */}
          <section className="card p-4">
            <h2 className="text-sm font-display font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Zap size={14} className="text-teal-500" /> Quick Practice
            </h2>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {topics.map((topic) => {
                  const active = selectedTopicIds.includes(topic.topicId);
                  return (
                    <button
                      key={topic.topicId}
                      onClick={() => toggleTopic(topic.topicId)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                        active ? 'bg-brand-500 text-white' : ''
                      }`}
                      style={!active ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                    >
                      {active && <Check size={10} />}
                      {topic.topicName} ({topic.questionCount})
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {quickPoolLoading ? 'Checking…' : `${quickPool} available · ${DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.label} · ${mode === 'practice' ? 'Practice' : 'Test'}`}
              </span>
              <button onClick={handleStartQuickPractice} disabled={isStarting || quickPool === 0} className="btn-primary text-sm py-2 px-5 disabled:opacity-40">
                Start ({Math.min(questionCount, quickPool)})
              </button>
            </div>
          </section>

          {/* Available Tests — all three sources, normalized, grouped */}
          <section>
            <h2 className="text-sm font-display font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <ListChecks size={14} className="text-purple-500" /> Available Tests
            </h2>
            {testsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="card h-20 shimmer" style={{ background: 'var(--border)' }} />)}
              </div>
            ) : tests.length === 0 ? (
              <div className="card p-5 text-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No named tests for this subject yet — try Quick Practice above.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {tests.map((test, i) => (
                  <motion.div
                    key={test.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="card p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-display font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{test.title}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
                          {describeTestSource(test.source)}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {test.questionCount} Questions · {test.difficulty === 'mixed' ? 'Mixed' : test.difficulty}
                        {test.isFixedMock && ' · Timed'}
                      </p>
                    </div>
                    <button onClick={() => handleStartTest(test)} disabled={isStarting} className="btn-secondary text-sm py-2 px-4 flex-shrink-0 disabled:opacity-40">
                      Start
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Settings bottom sheet (§48-51) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="card p-6 w-full sm:max-w-sm rounded-b-none sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>Practice Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close">
                  <X size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Difficulty</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDifficulty(opt.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${difficulty === opt.id ? 'bg-brand-500 text-white' : ''}`}
                    style={difficulty !== opt.id ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Number of Questions</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    disabled={quickPool > 0 && n > quickPool}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${questionCount === n ? 'bg-brand-500 text-white' : ''}`}
                    style={questionCount !== n ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    {n}
                  </button>
                ))}
                {quickPool > 0 && (
                  <button
                    onClick={() => setQuestionCount(quickPool)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${questionCount === quickPool ? 'bg-brand-500 text-white' : ''}`}
                    style={questionCount !== quickPool ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    All Available ({quickPool})
                  </button>
                )}
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Mode</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                <button
                  onClick={() => setMode('practice')}
                  className={`p-3 rounded-xl text-left transition-colors ${mode === 'practice' ? 'ring-2 ring-brand-500' : ''}`}
                  style={{ border: '1px solid var(--border)' }}
                >
                  <Zap size={14} style={{ color: '#22c55e' }} className="mb-1" />
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Practice</p>
                </button>
                <button
                  onClick={() => setMode('test')}
                  className={`p-3 rounded-xl text-left transition-colors ${mode === 'test' ? 'ring-2 ring-brand-500' : ''}`}
                  style={{ border: '1px solid var(--border)' }}
                >
                  <ClipboardList size={14} style={{ color: '#ef4444' }} className="mb-1" />
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Test</p>
                </button>
              </div>

              <button onClick={() => setShowSettings(false)} className="btn-primary w-full py-2.5">Apply</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
