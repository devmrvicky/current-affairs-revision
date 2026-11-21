import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Flag, MinusCircle, XCircle } from 'lucide-react';
import { DataTable, type Column } from './DataTable';
import { SpeakExplanationButton } from '../common/SpeakExplanationButton';
import { QuestionMarkdownRenderer } from '../mock/QuestionMarkdownRenderer';
import { QUESTION_PAGE_SIZE, filterQuestionRows, paginate, sortQuestionRows, type QuestionFilter, type QuestionRow, type QuestionSortKey, type SortDir, type RowStatus } from '../../services/resultTables';

const STATUS: Record<RowStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  correct: { label: 'Correct', color: '#16a34a', Icon: CheckCircle2 },
  wrong: { label: 'Wrong', color: '#dc2626', Icon: XCircle },
  skipped: { label: 'Skipped', color: 'var(--text-muted)', Icon: MinusCircle },
};
const FILTERS: { id: QuestionFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'correct', label: 'Correct' }, { id: 'wrong', label: 'Wrong' }, { id: 'skipped', label: 'Skipped' }, { id: 'marked', label: 'Marked' }];
const fmtMarks = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/**
 * Every question of the attempt in one table: number, section, subject › topic, difficulty, status, your answer, the correct answer,
 * time and marks. Sort by a column header, filter by status, page through long tests, and open a row's solution
 * (the explanation, with Listen). Status is always written out and shown with an icon — never colour alone.
 */
export function QuestionWiseTable({ rows, showSection }: { rows: readonly QuestionRow[]; showSection: boolean }) {
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [sort, setSort] = useState<{ key: QuestionSortKey; dir: SortDir }>({ key: 'no', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, filterQuestionRows(rows, f.id).length])) as Record<QuestionFilter, number>, [rows]);
  const visible = useMemo(() => sortQuestionRows(filterQuestionRows(rows, filter), sort.key, sort.dir), [rows, filter, sort]);
  const pageData = paginate(visible, page, QUESTION_PAGE_SIZE);
  const hasDifficulty = rows.some((r) => r.difficulty !== null);

  function onSort(key: string) {
    setSort((s) => (s.key === key ? { key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: key as QuestionSortKey, dir: 'asc' }));
    setPage(1);
  }

  const columns: Column<QuestionRow>[] = [
    {
      key: 'no', header: 'Q', sortable: true, align: 'right',
      render: (r) => (
        <button type="button" onClick={() => setOpenId((id) => (id === r.id ? null : r.id))} aria-expanded={openId === r.id} aria-label={`${openId === r.id ? 'Hide' : 'Open'} solution for question ${r.no}`}
          className="inline-flex items-center justify-end gap-1 min-w-11 min-h-11 -my-2 font-semibold text-brand-600 dark:text-brand-400">
          {r.no}<ChevronDown size={12} aria-hidden className={openId === r.id ? 'rotate-180' : ''} />
        </button>
      ),
    },
    ...(showSection ? [{ key: 'section', header: 'Section', render: (r: QuestionRow) => r.sectionTitle ?? '—' } as Column<QuestionRow>] : []),
    { key: 'subject', header: 'Subject › Topic', sortable: true, render: (r) => <span className="whitespace-nowrap">{r.subject} › {r.topic}</span> },
    ...(hasDifficulty ? [{ key: 'difficulty', header: 'Difficulty', sortable: true, render: (r: QuestionRow) => (r.difficulty ? r.difficulty[0].toUpperCase() + r.difficulty.slice(1) : '—') } as Column<QuestionRow>] : []),
    {
      key: 'status', header: 'Status', sortable: true,
      render: (r) => {
        const { label, color, Icon } = STATUS[r.status];
        return (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1 font-medium" style={{ color }}><Icon size={13} aria-hidden />{label}</span>
            {r.marked && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Flag size={12} aria-hidden />Marked</span>}
          </span>
        );
      },
    },
    { key: 'yours', header: 'Your answer', render: (r) => <span className="block max-w-[10rem] truncate" title={r.yourAnswer ?? undefined}>{r.yourAnswer ?? '—'}</span> },
    { key: 'correct', header: 'Correct answer', render: (r) => <span className="block max-w-[10rem] truncate" title={r.correctAnswer}>{r.correctAnswer}</span> },
    { key: 'time', header: 'Time', sortable: true, align: 'right', render: (r) => (r.timeSeconds === null ? '—' : `${r.timeSeconds}s`) },
    { key: 'marks', header: 'Marks', sortable: true, align: 'right', render: (r) => fmtMarks(r.marks) },
  ];

  return (
    <div className="space-y-3" data-testid="question-wise-table">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions by status">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); setPage(1); }}
            className={`min-h-11 px-3 rounded-full text-xs font-medium border ${filter === f.id ? 'bg-brand-500 text-white border-brand-500' : ''}`} style={filter === f.id ? undefined : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">No questions match this filter.</p>
      ) : (
        <DataTable
          caption="Question-wise results" columns={columns} rows={pageData.items} rowKey={(r) => r.id} sort={sort} onSort={onSort}
          expandedKey={openId}
          renderDetail={(r) => (
            <div className="space-y-2 text-sm" data-testid="question-solution">
              <QuestionMarkdownRenderer content={r.question} baseDir={r.baseDir} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Your answer: <b>{r.yourAnswer ?? 'Not answered'}</b> · Correct answer: <b>{r.correctAnswer}</b></p>
              {r.explanation ? (
                <div><QuestionMarkdownRenderer content={r.explanation} baseDir={r.baseDir} /><SpeakExplanationButton text={r.explanation} className="mt-2" /></div>
              ) : <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No explanation was recorded for this question.</p>}
            </div>
          )}
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
