import { type ReactNode, useState } from 'react';
import {
  Trophy, Target, TrendingUp, Gauge, BarChart3, Layers, ListChecks,
  Smile, Clock, Lightbulb, CheckCircle2, Info,
} from 'lucide-react';
import { formatDuration } from '../../utils';
import { CollapsibleSection } from './CollapsibleSection';
import { AnalysisBarChart } from './AnalysisCharts';
import { ResultTables } from '../results/ResultTables';
import type { ResultContext } from '../../services/resultTables';
import type { AreaPerformance, MockAnalysis, TimedQuestionRef } from '../../types/mockAnalysis';

interface AnalysisViewProps {
  analysis: MockAnalysis;
  /** What the result screen knows beyond the analysis (marking scheme, allotted time, sections, earlier attempts) — feeds the shared result tables. */
  context: ResultContext;
  /** 'mock' shows rank/percentile/cut-off cards (honest "unavailable" states); 'practice' shows what a practice session can know. */
  variant: 'mock' | 'practice';
  /** Practice-only history panel, grouped with the other secondary analysis. */
  additionalPerformance?: ReactNode;
}

/**
 * The one analysis dashboard, rendered for a finished Full/Sectional Mock AND a finished Practice/Test
 * session — both produce the same MockAnalysis. Sections are collapsible so small screens get a
 * scannable page; anything that depends on data the attempt never recorded says so instead of showing zeros.
 */
type AnalysisTab = 'questions' | 'scorecard' | 'subject' | 'performance';

const ANALYSIS_TABS: { id: AnalysisTab; label: string; shortLabel: string; icon: typeof ListChecks; hint: string }[] = [
  { id: 'questions', label: 'Question-wise', shortLabel: 'Questions', icon: ListChecks, hint: 'Answers and detailed solutions' },
  { id: 'scorecard', label: 'Scorecard', shortLabel: 'Scorecard', icon: Trophy, hint: 'Your overall result' },
  { id: 'subject', label: 'Subject-wise', shortLabel: 'Subjects', icon: BarChart3, hint: 'Subject, section and topic performance' },
  { id: 'performance', label: 'More analysis', shortLabel: 'More', icon: Gauge, hint: 'Timing, difficulty, strengths and attempts' },
];

