import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  /** Numbers are right-aligned. */
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  /** Header becomes a button that calls `onSort(key)`. */
  sortable?: boolean;
}

interface DataTableProps<T> {
  /** Names the table for screen readers (and is its accessible name). */
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  testId?: string;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  /** When set, the row with this key shows `renderDetail(row)` in a full-width row beneath it. */
  expandedKey?: string | null;
  renderDetail?: (row: T) => ReactNode;
}

const STICKY = 'sticky left-0 z-[1]';

/**
 * The one table every result screen uses. On a phone the table scrolls sideways INSIDE its own container (the page never does)
 * and the first column stays pinned so rows stay readable; numbers are right-aligned; every header is a real column header.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, testId, sort, onSort, expandedKey = null, renderDetail }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }} role="region" aria-label={caption} tabIndex={0} data-testid={testId}>
      <table className="w-full text-xs border-collapse min-w-[32rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr style={{ background: 'var(--border)' }}>
            {columns.map((c, i) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={c.sortable ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={`px-2.5 py-2 font-semibold whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${i === 0 ? STICKY : ''}`}
                  style={{ color: 'var(--text-secondary)', ...(i === 0 ? { background: 'var(--border)' } : {}) }}>
                  {c.sortable && onSort ? (
                    <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 min-h-11 -my-2 font-semibold">
                      {c.header}
                      {active ? (sort!.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />) : <ChevronsUpDown size={12} aria-hidden className="opacity-50" />}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const open = expandedKey === key;
            return (
              <FragmentRows key={key} open={open} detail={open && renderDetail ? renderDetail(row) : null} colSpan={columns.length}>
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-2.5 py-2 align-top ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${i === 0 ? STICKY : ''}`}
                    style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)', ...(i === 0 ? { background: 'var(--card)' } : {}) }}>
                    {c.render(row)}
                  </td>
                ))}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRows({ children, detail, colSpan }: { children: ReactNode; open: boolean; detail: ReactNode; colSpan: number }) {
  return (
    <>
      <tr>{children}</tr>
      {detail && (
        <tr>
          <td colSpan={colSpan} className="px-3 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}>{detail}</td>
        </tr>
      )}
    </>
  );
}
