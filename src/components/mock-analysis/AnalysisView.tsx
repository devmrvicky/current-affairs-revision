import { type ReactNode } from 'react';
import {
  Trophy, Target, TrendingUp, Gauge, BarChart3, Layers, PieChart as PieChartIcon, ListChecks,
  History, BookOpenCheck, Smile, Clock, Lightbulb, CheckCircle2, Info,
} from 'lucide-react';
import { formatDuration } from '../../utils';
import { CollapsibleSection } from './CollapsibleSection';
import { AnalysisDonutChart, AnalysisBarChart } from './AnalysisCharts';
import { SolutionsReview } from './SolutionsReview';
import type { AreaPerformance, MockAnalysis, TimedQuestionRef } from '../../types/mockAnalysis';

interface AnalysisViewProps {
  analysis: MockAnalysis;
  /** 'mock' shows rank/percentile/cut-off cards (honest "unavailable" states); 'practice' shows what a practice session can know. */
  variant: 'mock' | 'practice';
}

/**
 * The one analysis dashboard, rendered for a finished Full/Sectional Mock AND a finished Practice/Test
 * session — both produce the same MockAnalysis. Sections are collapsible so small screens get a
 * scannable page; anything that depends on data the attempt never recorded says so instead of showing zeros.
 */
export function AnalysisView({ analysis, variant }: AnalysisViewProps) {
  const { summary, timeInsights, recommendations, dataAvailability } = analysis;
  const scoring = summary.scoringApplicable !== false;
  const multiSubject = analysis.subjectPerformance.length > 1;
  const avgPerQuestion = timeInsights?.averageSeconds ?? analysis.speed.averageTimePerQuestionSeconds;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {variant === 'mock' ? (
          <>
            <SummaryCard icon={<Trophy size={15} />} label="All India Rank" value={analysis.ranking ? `${analysis.ranking.rank} / ${analysis.ranking.totalParticipants}` : 'Unavailable'} hint={analysis.ranking ? undefined : 'Needs comparison data'} />
            <SummaryCard icon={<Target size={15} />} label="Your Marks" value={`${summary.score} / ${summary.maxScore}`} hint={`${summary.percentage.toFixed(1)}%`} />
            <SummaryCard icon={<TrendingUp size={15} />} label="Percentile" value={analysis.percentile !== undefined ? String(analysis.percentile) : 'Not available'} />
            <SummaryCard icon={<Layers size={15} />} label="Cut-off" value={analysis.cutoff && (analysis.cutoff.min !== undefined || analysis.cutoff.max !== undefined) ? `${analysis.cutoff.min ?? '—'}–${analysis.cutoff.max ?? '—'}` : 'Unavailable'} />
            <SummaryCard icon={<Gauge size={15} />} label="Accuracy" value={summary.accuracy !== null ? `${summary.accuracy.toFixed(2)}%` : 'N/A'} />
            <SummaryCard icon={<Smile size={15} />} label="Overview" value={analysis.overview.rating} />
          </>
        ) : (
          <>
            <SummaryCard
              icon={<Target size={15} />}
              label={scoring ? 'Score' : 'Correct'}
              value={scoring ? `${summary.score} / ${summary.maxScore}` : `${summary.correct} / ${summary.totalQuestions}`}
              hint={scoring ? `${summary.percentage.toFixed(1)}%` : `${Math.round((summary.correct / Math.max(1, summary.totalQuestions)) * 100)}% of all questions`}
            />
            <SummaryCard icon={<Gauge size={15} />} label="Accuracy" value={summary.accuracy !== null ? `${summary.accuracy.toFixed(1)}%` : 'N/A'} hint={summary.accuracy !== null ? `of ${summary.attempted} attempted` : 'Nothing attempted'} />
            <SummaryCard icon={<ListChecks size={15} />} label="Attempted" value={`${summary.attempted} / ${summary.totalQuestions}`} hint={`${summary.unattempted} unanswered`} />
            <SummaryCard icon={<Clock size={15} />} label="Total time" value={formatDuration(summary.timeTakenSeconds)} />
            <SummaryCard icon={<Clock size={15} />} label="Avg / question" value={avgPerQuestion !== null && avgPerQuestion !== undefined ? `${avgPerQuestion}s` : 'Unavailable'} hint={dataAvailability && !dataAvailability.perQuestionTime ? 'No per-question time recorded' : undefined} />
            <SummaryCard icon={<Smile size={15} />} label="Overview" value={analysis.overview.rating} />
          </>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{analysis.overview.message}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Correct: <b style={{ color: '#22c55e' }} data-testid="an-correct">{summary.correct}</b></span>
          <span>Incorrect: <b style={{ color: '#ef4444' }} data-testid="an-incorrect">{summary.incorrect}</b></span>
          <span>Unattempted: <b data-testid="an-unattempted">{summary.unattempted}</b></span>
          {scoring && summary.incorrect > 0 && <span>Negative marks: <b style={{ color: '#ef4444' }}>{Math.round((summary.correct - summary.score) * 100) / 100}</b></span>}
          <span>Time: <b>{formatDuration(summary.timeTakenSeconds)}</b></span>
        </div>
      </div>

      {recommendations && (
        <CollapsibleSection title="Revision plan" subtitle="Based on how you did on each topic in this test" icon={<Lightbulb size={18} />} defaultOpen>
          <RevisionPlan recommendations={recommendations} multiTopic={analysis.topicPerformance.length > 1} />
        </CollapsibleSection>
      )}

      {(variant === 'mock' || multiSubject) && (
        <CollapsibleSection title="Subject Performance" subtitle={`${analysis.subjectPerformance.length} subject${analysis.subjectPerformance.length === 1 ? '' : 's'}`} icon={<BarChart3 size={18} />} defaultOpen={variant === 'mock'}>
          <AnalysisBarChart
            data={analysis.subjectPerformance.map((s) => ({ label: s.subjectName, value: s.marks, maxValue: s.maxMarks }))}
            valueLabel={scoring ? 'Your Score' : 'Correct'} maxLabel={scoring ? 'Max Marks' : 'Questions'}
          />
          <div className="mt-4 space-y-3">
            {analysis.subjectPerformance.map((s) => (
              <div key={s.subjectId} className="flex items-center justify-between text-xs border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{s.subjectName}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{s.attempted}/{s.questionCount} attempted · {s.correct} correct · {s.incorrect} incorrect</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{scoring ? `${s.marks}/${s.maxMarks}` : `${s.correct}/${s.questionCount}`}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{s.accuracy !== null ? `${s.accuracy}% acc.` : 'N/A'}{dataAvailability?.perQuestionTime !== false && <> · {formatDuration(s.timeSpentSeconds)}</>}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Topic-wise Performance" subtitle={`${analysis.topicPerformance.length} topic${analysis.topicPerformance.length === 1 ? '' : 's'}`} icon={<Layers size={18} />} defaultOpen={variant === 'practice'}>
        <div className="space-y-3">
          {analysis.topicPerformance.map((t) => (
            <div key={`${t.subjectId}::${t.topicId}`} className="text-xs border-b last:border-0 pb-3" style={{ borderColor: 'var(--border)' }} data-testid="topic-row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.topicName}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{t.correct} correct · {t.incorrect} incorrect · {t.unattempted} unanswered</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.accuracy !== null ? `${t.accuracy}%` : 'N/A'}</p>
                  {dataAvailability?.perQuestionTime !== false && t.avgTimePerQuestionSeconds > 0 && <p style={{ color: 'var(--text-muted)' }}>{t.avgTimePerQuestionSeconds}s avg</p>}
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--border)' }} aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${t.questionCount > 0 ? (t.correct / t.questionCount) * 100 : 0}%`, background: '#22c55e' }} />
              </div>
              {t.questionCount < 3 && <p className="mt-1 italic" style={{ color: 'var(--text-muted)' }}>Only {t.questionCount} question{t.questionCount === 1 ? '' : 's'} — not enough to judge this topic.</p>}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {timeInsights && (
        <CollapsibleSection title="Time analysis" subtitle="Where your time went, question by question" icon={<Clock size={18} />}>
          <TimeAnalysis analysis={analysis} />
        </CollapsibleSection>
      )}

      {variant === 'mock' && (
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
      )}

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

      {(variant === 'mock' || multiSubject) && (
        <CollapsibleSection title="Time Distribution" subtitle="Where your time went, by subject" icon={<PieChartIcon size={18} />}>
          <AnalysisDonutChart data={analysis.timeDistribution.map((t) => ({ name: t.subjectName, value: t.timeSpentSeconds }))} />
        </CollapsibleSection>
      )}

      {dataAvailability?.visitedState !== false && (
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
      )}

      {variant === 'mock' && (
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
      )}

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

      <CollapsibleSection title="Solutions" subtitle={`${analysis.solutions.length} questions — filter by incorrect, unanswered, slow or marked`} icon={<BookOpenCheck size={18} />}>
        <SolutionsReview solutions={analysis.solutions} slowThresholdSeconds={timeInsights?.available && !timeInsights.tooFewToJudge ? timeInsights.slowThresholdSeconds : null} timingAvailable={dataAvailability?.perQuestionTime !== false} />
      </CollapsibleSection>
    </div>
  );
}

function SummaryCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
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

function AreaList({ title, tone, items, why }: { title: string; tone: string; items: AreaPerformance[]; why: (a: AreaPerformance) => string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color: tone }}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.id} className="text-xs flex items-start justify-between gap-3">
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{a.name}</span>
            <span className="text-right" style={{ color: 'var(--text-muted)' }}>{why(a)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevisionPlan({ recommendations, multiTopic }: { recommendations: NonNullable<MockAnalysis['recommendations']>; multiTopic: boolean }) {
  const { needsRevision, needsPractice, reviseLess, insufficient } = recommendations;
  const anyJudgement = needsRevision.length + needsPractice.length + reviseLess.length > 0;
  return (
    <div className="space-y-4">
      {!anyJudgement && (
        <p className="text-xs flex items-start gap-2" style={{ color: 'var(--text-muted)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          {multiTopic
            ? 'No topic had enough questions in this test (at least 3) to call it strong or weak yet. Take more tests on these topics to build a reliable picture.'
            : 'This test is too short to rate any topic reliably (at least 3 questions per topic are needed).'}
        </p>
      )}
      <AreaList title="Revise these first — attempted but mostly wrong" tone="#ef4444" items={needsRevision} why={(a) => `${a.accuracy}% correct of ${a.questionCount}`} />
      <AreaList title="Needs more practice — skipped a lot, or only moderate accuracy" tone="#f59e0b" items={needsPractice} why={(a) => `${a.accuracy}% correct · ${a.attemptRate}% attempted`} />
      <AreaList title="Strong — can be revised less often" tone="#22c55e" items={reviseLess} why={(a) => `${a.accuracy}% correct of ${a.questionCount}`} />
      {insufficient.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />
          Not enough questions to judge: {insufficient.map((i) => `${i.name} (${i.questionCount})`).join(', ')}.
        </p>
      )}
    </div>
  );
}

function QuestionChips({ items, empty }: { items: TimedQuestionRef[]; empty: string }) {
  if (items.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{empty}</p>;
  return (
    <ul className="space-y-1">
      {items.map((q) => (
        <li key={q.questionId} className="text-xs flex items-center justify-between gap-3">
          <span style={{ color: 'var(--text-secondary)' }}>Q{q.index} · {q.topicName}</span>
          <span className="font-medium flex-shrink-0" style={{ color: q.status === 'incorrect' ? '#ef4444' : 'var(--text-primary)' }}>{q.seconds}s · {q.status}</span>
        </li>
      ))}
    </ul>
  );
}

function TimeAnalysis({ analysis }: { analysis: MockAnalysis }) {
  const t = analysis.timeInsights!;
  if (!t.available) {
    return (
      <p className="text-xs flex items-start gap-2" style={{ color: 'var(--text-muted)' }} role="status">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        Per-question timing wasn't recorded for this attempt, so there is nothing honest to show here. Attempts you take from now on record it.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl p-2.5" style={{ background: 'var(--border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{t.averageSeconds ?? '—'}s</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Average</p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: 'var(--border)' }}>
          <p className="text-base font-bold" style={{ color: '#22c55e' }}>{t.averageCorrectSeconds ?? '—'}{t.averageCorrectSeconds !== null && 's'}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>On correct</p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: 'var(--border)' }}>
          <p className="text-base font-bold" style={{ color: '#ef4444' }}>{t.averageIncorrectSeconds ?? '—'}{t.averageIncorrectSeconds !== null && 's'}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>On incorrect</p>
        </div>
      </div>

      {t.tooFewToJudge ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Too few timed questions to flag slow or rushed ones reliably.</p>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Unusually slow <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(over {t.slowThresholdSeconds}s; typical {t.medianSeconds}s)</span></p>
            <QuestionChips items={t.slowQuestions} empty="No question took unusually long." />
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Answered quickly but wrong <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(within {t.fastThresholdSeconds}s)</span></p>
            <QuestionChips items={t.fastIncorrect} empty="No rushed wrong answers." />
          </div>
        </>
      )}

      {t.byTopic.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Time by topic <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(slowest first)</span></p>
          <ul className="space-y-1">
            {t.byTopic.map((b) => (
              <li key={`${b.subjectId}::${b.topicId}`} className="text-xs flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>{b.topicName}</span>
                <span className="flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{b.avgSeconds}s avg · {b.accuracy !== null ? `${b.accuracy}%` : 'N/A'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
