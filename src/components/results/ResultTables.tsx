import { useMemo, type ReactNode } from 'react';
import { BarChart3, ClipboardList, Clock, Gauge, History, Layers, ListChecks, Signal } from 'lucide-react';
import { CollapsibleSection } from '../mock-analysis/CollapsibleSection';
import { DataTable, type Column } from './DataTable';
import { QuestionWiseTable } from './QuestionWiseTable';
import { buildResultTables, formatClockSeconds, type ComparisonRow, type GroupRow, type ResultContext, type ScorecardRow, type SectionRow, type StrengthLabel, type TimedRow } from '../../services/resultTables';
import type { MockAnalysis } from '../../types/mockAnalysis';

const NA = '—';
const pct = (n: number | null) => (n === null ? NA : `${n}%`);
const clock = (n: number | null) => (n === null ? NA : formatClockSeconds(n));
const marks = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
const STATUS_WORD = { correct: 'Correct', wrong: 'Wrong', skipped: 'Skipped' } as const;

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{children}</p>;
}

/** Text first, so the label never depends on colour. */
function Strength({ label }: { label: StrengthLabel | null }) {
  if (label === null) return <>{NA}</>;
  const tone = label === 'Strong' ? '#16a34a' : label === 'Weak' ? '#dc2626' : label === 'Average' ? '#d97706' : 'var(--text-muted)';
  return <span className="font-medium whitespace-nowrap" style={{ color: tone }}>{label}</span>;
}

function groupColumns(firstHeader: string, withStrength: boolean, scoreHeader: string): Column<GroupRow>[] {
  return [
    { key: 'name', header: firstHeader, render: (r) => (<><span className="font-medium whitespace-nowrap">{r.name}</span>{r.subjectName && <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.subjectName}</span>}</>) },
    { key: 'questions', header: 'Questions', align: 'right', render: (r) => r.questions },
    { key: 'attempted', header: 'Attempted', align: 'right', render: (r) => r.attempted },
    { key: 'correct', header: 'Correct', align: 'right', render: (r) => r.correct },
    { key: 'wrong', header: 'Wrong', align: 'right', render: (r) => r.wrong },
    { key: 'skipped', header: 'Skipped', align: 'right', render: (r) => r.skipped },
    { key: 'accuracy', header: 'Accuracy', align: 'right', render: (r) => pct(r.accuracy) },
    { key: 'time', header: 'Time', align: 'right', render: (r) => clock(r.timeSeconds) },
    { key: 'marks', header: scoreHeader, align: 'right', render: (r) => marks(r.marks) },
    ...(withStrength ? [{ key: 'label', header: 'Strength', render: (r: GroupRow) => <Strength label={r.label} /> } as Column<GroupRow>] : []),
  ];
}

const SECTION_COLUMNS: Column<SectionRow>[] = [
  { key: 'title', header: 'Section', render: (r) => <span className="font-medium whitespace-nowrap">{r.title}</span> },
  { key: 'questions', header: 'Questions', align: 'right', render: (r) => r.questions },
  { key: 'attempted', header: 'Attempted', align: 'right', render: (r) => r.attempted },
  { key: 'correct', header: 'Correct', align: 'right', render: (r) => r.correct },
  { key: 'wrong', header: 'Wrong', align: 'right', render: (r) => r.wrong },
  { key: 'skipped', header: 'Skipped', align: 'right', render: (r) => r.skipped },
  { key: 'score', header: 'Score', align: 'right', render: (r) => `${marks(r.score)} / ${marks(r.maxScore)}` },
  { key: 'accuracy', header: 'Accuracy', align: 'right', render: (r) => pct(r.accuracy) },
  { key: 'time', header: 'Time spent / allotted', align: 'right', render: (r) => (r.timeSpentSeconds === null ? 'Not recorded' : clock(r.timeSpentSeconds)) + (r.allottedSeconds !== null ? ` / ${clock(r.allottedSeconds)}` : '') },
];

const SCORECARD_COLUMNS: Column<ScorecardRow>[] = [
  { key: 'label', header: 'Measure', render: (r) => <span className="font-medium whitespace-nowrap">{r.label}</span> },
  { key: 'value', header: 'Result', align: 'right', render: (r) => <span data-testid={`score-${r.key}`}>{r.value}</span> },
  { key: 'note', header: 'Note', render: (r) => r.note ?? '' },
];

const TIMED_COLUMNS: Column<TimedRow>[] = [
  { key: 'no', header: 'Q', align: 'right', render: (r) => r.no },
  { key: 'topic', header: 'Topic', render: (r) => r.topic },
  { key: 'status', header: 'Status', render: (r) => STATUS_WORD[r.status] },
  { key: 'seconds', header: 'Time', align: 'right', render: (r) => `${r.seconds}s` },
];

const COMPARISON_COLUMNS: Column<ComparisonRow>[] = [
  { key: 'label', header: 'Attempt', render: (r) => <span className={r.isCurrent ? 'font-bold' : 'font-medium'}>{r.label}</span> },
  { key: 'at', header: 'Date', render: (r) => new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) },
  { key: 'score', header: 'Score', align: 'right', render: (r) => (r.score === null || r.maxScore === null ? NA : `${marks(r.score)} / ${marks(r.maxScore)}`) },
  { key: 'accuracy', header: 'Accuracy', align: 'right', render: (r) => pct(r.accuracy) },
  { key: 'attempted', header: 'Attempted', align: 'right', render: (r) => (r.attempted === null ? NA : r.attempted) },
  { key: 'time', header: 'Time', align: 'right', render: (r) => clock(r.timeSeconds) },
];

