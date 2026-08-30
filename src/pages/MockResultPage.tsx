import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Download, Trophy, Target, TrendingUp, Gauge, BarChart3, Layers,
  PieChart as PieChartIcon, ListChecks, History, BookOpenCheck, AlertTriangle, Smile,
} from 'lucide-react';
import { getMockDefinition } from '../services/mockDefinitionRepository';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { mockAttemptsDB } from '../services/db';
import { analyzeMockAttempt } from '../services/mockAnalysisService';
import { downloadMockReport } from '../services/mockReportExportService';
import { formatDuration } from '../utils';
import { CollapsibleSection } from '../components/mock-analysis/CollapsibleSection';
import { AnalysisDonutChart, AnalysisBarChart } from '../components/mock-analysis/AnalysisCharts';
import { SolutionsReview } from '../components/mock-analysis/SolutionsReview';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockDefinition } from '../types/examMock';
import type { MockAnalysis } from '../types/mockAnalysis';

type LoadState = 'loading' | 'ready' | 'not-found';

export default function MockResultPage() {
  const { mockId, attemptId } = useParams<{ mockId: string; attemptId?: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>('loading');
  const [notFoundReason, setNotFoundReason] = useState<string>('');
  const [definition, setDefinition] = useState<MockDefinition | null>(null);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!mockId) { setState('not-found'); setNotFoundReason('No mock was specified.'); return; }

      const def = await getMockDefinition(mockId);
      if (!def) {
        if (!cancelled) { setState('not-found'); setNotFoundReason("This mock couldn't be found — it may have been removed or renamed."); }
        return;
      }

      const attempt = attemptId ? await mockAttemptsDB.get(attemptId) : await mockAttemptsDB.getMostRecentForMock(mockId);
      if (!attempt) {
        if (!cancelled) { setState('not-found'); setNotFoundReason(attemptId ? 'This attempt is no longer available on this device.' : "You haven't completed this test yet."); }
        return;
      }

      const allIds = attempt.sections.flatMap((s) => s.questionIds);
      const questions = await resolveQuestionsByIds(allIds);
      const questionsById = new Map<string, UniversalQuestion>(questions.map((q) => [q.id, q]));

      const result = await analyzeMockAttempt(attempt, def, questionsById);
      if (cancelled) return;
      setDefinition(def);
      setAnalysis(result);
      setState('ready');
    }

    load();
    return () => { cancelled = true; };
  }, [mockId, attemptId]);

  if (state === 'loading') {
    return (
      <div className="max-w-4xl mx-auto pt-6 pb-10 space-y-3">
        <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} />
        <div className="card h-64 shimmer" style={{ background: 'var(--border)' }} />
      </div>
    );
  }

  if (state === 'not-found' || !analysis || !definition) {
    return (
      <div className="max-w-lg mx-auto pt-16 text-center px-4">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-500" />
        <h1 className="font-display font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Result not available</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{notFoundReason}</p>
        <button onClick={() => navigate('/mock-tests')} className="btn-primary px-5 py-2.5 text-sm">Back to Mock Tests</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-4 pb-12 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('/mock-tests')} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="font-display font-semibold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>Test Analysis</h1>
        <button
          onClick={() => downloadMockReport(analysis)}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <Download size={14} /> <span className="hidden sm:inline">Download Report</span>
        </button>
      </div>

      {/* Test title */}
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{analysis.title}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Completed {new Date(analysis.completedAt).toLocaleString()}</p>
      </div>

      {/* Top summary — real data only; rank/percentile/cutoff show honest "unavailable" states */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard icon={<Trophy size={15} />} label="All India Rank" value={analysis.ranking ? `${analysis.ranking.rank} / ${analysis.ranking.totalParticipants}` : 'Unavailable'} hint={analysis.ranking ? undefined : 'Needs comparison data'} />
        <SummaryCard icon={<Target size={15} />} label="Your Marks" value={`${analysis.summary.score} / ${analysis.summary.maxScore}`} hint={`${analysis.summary.percentage.toFixed(1)}%`} />
        <SummaryCard icon={<TrendingUp size={15} />} label="Percentile" value={analysis.percentile !== undefined ? String(analysis.percentile) : 'Not available'} />
        <SummaryCard icon={<Layers size={15} />} label="Cut-off" value={analysis.cutoff && (analysis.cutoff.min !== undefined || analysis.cutoff.max !== undefined) ? `${analysis.cutoff.min ?? '—'}–${analysis.cutoff.max ?? '—'}` : 'Unavailable'} />
        <SummaryCard icon={<Gauge size={15} />} label="Accuracy" value={analysis.summary.accuracy !== null ? `${analysis.summary.accuracy.toFixed(2)}%` : 'N/A'} />
        <SummaryCard icon={<Smile size={15} />} label="Overview" value={analysis.overview.rating} />
      </div>

      <div className="card p-4 sm:p-5">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{analysis.overview.message}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Correct: <b style={{ color: '#22c55e' }}>{analysis.summary.correct}</b></span>
          <span>Incorrect: <b style={{ color: '#ef4444' }}>{analysis.summary.incorrect}</b></span>
          <span>Unattempted: <b>{analysis.summary.unattempted}</b></span>
          <span>Time: <b>{formatDuration(analysis.summary.timeTakenSeconds)}</b></span>
        </div>
      </div>

      {/* Subject Performance */}
      <CollapsibleSection title="Subject Performance" subtitle={`${analysis.subjectPerformance.length} subjects`} icon={<BarChart3 size={18} />} defaultOpen>
        <AnalysisBarChart
          data={analysis.subjectPerformance.map((s) => ({ label: s.subjectName, value: s.marks, maxValue: s.maxMarks }))}
          valueLabel="Your Score" maxLabel="Max Marks"
        />
        <div className="mt-4 space-y-3">
          {analysis.subjectPerformance.map((s) => (
            <div key={s.subjectId} className="flex items-center justify-between text-xs border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{s.subjectName}</p>
                <p style={{ color: 'var(--text-muted)' }}>{s.attempted}/{s.questionCount} attempted · {s.correct} correct · {s.incorrect} incorrect</p>
              </div>
              <div className="text-right">
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.marks}/{s.maxMarks}</p>
                <p style={{ color: 'var(--text-muted)' }}>{s.accuracy !== null ? `${s.accuracy}% acc.` : 'N/A'} · {formatDuration(s.timeSpentSeconds)}</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Speed Analysis */}
      <CollapsibleSection title="Speed Analysis" subtitle="Pacing across the test" icon={<Gauge size={18} />}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--border)' }}>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{analysis.speed.questionsPerMinute ?? 'N/A'}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Questions / min</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--border)' }}>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{analysis.speed.averageTimePerQuestionSeconds ?? 'N/A'}s</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg time / question</p>
          </div>
        </div>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>By subject</p>
        <div className="space-y-1.5 mb-4">
          {analysis.speed.bySubject.map((s) => (
            <div key={s.subjectId} className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-secondary)' }}>{s.subjectName}</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.avgTimePerQuestionSeconds}s/question</span>
            </div>
          ))}
        </div>
        {analysis.speed.byDifficulty.length > 0 && (
          <>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>By difficulty</p>
            <div className="grid grid-cols-3 gap-2">
              {analysis.speed.byDifficulty.map((d) => (
                <div key={d.difficulty} className="rounded-lg p-2 text-center" style={{ background: 'var(--border)' }}>
                  <p className="text-sm font-bold capitalize" style={{ color: 'var(--text-primary)' }}>{d.avgTimeSeconds}s</p>
                  <p className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{d.difficulty}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* Strong vs Weak Areas */}
      <CollapsibleSection title="Strong vs Weak Areas" icon={<TrendingUp size={18} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#22c55e' }}>STRONG</p>
            {analysis.strongAreas.subjects.length === 0 && analysis.strongAreas.topics.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not enough data yet to call out strengths confidently.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...analysis.strongAreas.subjects, ...analysis.strongAreas.topics].map((a) => (
                  <span key={a.id} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>{a.name}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#ef4444' }}>WEAK</p>
            {analysis.weakAreas.subjects.length === 0 && analysis.weakAreas.topics.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No clear weak areas identified.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...analysis.weakAreas.subjects, ...analysis.weakAreas.topics].map((a) => (
                  <span key={a.id} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>{a.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Topic-wise Performance */}
      <CollapsibleSection title="Topic-wise Performance" subtitle={`${analysis.topicPerformance.length} topics`} icon={<Layers size={18} />}>
        <div className="space-y-2.5">
          {analysis.topicPerformance.map((t) => (
            <div key={`${t.subjectId}::${t.topicId}`} className="flex items-center justify-between text-xs border-b last:border-0 pb-2.5" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.topicName}</p>
                <p style={{ color: 'var(--text-muted)' }}>{t.attempted}/{t.questionCount} attempted · {t.correct} correct</p>
              </div>
              <div className="text-right">
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.accuracy !== null ? `${t.accuracy}%` : 'N/A'}</p>
                <p style={{ color: 'var(--text-muted)' }}>{t.avgTimePerQuestionSeconds}s avg</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Time Distribution */}
      <CollapsibleSection title="Time Distribution" subtitle="Where your time went, by subject" icon={<PieChartIcon size={18} />}>
        <AnalysisDonutChart data={analysis.timeDistribution.map((t) => ({ name: t.subjectName, value: t.timeSpentSeconds }))} />
      </CollapsibleSection>

      {/* Question Preference */}
      <CollapsibleSection title="Question Preference" subtitle="How you engaged with questions" icon={<ListChecks size={18} />}>
        <AnalysisDonutChart
          data={[
            { name: 'Answered', value: analysis.questionPreference.answered, color: '#22c55e' },
            { name: 'Answered + Marked', value: analysis.questionPreference.answeredAndMarked, color: '#8b5cf6' },
            { name: 'Marked only', value: analysis.questionPreference.markedOnly, color: '#f59e0b' },
            { name: 'Skipped', value: analysis.questionPreference.visitedNotAnswered, color: '#94a3b8' },
            { name: 'Not visited', value: analysis.questionPreference.notVisited, color: '#e2e8f0' },
          ]}
        />
      </CollapsibleSection>

      {/* Subject Preference */}
      <CollapsibleSection title="Subject Preference" subtitle="Attempt behavior, not performance" icon={<BookOpenCheck size={18} />}>
        <div className="space-y-2.5">
          {analysis.subjectPreference.map((p) => (
            <div key={p.subjectId} className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-secondary)' }}>{p.subjectName}</span>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }}>{p.attemptRate}% attempted</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    background: p.label === 'High' ? 'rgba(34,197,94,0.12)' : p.label === 'Medium' ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.15)',
                    color: p.label === 'High' ? '#16a34a' : p.label === 'Medium' ? '#b45309' : '#64748b',
                  }}
                >
                  {p.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Historical Comparison */}
      {analysis.historicalComparison && (
        <CollapsibleSection title="Historical Comparison" subtitle={`vs your ${analysis.historicalComparison.previousAttemptCount} previous attempt(s)`} icon={<History size={18} />}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--border)' }}>
              <p className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Time Taken</p>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatDuration(analysis.historicalComparison.timeTakenSeconds.current)}</p>
              <p className="text-[11px]" style={{ color: analysis.historicalComparison.timeTakenSeconds.changeSeconds <= 0 ? '#22c55e' : '#ef4444' }}>
                {analysis.historicalComparison.timeTakenSeconds.changeSeconds <= 0 ? 'Faster' : 'Slower'} by {formatDuration(Math.abs(analysis.historicalComparison.timeTakenSeconds.changeSeconds))}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--border)' }}>
              <p className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Previous Average Time</p>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatDuration(analysis.historicalComparison.timeTakenSeconds.previousAverage)}</p>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Solutions */}
      <CollapsibleSection title="Solutions" subtitle={`${analysis.solutions.length} questions`} icon={<BookOpenCheck size={18} />}>
        <SolutionsReview solutions={analysis.solutions} />
      </CollapsibleSection>
    </div>
  );
}

function SummaryCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--brand-500, #6366f1)' }}>
        {icon}
        <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
      <p className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
