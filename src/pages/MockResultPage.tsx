import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Circle, Clock, ArrowLeft } from 'lucide-react';
import { useMockSessionStore } from '../store/mockSessionStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { calculateMockResult } from '../services/mockScoringService';
import { formatTime } from '../utils';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockResult } from '../types/mockSession';

type Tab = 'overview' | 'sections' | 'review';
type ReviewFilter = 'all' | 'correct' | 'incorrect' | 'unattempted' | 'marked';

export default function MockResultPage() {
  const { mockId } = useParams<{ mockId: string }>();
  const navigate = useNavigate();
  const { session, clearSession } = useMockSessionStore();

  const [questionsById, setQuestionsById] = useState<Map<string, UniversalQuestion>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<ReviewFilter>('all');

  useEffect(() => {
    if (!session || session.mockDefinitionId !== mockId || session.status !== 'completed') {
      navigate('/mock-tests', { replace: true });
    }
  }, [session, mockId, navigate]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const allIds = session.sections.flatMap((s) => s.questionIds);
    resolveQuestionsByIds(allIds).then((qs) => {
      if (cancelled) return;
      setQuestionsById(new Map(qs.map((q) => [q.id, q])));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [session]);

  const result: MockResult | null = useMemo(() => {
    if (!session || !loaded) return null;
    return calculateMockResult(session, questionsById);
  }, [session, loaded, questionsById]);

  if (!session || !result) {
    return <div className="max-w-3xl mx-auto pt-10"><div className="card h-64 shimmer" style={{ background: 'var(--border)' }} /></div>;
  }

  function handleAttemptAgain() {
    clearSession();
    navigate(`/mock-tests/${mockId}/start`);
  }

  return (
    <div className="max-w-4xl mx-auto pt-4 pb-10 space-y-4">
      <button onClick={() => navigate('/mock-tests')} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={14} /> Back to Mock Tests
      </button>

      <div className="card p-5 sm:p-6 text-center">
        <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>Test Completed</p>
        <h1 className="font-display text-lg sm:text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{result.title}</h1>
        <p className="font-display text-3xl sm:text-4xl font-bold mt-4" style={{ color: 'var(--text-primary)' }}>{result.marks} <span className="text-lg font-medium" style={{ color: 'var(--text-muted)' }}>/ {result.maxMarks}</span></p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Accuracy: {result.accuracy}%</p>

        <div className="grid grid-cols-4 gap-2 mt-5 text-center">
          <MiniStat icon={<CheckCircle2 size={14} className="text-green-500" />} value={result.correct} label="Correct" />
          <MiniStat icon={<XCircle size={14} className="text-red-500" />} value={result.incorrect} label="Incorrect" />
          <MiniStat icon={<Circle size={14} style={{ color: 'var(--text-muted)' }} />} value={result.unattempted} label="Unattempted" />
          <MiniStat icon={<Clock size={14} className="text-brand-500" />} value={formatTime(result.timeTakenSeconds)} label="Time Used" />
        </div>
      </div>

      <div className="flex gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--border)' }}>
        {(['overview', 'sections', 'review'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors"
            style={tab === t ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
          >
            {t === 'sections' ? 'Section Analysis' : t === 'review' ? 'Question Review' : 'Overview'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card p-5 space-y-3">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Section Performance</h2>
          {result.sections.map((s) => (
            <div key={s.sectionId} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{s.title}</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{s.marks} / {s.maxMarks}</span>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setTab('review')} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--text-primary)' }}>Review Answers</button>
            <button onClick={() => setTab('sections')} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--text-primary)' }}>View Analysis</button>
          </div>
          <button onClick={handleAttemptAgain} className="btn-primary w-full text-sm">Attempt Again</button>
        </div>
      )}

      {tab === 'sections' && (
        <div className="space-y-3">
          {result.sections.map((s) => (
            <div key={s.sectionId} className="card p-4 sm:p-5">
              <h3 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>{s.title}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center text-xs">
                <SectionStat value={`${s.marks}/${s.maxMarks}`} label="Score" />
                <SectionStat value={s.correct} label="Correct" />
                <SectionStat value={s.incorrect} label="Incorrect" />
                <SectionStat value={s.unattempted} label="Unattempted" />
                <SectionStat value={`${s.accuracy}%`} label="Accuracy" />
                <SectionStat value={formatTime(s.timeUsedSeconds)} label="Time Used" />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'review' && (
        <ReviewTab session={session} questionsById={questionsById} filter={filter} setFilter={setFilter} />
      )}
    </div>
  );
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1 mb-0.5">{icon}<span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span></div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function SectionStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function ReviewTab({
  session, questionsById, filter, setFilter,
}: {
  session: NonNullable<ReturnType<typeof useMockSessionStore.getState>['session']>;
  questionsById: Map<string, UniversalQuestion>;
  filter: ReviewFilter;
  setFilter: (f: ReviewFilter) => void;
}) {
  const allIds = session.sections.flatMap((s) => s.questionIds);

  const filtered = allIds.filter((qid) => {
    const state = session.states[qid];
    const q = questionsById.get(qid);
    if (!state || !q) return false;
    const isCorrect = state.selectedAnswer === q.correctAnswer;
    const isAnswered = state.selectedAnswer !== null;
    switch (filter) {
      case 'correct': return isAnswered && isCorrect;
      case 'incorrect': return isAnswered && !isCorrect;
      case 'unattempted': return !isAnswered;
      case 'marked': return state.isMarkedForReview;
      default: return true;
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['all', 'correct', 'incorrect', 'unattempted', 'marked'] as ReviewFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
            style={filter === f ? { background: 'var(--brand-500, #6366f1)', color: '#fff' } : { background: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No questions match this filter.</div>
      ) : (
        filtered.map((qid, i) => {
          const q = questionsById.get(qid)!;
          const state = session.states[qid];
          const selectedOption = q.options.find((o) => o.id === state.selectedAnswer);
          const correctOption = q.options.find((o) => o.id === q.correctAnswer);
          const isCorrect = state.selectedAnswer === q.correctAnswer;
          return (
            <div key={qid} className="card p-4 sm:p-5">
              <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Question {i + 1}</p>
              <p className="text-sm font-medium mb-3 whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>{q.question}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-2">
                <span style={{ color: state.selectedAnswer ? (isCorrect ? '#22c55e' : '#ef4444') : 'var(--text-muted)' }}>
                  Your answer: {selectedOption ? `${selectedOption.id}. ${selectedOption.text}` : 'Not attempted'}
                </span>
                {!isCorrect && <span className="text-green-500">Correct answer: {correctOption ? `${correctOption.id}. ${correctOption.text}` : '—'}</span>}
              </div>
              {q.explanation && <p className="text-xs mt-2 p-2.5 rounded-lg" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{q.explanation}</p>}
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Time spent: {state.timeSpentSeconds}s</p>
            </div>
          );
        })
      )}
    </div>
  );
}
