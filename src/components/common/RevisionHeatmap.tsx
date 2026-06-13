import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import type { DailyStats } from '../../types';

interface HeatmapProps {
  dailyStats: DailyStats[];
  weeks?: number;
}

function getIntensity(questions: number): 0 | 1 | 2 | 3 | 4 {
  if (questions === 0) return 0;
  if (questions < 10) return 1;
  if (questions < 25) return 2;
  if (questions < 50) return 3;
  return 4;
}

const INTENSITY_CLASSES = [
  'bg-gray-100 dark:bg-white/5',
  'bg-brand-200 dark:bg-brand-900/60',
  'bg-brand-300 dark:bg-brand-700/80',
  'bg-brand-400 dark:bg-brand-500',
  'bg-brand-500 dark:bg-brand-400',
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['','M','','W','','F',''];

export const RevisionHeatmap = memo(function RevisionHeatmap({ dailyStats, weeks = 17 }: HeatmapProps) {
  const { cells, monthLabels, totalActive, longestStreak } = useMemo(() => {
    const statsMap = new Map<string, number>();
    dailyStats.forEach((s) => statsMap.set(s.date, s.totalQuestions));

    const today = new Date();
    const totalDays = weeks * 7;
    const cells: { date: string; questions: number; intensity: 0|1|2|3|4 }[] = [];

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const questions = statsMap.get(key) ?? 0;
      cells.push({ date: key, questions, intensity: getIntensity(questions) });
    }

    // Month labels for the grid (show at first Sunday of each month visible)
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    cells.forEach((cell, i) => {
      const col = Math.floor(i / 7);
      const month = parseInt(cell.date.split('-')[1]) - 1;
      if (month !== lastMonth) {
        monthLabels.push({ col, label: MONTH_NAMES[month] });
        lastMonth = month;
      }
    });

    const totalActive = cells.filter((c) => c.questions > 0).length;

    // Compute longest streak
    let longest = 0, current = 0;
    cells.forEach((c) => {
      if (c.questions >= 10) { current++; longest = Math.max(longest, current); }
      else current = 0;
    });

    return { cells, monthLabels, totalActive, longestStreak: longest };
  }, [dailyStats, weeks]);

  // Build columns (each column = 1 week, 7 cells)
  const columns = useMemo(() => {
    const cols: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      cols.push(cells.slice(i, i + 7));
    }
    return cols;
  }, [cells]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>
          Revision Heatmap
        </h3>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{totalActive} active days</span>
          <span>🔥 {longestStreak} day streak</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${weeks * 13}px` }}>
          {/* Month labels */}
          <div className="flex mb-1 ml-5">
            {columns.map((_, colIdx) => {
              const label = monthLabels.find((m) => m.col === colIdx);
              return (
                <div key={colIdx} className="w-3 mr-0.5 text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                  {label?.label ?? ''}
                </div>
              );
            })}
          </div>

          {/* Day labels + grid */}
          <div className="flex gap-0">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-0.5 mr-1">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="h-3 flex items-center text-right" style={{ color: 'var(--text-muted)', fontSize: '9px', width: '14px' }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Heatmap cells */}
            <div className="flex gap-0.5">
              {columns.map((col, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-0.5">
                  {col.map((cell, rowIdx) => (
                    <div
                      key={cell.date}
                      title={`${cell.date}: ${cell.questions} questions`}
                      className={`w-3 h-3 rounded-sm flex-shrink-0 transition-colors ${INTENSITY_CLASSES[cell.intensity]}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Less</span>
        {INTENSITY_CLASSES.map((cls, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
        ))}
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  );
});
