import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Flag, MinusCircle, XCircle } from 'lucide-react';
import { DataTable, type Column } from './DataTable';
import { SpeakExplanationButton } from '../common/SpeakExplanationButton';
import { QuestionMarkdownRenderer, QuestionOptionContent } from '../mock/QuestionMarkdownRenderer';
import { getMarkPurposeInfo } from '../../types/questionMark';
import { QUESTION_PAGE_SIZE, filterQuestionRows, paginate, sortQuestionRows, type QuestionFilter, type QuestionRow, type QuestionSortKey, type SortDir, type RowStatus } from '../../services/resultTables';

const STATUS: Record<RowStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  correct: { label: 'Correct', color: '#16a34a', Icon: CheckCircle2 },
  wrong: { label: 'Wrong', color: '#dc2626', Icon: XCircle },
  skipped: { label: 'Skipped', color: 'var(--text-muted)', Icon: MinusCircle },
};
const FILTERS: { id: QuestionFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'correct', label: 'Correct' }, { id: 'wrong', label: 'Wrong' },
  { id: 'skipped', label: 'Skipped' }, { id: 'slow', label: 'Slow' }, { id: 'marked', label: 'Marked' },
];
const fmtMarks = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/**
 * Unified question analysis: the sortable table and the former detailed-solution review now share one view.
 * Each expanded row contains the full options, selected/correct answer, explanation, timing and review marker.
 */