/** One compact, tabbed result workspace shared by Practice, Test and Mock results. */
export function AnalysisView({ analysis, context, variant, additionalPerformance }: AnalysisViewProps) {
  const { summary, timeInsights, recommendations, dataAvailability } = analysis;
  const scoring = summary.scoringApplicable !== false;
  const multiSubject = analysis.subjectPerformance.length > 1;
  const avgPerQuestion = timeInsights?.averageSeconds ?? analysis.speed.averageTimePerQuestionSeconds;
  const [activeTab, setActiveTab] = useState<AnalysisTab>('questions');

  return (
    <div className="space-y-4" data-testid="analysis-workspace">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
            <SummaryCard icon={<Target size={15} />} label={scoring ? 'Score' : 'Correct'} value={scoring ? `${summary.score} / ${summary.maxScore}` : `${summary.correct} / ${summary.totalQuestions}`} hint={scoring ? `${summary.percentage.toFixed(1)}%` : `${Math.round((summary.correct / Math.max(1, summary.totalQuestions)) * 100)}% of all questions`} />
            <SummaryCard icon={<Gauge size={15} />} label="Accuracy" value={summary.accuracy !== null ? `${summary.accuracy.toFixed(1)}%` : 'N/A'} hint={summary.accuracy !== null ? `of ${summary.attempted} attempted` : 'Nothing attempted'} />
            <SummaryCard icon={<ListChecks size={15} />} label="Attempted" value={`${summary.attempted} / ${summary.totalQuestions}`} hint={`${summary.unattempted} unanswered`} />
            <SummaryCard icon={<Clock size={15} />} label="Total time" value={formatDuration(summary.timeTakenSeconds)} />
            <SummaryCard icon={<Clock size={15} />} label="Avg / question" value={avgPerQuestion !== null && avgPerQuestion !== undefined ? `${avgPerQuestion}s` : 'Unavailable'} hint={dataAvailability && !dataAvailability.perQuestionTime ? 'No per-question time recorded' : undefined} />
            <SummaryCard icon={<Smile size={15} />} label="Overview" value={analysis.overview.rating} />
          </>
        )}
      </div>

      <div className="card p-3.5 sm:p-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{analysis.overview.message}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Correct: <b style={{ color: '#22c55e' }} data-testid="an-correct">{summary.correct}</b></span>
          <span>Incorrect: <b style={{ color: '#ef4444' }} data-testid="an-incorrect">{summary.incorrect}</b></span>
          <span>Unattempted: <b data-testid="an-unattempted">{summary.unattempted}</b></span>
          {scoring && summary.incorrect > 0 && <span>Negative marks: <b style={{ color: '#ef4444' }}>{Math.round((summary.correct - summary.score) * 100) / 100}</b></span>}
          <span>Time: <b>{formatDuration(summary.timeTakenSeconds)}</b></span>
        </div>
      </div>

      <div className="rounded-2xl p-1.5 sm:p-2 sticky top-0 z-20" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 5px 18px rgba(0,0,0,0.04)' }}>
        <div role="tablist" aria-label="Test analysis sections" className="grid grid-cols-4 gap-1">
          {ANALYSIS_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`analysis-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`analysis-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="min-w-0 rounded-xl px-1.5 py-2.5 sm:px-3 transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2"
                style={selected ? { background: 'var(--brand-500, #6366f1)', color: '#fff', boxShadow: '0 2px 7px rgba(99,102,241,0.2)' } : { color: 'var(--text-secondary)' }}
              >
                <Icon size={16} aria-hidden />
                <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] sm:text-[11px] px-2 pt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>{ANALYSIS_TABS.find((tab) => tab.id === activeTab)?.hint}</p>
      </div>

      <section role="tabpanel" id="analysis-panel-questions" aria-labelledby="analysis-tab-questions" hidden={activeTab !== 'questions'} className="space-y-3">
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Question-wise analysis & solutions</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Filter by result, subject, timing or marked status. Expand any row to view every option, your answer and the full explanation.</p>
        </div>
        <ResultTables analysis={analysis} context={context} sections={['question']} />
      </section>

      <section role="tabpanel" id="analysis-panel-scorecard" aria-labelledby="analysis-tab-scorecard" hidden={activeTab !== 'scorecard'}>
        <ResultTables analysis={analysis} context={context} sections={['scorecard']} />
      </section>

      <section role="tabpanel" id="analysis-panel-subject" aria-labelledby="analysis-tab-subject" hidden={activeTab !== 'subject'} className="space-y-3">
        <ResultTables analysis={analysis} context={context} sections={['section', 'subject', 'topic']} />
        {(variant === 'mock' || multiSubject) && (
          <CollapsibleSection title="Subject performance" subtitle={`${analysis.subjectPerformance.length} subject${analysis.subjectPerformance.length === 1 ? '' : 's'}`} icon={<BarChart3 size={18} />} defaultOpen>
            <AnalysisBarChart data={analysis.subjectPerformance.map((item) => ({ label: item.subjectName, value: item.marks, maxValue: item.maxMarks }))} valueLabel={scoring ? 'Your Score' : 'Correct'} maxLabel={scoring ? 'Max Marks' : 'Questions'} />
          </CollapsibleSection>
        )}
      </section>

      <section role="tabpanel" id="analysis-panel-performance" aria-labelledby="analysis-tab-performance" hidden={activeTab !== 'performance'} className="space-y-3">
        <ResultTables analysis={analysis} context={context} sections={['performance']} />
        {recommendations && (
          <CollapsibleSection title="Revision plan" subtitle="Based on how you did on each topic in this test" icon={<Lightbulb size={18} />} defaultOpen>
            <RevisionPlan recommendations={recommendations} multiTopic={analysis.topicPerformance.length > 1} />
          </CollapsibleSection>
        )}
        {timeInsights && (
          <CollapsibleSection title="Time analysis" subtitle="Where your time went, question by question" icon={<Clock size={18} />}>
            <TimeAnalysis analysis={analysis} />
          </CollapsibleSection>
        )}
        {variant === 'mock' && (
          <CollapsibleSection title="Speed analysis" subtitle="Pacing across the test" icon={<Gauge size={18} />}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--border)' }}><p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{analysis.speed.questionsPerMinute ?? 'N/A'}</p><p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Questions / min</p></div>
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--border)' }}><p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{analysis.speed.averageTimePerQuestionSeconds ?? 'N/A'}s</p><p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg time / question</p></div>
            </div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>By subject</p>
            <div className="space-y-1.5 mb-4">{analysis.speed.bySubject.map((item) => <div key={item.subjectId} className="flex items-center justify-between text-xs"><span style={{ color: 'var(--text-secondary)' }}>{item.subjectName}</span><span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.avgTimePerQuestionSeconds}s/question</span></div>)}</div>
            {analysis.speed.byDifficulty.length > 0 && <><p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>By difficulty</p><div className="grid grid-cols-3 gap-2">{analysis.speed.byDifficulty.map((item) => <div key={item.difficulty} className="rounded-lg p-2 text-center" style={{ background: 'var(--border)' }}><p className="text-sm font-bold capitalize" style={{ color: 'var(--text-primary)' }}>{item.avgTimeSeconds}s</p><p className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{item.difficulty}</p></div>)}</div></>}
          </CollapsibleSection>
        )}
        <CollapsibleSection title="Strong vs Weak areas" icon={<TrendingUp size={18} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><p className="text-xs font-semibold mb-2" style={{ color: '#22c55e' }}>STRONG</p>{analysis.strongAreas.subjects.length === 0 && analysis.strongAreas.topics.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not enough data yet to call out strengths confidently.</p> : <div className="flex flex-wrap gap-1.5">{[...analysis.strongAreas.subjects, ...analysis.strongAreas.topics].map((area) => <span key={area.id} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>{area.name}</span>)}</div>}</div>
            <div><p className="text-xs font-semibold mb-2" style={{ color: '#ef4444' }}>WEAK</p>{analysis.weakAreas.subjects.length === 0 && analysis.weakAreas.topics.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No clear weak areas identified.</p> : <div className="flex flex-wrap gap-1.5">{[...analysis.weakAreas.subjects, ...analysis.weakAreas.topics].map((area) => <span key={area.id} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>{area.name}</span>)}</div>}</div>
          </div>
        </CollapsibleSection>
        {additionalPerformance}
      </section>
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
