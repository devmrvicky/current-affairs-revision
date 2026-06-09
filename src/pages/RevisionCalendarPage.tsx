import { useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Clock, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { useHistoryStore } from '../store/historyStore';
import { useAvailableDates } from '../hooks/useAvailableDates';
import { loadQuizByFileName } from '../services/quizService';
import { formatDateKey } from '../utils';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── Single day cell ──────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  isAvailable: boolean;
  isCompleted: boolean;
  onClick: (date: Date) => void;
}

const DayCell = memo(function DayCell({
  date, isToday, isCurrentMonth, isAvailable, isCompleted, onClick
}: DayCellProps) {
  const isFuture = date > new Date();
  const canClick = isAvailable && !isFuture;

  return (
    <motion.button
      whileHover={canClick ? { scale: 1.08 } : {}}
      whileTap={canClick ? { scale: 0.94 } : {}}
      onClick={() => canClick && onClick(date)}
      disabled={!canClick}
      className={`
        relative flex flex-col items-center justify-center
        w-full aspect-square rounded-xl text-sm font-medium transition-all
        ${!isCurrentMonth ? 'opacity-25' : ''}
        ${isToday ? 'ring-2 ring-brand-500 ring-offset-1' : ''}
        ${isCompleted
          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
          : isAvailable && !isFuture
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 cursor-pointer'
          : isFuture && isCurrentMonth
          ? 'opacity-40 cursor-not-allowed'
          : 'cursor-default'
        }
      `}
      style={!isCompleted && !isAvailable ? { color: 'var(--text-secondary)' } : undefined}
      title={
        isCompleted ? 'Completed' :
        isAvailable && !isFuture ? 'Click to attempt' :
        isFuture ? 'Future date' :
        'No quiz available'
      }
    >
      <span className={`text-sm leading-none ${isToday ? 'font-bold' : ''}`}>
        {date.getDate()}
      </span>

      {/* Status dot */}
      <span className="mt-0.5">
        {isCompleted
          ? <span className="block w-1.5 h-1.5 rounded-full bg-green-500" />
          : isAvailable && !isFuture
          ? <span className="block w-1.5 h-1.5 rounded-full bg-brand-400" />
          : null
        }
      </span>
    </motion.button>
  );
});

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RevisionCalendarPage() {
  const navigate = useNavigate();
  const { startSession } = useQuizStore();
  const { tests, load: loadHistory } = useHistoryStore();
  const { availableSet, fileNameByDate, isLoading: datesLoading } = useAvailableDates();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [isStarting, setIsStarting] = useState(false);

  // Set of dateKeys that have been completed (saved in history)
  const completedSet = useMemo(() => {
    const s = new Set<string>();
    tests.forEach((t) => {
      if (!t.isRevision) s.add(t.date); // t.date is YYYY-MM-DD
    });
    return s;
  }, [tests]);

  // Build calendar grid for the viewed month
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const cells: (Date | null)[] = [];

    // Padding before month start
    for (let i = 0; i < startPad; i++) {
      const d = new Date(viewYear, viewMonth, 1 - (startPad - i));
      cells.push(d);
    }
    // Days in month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push(new Date(viewYear, viewMonth, d));
    }
    // Pad to full rows of 7
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1]!;
      cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
    }
    return cells;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const handleDateClick = useCallback(async (date: Date) => {
    const dateKey = formatDateKey(date);
    const fileName = fileNameByDate[dateKey];
    if (!fileName) {
      toast.error('No current affairs file available for this date');
      return;
    }

    setIsStarting(true);
    try {
      const quiz = await loadQuizByFileName(fileName);
      if (!quiz) {
        toast.error('Failed to load quiz — file may be corrupted', { duration: 4000 });
        return;
      }
      startSession(quiz, fileName);
      navigate('/quiz');
    } catch {
      toast.error('Failed to load quiz for this date');
    } finally {
      setIsStarting(false);
    }
  }, [fileNameByDate, startSession, navigate]);

  // Stats for the current view month
  const monthStats = useMemo(() => {
    let available = 0, completed = 0;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = formatDateKey(new Date(viewYear, viewMonth, d));
      if (availableSet.has(dateKey)) available++;
      if (completedSet.has(dateKey)) completed++;
    }
    return { available, completed };
  }, [viewYear, viewMonth, availableSet, completedSet]);

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
          <Calendar size={20} className="text-brand-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Revision Calendar
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Pick any date to attempt its current affairs
          </p>
        </div>
      </div>

      {/* Month stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Available', value: monthStats.available, icon: Calendar, color: '#6366f1', bg: '#6366f118' },
          { label: 'Completed', value: monthStats.completed, icon: CheckCircle2, color: '#22c55e', bg: '#22c55e18' },
          { label: 'Remaining', value: Math.max(0, monthStats.available - monthStats.completed), icon: Clock, color: '#f59e0b', bg: '#f59e0b18' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-3 text-center">
            <div className="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center" style={{ background: bg }}>
              <Icon size={16} style={{ color }} />
            </div>
            <p className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Calendar Card */}
      <div className="card p-5">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={prevMonth}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>

          <div className="text-center">
            <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h2>
            {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
              <button
                onClick={() => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); }}
                className="text-xs text-brand-500 font-medium mt-0.5 hover:underline"
              >
                Back to today
              </button>
            )}
          </div>

          <button
            onClick={nextMonth}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 mb-2">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold uppercase tracking-wide py-1"
              style={{ color: 'var(--text-muted)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        {datesLoading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl shimmer" style={{ background: 'var(--border)' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarGrid.map((date, i) => {
              if (!date) return <div key={i} />;
              const dateKey = formatDateKey(date);
              const isCurrentMonth = date.getMonth() === viewMonth;
              const isToday = dateKey === formatDateKey(today);
              const isAvailable = availableSet.has(dateKey);
              const isCompleted = completedSet.has(dateKey);
              return (
                <DayCell
                  key={dateKey + i}
                  date={date}
                  isToday={isToday}
                  isCurrentMonth={isCurrentMonth}
                  isAvailable={isAvailable}
                  isCompleted={isCompleted}
                  onClick={handleDateClick}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="card p-4">
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Legend</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { dot: 'bg-brand-400', label: 'Available to attempt' },
            { dot: 'bg-green-500', label: 'Completed' },
            { dot: 'ring-2 ring-brand-500', label: "Today's date", extraClass: 'rounded-sm' },
            { dot: 'bg-gray-300 dark:bg-gray-600 opacity-40', label: 'Future / unavailable' },
          ].map(({ dot, label, extraClass }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot} ${extraClass ?? ''}`} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Loading overlay for quiz start */}
      {isStarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="card px-8 py-6 flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Loading quiz…</p>
          </div>
        </div>
      )}
    </div>
  );
}