interface ResultTablesProps {
  analysis: MockAnalysis;
  context: ResultContext;
}

/**
 * The shared result tables — the same set on the Practice, Test, Mock and daily-quiz result screens, in the way real mock-test
 * apps lay them out. Built only from this attempt's stored data (see services/resultTables.ts); there is no rank, percentile,
 * topper comparison or cut-off, because the app has no real data for them.
 */
export function ResultTables({ analysis, context }: ResultTablesProps) {
  const t = useMemo(() => buildResultTables(analysis, context), [analysis, context]);
  const scoring = analysis.summary.scoringApplicable !== false && (context.marking !== null || !!context.sectionMarking);
  const scoreHeader = scoring ? 'Marks' : 'Correct';

  return (
    <div className="space-y-4" data-testid="result-tables">
      <CollapsibleSection title="Scorecard" subtitle="Score, marking scheme, accuracy and time" icon={<ClipboardList size={18} />} defaultOpen>
        <DataTable caption="Scorecard" columns={SCORECARD_COLUMNS} rows={t.scorecard} rowKey={(r) => r.key} testId="table-scorecard" />
      </CollapsibleSection>

      {t.sections.length > 0 && (
        <CollapsibleSection title="Section-wise" subtitle={`${t.sections.length} sections`} icon={<Layers size={18} />} defaultOpen>
          <DataTable caption="Section-wise results" columns={SECTION_COLUMNS} rows={t.sections} rowKey={(r) => r.sectionId} testId="table-sections" />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Subject-wise" subtitle={`${t.subjects.length} subject${t.subjects.length === 1 ? '' : 's'}`} icon={<BarChart3 size={18} />} defaultOpen>
        <DataTable caption="Subject-wise results" columns={groupColumns('Subject', true, scoreHeader)} rows={t.subjects} rowKey={(r) => r.id} testId="table-subjects" />
        <Note>Strength is only given from 10 answered questions in a subject or topic; below that it reads “Insufficient data”.</Note>
      </CollapsibleSection>

      <CollapsibleSection title="Topic-wise" subtitle={`${t.topics.length} topic${t.topics.length === 1 ? '' : 's'}`} icon={<ListChecks size={18} />} defaultOpen>
        <DataTable caption="Topic-wise results" columns={groupColumns('Topic', true, scoreHeader)} rows={t.topics} rowKey={(r) => r.id} testId="table-topics" />
      </CollapsibleSection>

      <CollapsibleSection title="Difficulty-wise" subtitle="Easy, medium and hard questions" icon={<Signal size={18} />}>
        {t.difficulty.available ? (
          <DataTable caption="Difficulty-wise results" columns={groupColumns('Difficulty', false, scoreHeader)} rows={t.difficulty.rows} rowKey={(r) => r.id} testId="table-difficulty" />
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">Difficulty isn't recorded for the questions in this test, so there is nothing to break down.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Time analysis" subtitle="Average time on correct, wrong and skipped questions" icon={<Clock size={18} />}>
        {t.time.available ? (
          <div className="space-y-4">
            <DataTable
              caption="Time by outcome" testId="table-time-outcome" rowKey={(r) => r.status} rows={t.time.byOutcome}
              columns={[
                { key: 'status', header: 'Outcome', render: (r) => STATUS_WORD[r.status] },
                { key: 'questions', header: 'Questions', align: 'right', render: (r) => r.questions },
                { key: 'avg', header: 'Average time', align: 'right', render: (r) => (r.averageSeconds === null ? 'Not recorded' : `${r.averageSeconds}s`) },
                { key: 'total', header: 'Total time', align: 'right', render: (r) => clock(r.totalSeconds) },
              ]}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div><p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fastest questions</p><DataTable caption="Fastest questions" columns={TIMED_COLUMNS} rows={t.time.fastest} rowKey={(r) => String(r.no)} testId="table-time-fastest" /></div>
              <div><p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Slowest questions</p><DataTable caption="Slowest questions" columns={TIMED_COLUMNS} rows={t.time.slowest} rowKey={(r) => String(r.no)} testId="table-time-slowest" /></div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Questions over {t.time.thresholdSeconds}s ({t.time.overThreshold.length})</p>
              {t.time.overThreshold.length > 0
                ? <DataTable caption={`Questions over ${t.time.thresholdSeconds} seconds`} columns={TIMED_COLUMNS} rows={t.time.overThreshold} rowKey={(r) => String(r.no)} testId="table-time-over" />
                : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No question took longer than {t.time.thresholdSeconds} seconds.</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">Per-question time wasn't recorded for this attempt, so there is nothing honest to show here. Attempts you take from now on record it.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Question-wise" subtitle={`${t.questions.length} question${t.questions.length === 1 ? '' : 's'} — sort, filter and open any solution`} icon={<Gauge size={18} />} defaultOpen>
        <QuestionWiseTable rows={t.questions} showSection={t.sections.length > 0} />
      </CollapsibleSection>

      <CollapsibleSection title="Compared with your earlier attempts" subtitle={t.comparison.length > 0 ? `${t.comparison.length - 1} earlier attempt${t.comparison.length === 2 ? '' : 's'} of this test` : 'First attempt of this test'} icon={<History size={18} />}>
        {t.comparison.length > 0
          ? <DataTable caption="This attempt compared with earlier attempts" columns={COMPARISON_COLUMNS} rows={t.comparison} rowKey={(r) => r.id} testId="table-comparison" />
          : <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">This is your first recorded attempt of this test, so there is nothing to compare with yet.</p>}
        <Note>No rank, percentile or cut-off is shown: the app has no real data to base them on.</Note>
      </CollapsibleSection>
    </div>
  );
}