export function QuestionWiseTable({
  rows,
  showSection,
  slowThresholdSeconds = null,
  timingAvailable = true,
}: {
  rows: readonly QuestionRow[];
  showSection: boolean;
  slowThresholdSeconds?: number | null;
  timingAvailable?: boolean;
}) {
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sort, setSort] = useState<{ key: QuestionSortKey; dir: SortDir }>({ key: 'no', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const subjects = useMemo(() => [...new Set(rows.map((row) => row.subject))].sort((a, b) => a.localeCompare(b)), [rows]);
  const counts = useMemo(() => Object.fromEntries(
    FILTERS.filter((item) => item.id !== 'slow' || slowThresholdSeconds !== null).map((item) => [
      item.id,
      filterQuestionRows(rows, item.id, slowThresholdSeconds).filter((row) => subjectFilter === 'all' || row.subject === subjectFilter).length,
    ]),
  ) as Partial<Record<QuestionFilter, number>>, [rows, slowThresholdSeconds, subjectFilter]);
  const visible = useMemo(() => sortQuestionRows(
    filterQuestionRows(rows, filter, slowThresholdSeconds).filter((row) => subjectFilter === 'all' || row.subject === subjectFilter),
    sort.key,
    sort.dir,
  ), [rows, filter, slowThresholdSeconds, subjectFilter, sort]);
  const pageData = paginate(visible, page, QUESTION_PAGE_SIZE);
  const hasDifficulty = rows.some((row) => row.difficulty !== null);
  const showSlowFilter = slowThresholdSeconds !== null;

  function onSort(key: string) {
    setSort((current) => current.key === key
      ? { key: current.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key: key as QuestionSortKey, dir: 'asc' });
    setPage(1);
  }

  function applyFilter(next: QuestionFilter) {
    setFilter(next);
    setPage(1);
    setOpenId(null);
  }

  function jumpToQuestion(row: QuestionRow) {
    const index = visible.findIndex((item) => item.id === row.id);
    if (index >= 0) setPage(Math.floor(index / QUESTION_PAGE_SIZE) + 1);
    setOpenId(row.id);
  }

  const columns: Column<QuestionRow>[] = [
    {
      key: 'no', header: 'Q', sortable: true, align: 'right',
      render: (row) => (
        <button type="button" onClick={() => setOpenId((id) => (id === row.id ? null : row.id))} aria-expanded={openId === row.id}
          aria-label={`${openId === row.id ? 'Hide' : 'Open'} solution for question ${row.no}`}
          className="inline-flex items-center justify-end gap-1 min-w-11 min-h-11 -my-2 font-semibold text-brand-600 dark:text-brand-400">
          {row.no}<ChevronDown size={12} aria-hidden className={openId === row.id ? 'rotate-180' : ''} />
        </button>
      ),
    },
    ...(showSection ? [{ key: 'section', header: 'Section', render: (row: QuestionRow) => row.sectionTitle ?? '—' } as Column<QuestionRow>] : []),
    { key: 'subject', header: 'Subject › Topic', sortable: true, render: (row) => <span className="whitespace-nowrap">{row.subject} › {row.topic}</span> },
    ...(hasDifficulty ? [{ key: 'difficulty', header: 'Difficulty', sortable: true, render: (row: QuestionRow) => (row.difficulty ? row.difficulty[0].toUpperCase() + row.difficulty.slice(1) : '—') } as Column<QuestionRow>] : []),
    {
      key: 'status', header: 'Status', sortable: true,
      render: (row) => {
        const { label, color, Icon } = STATUS[row.status];
        return (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1 font-medium" style={{ color }}><Icon size={13} aria-hidden />{label}</span>
            {row.marked && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Flag size={12} aria-hidden />Marked</span>}
          </span>
        );
      },
    },
    { key: 'yours', header: 'Your answer', render: (row) => <span className="block max-w-[10rem] truncate" title={row.yourAnswer ?? undefined}>{row.yourAnswer ?? '—'}</span> },
    { key: 'correct', header: 'Correct answer', render: (row) => <span className="block max-w-[10rem] truncate" title={row.correctAnswer}>{row.correctAnswer}</span> },
    { key: 'time', header: 'Time', sortable: true, align: 'right', render: (row) => (row.timeSeconds === null ? '—' : `${row.timeSeconds}s`) },
    { key: 'marks', header: 'Marks', sortable: true, align: 'right', render: (row) => fmtMarks(row.marks) },
  ];

  return (
    <div className="space-y-3" data-testid="question-wise-table">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tap a question number to expand its complete solution.</p>
        {subjects.length > 1 && (
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium">Subject</span>
            <select value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setPage(1); setOpenId(null); }}
              className="min-h-10 rounded-lg px-2.5 border text-xs" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="all">All subjects</option>
              {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions by result">
        {FILTERS.filter((item) => item.id !== 'slow' || showSlowFilter).map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => applyFilter(item.id)}
            className={`min-h-10 px-3 rounded-full text-xs font-medium border transition-colors ${filter === item.id ? 'bg-brand-500 text-white border-brand-500' : ''}`}
            style={filter === item.id ? undefined : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {item.label} ({counts[item.id] ?? 0})
          </button>
        ))}
      </div>

      {/* Question palette retains the fast jump-to-question feature from the former solutions view. */}
      {visible.length > 0 && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>QUESTION PALETTE</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{visible.length} shown</p>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {visible.map((row) => {
              const bg = row.status === 'correct' ? '#22c55e' : row.status === 'wrong' ? '#ef4444' : 'var(--card)';
              const color = row.status === 'skipped' ? 'var(--text-secondary)' : '#fff';
              return (
                <button key={row.id} type="button" onClick={() => jumpToQuestion(row)}
                  className={`relative w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center ${openId === row.id ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`}
                  style={{ background: bg, color }} aria-label={`Jump to question ${row.no}, ${row.status}`}>
                  {row.no}
                  {row.marked && <Flag size={9} className="absolute -top-1 -right-1" style={{ color: '#f59e0b' }} fill="currentColor" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">No questions match this filter.</p>
      ) : (
        <DataTable
          caption="Question-wise results" columns={columns} rows={pageData.items} rowKey={(row) => row.id} sort={sort} onSort={onSort}
          expandedKey={openId}
          renderDetail={(row) => {
            const markInfo = getMarkPurposeInfo(row.markPurpose ?? (row.marked ? 'review' : undefined));
            return (
              <div className="space-y-3 text-sm" data-testid="question-solution">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>QUESTION {row.no} · {row.subject} · {row.topic}</p>
                  <span className="text-[10px] font-semibold uppercase px-2 py-1 rounded-full" style={{ background: row.status === 'correct' ? 'rgba(34,197,94,0.12)' : row.status === 'wrong' ? 'rgba(239,68,68,0.12)' : 'var(--border)', color: row.status === 'correct' ? '#16a34a' : row.status === 'wrong' ? '#dc2626' : 'var(--text-muted)' }}>{STATUS[row.status].label}</span>
                </div>
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}><QuestionMarkdownRenderer content={row.question} baseDir={row.baseDir} /></div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Your answer: <b>{row.yourAnswer ?? 'Not answered'}</b> · Correct answer: <b>{row.correctAnswer}</b></p>
                <div className="space-y-1.5">
                  {row.options.map((option) => {
                    const isSelected = option.id === row.selectedOptionId;
                    const isCorrect = option.id === row.correctOptionId;
                    return (
                      <div key={option.id} className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: isCorrect ? 'rgba(34,197,94,0.10)' : isSelected ? 'rgba(239,68,68,0.10)' : 'var(--card)', color: isCorrect ? '#16a34a' : isSelected ? '#dc2626' : 'var(--text-secondary)', border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.28)' : isSelected ? 'rgba(239,68,68,0.25)' : 'var(--border)'}` }}>
                        <span className="font-semibold flex-shrink-0">{option.id}.</span>
                        <span className="min-w-0"><QuestionOptionContent text={option.text} image={option.image} baseDir={row.baseDir} /></span>
                        {isCorrect && <span className="ml-auto flex-shrink-0 text-[10px] font-semibold">Correct</span>}
                        {isSelected && !isCorrect && <span className="ml-auto flex-shrink-0 text-[10px] font-semibold">Your answer</span>}
                      </div>
                    );
                  })}
                </div>
                {!row.selectedOptionId && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not attempted · correct answer: {row.correctOptionId}</p>}
                <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span>{timingAvailable ? `Time spent: ${row.timeSeconds === null ? 0 : row.timeSeconds}s` : 'Time spent: not recorded'}</span>
                  {slowThresholdSeconds !== null && row.timeSeconds !== null && row.timeSeconds > slowThresholdSeconds && <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309' }}>Slow</span>}
                  {markInfo && <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: `${markInfo.color}22`, color: markInfo.color }}>{markInfo.label}</span>}
                  <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Marks: {fmtMarks(row.marks)}</span>
                </div>
                {row.explanation ? (
                  <div className="rounded-xl p-3" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5">Explanation</p>
                    <QuestionMarkdownRenderer content={row.explanation} baseDir={row.baseDir} />
                    <SpeakExplanationButton text={row.explanation} className="mt-2" />
                  </div>
                ) : <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No explanation was recorded for this question.</p>}
              </div>
            );
          }}
        />
      )}

      {pageData.pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2 text-xs" aria-label="Question pages" style={{ color: 'var(--text-secondary)' }}>
          <span>Showing {pageData.from}–{pageData.to} of {pageData.total}</span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(pageData.page - 1)} disabled={pageData.page <= 1} aria-label="Previous page" className="w-11 h-11 inline-flex items-center justify-center rounded-lg disabled:opacity-40"><ChevronLeft size={16} aria-hidden /></button>
            <span>Page {pageData.page} / {pageData.pageCount}</span>
            <button type="button" onClick={() => setPage(pageData.page + 1)} disabled={pageData.page >= pageData.pageCount} aria-label="Next page" className="w-11 h-11 inline-flex items-center justify-center rounded-lg disabled:opacity-40"><ChevronRight size={16} aria-hidden /></button>
          </span>
        </nav>
      )}
    </div>
  );
}
