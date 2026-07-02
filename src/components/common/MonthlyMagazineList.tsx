import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, CheckCircle2, ListChecks, Search, X, Clock, FileText } from 'lucide-react';
import { useMonthlyMagazineStore, type MonthlyMagazineCard } from '../../store/monthlyMagazineStore';
import { EmptyState } from './EmptyState';

type StatusFilter = 'all' | 'completed' | 'in-progress' | 'not-started';

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function cardStatus(card: MonthlyMagazineCard): Exclude<StatusFilter, 'all'> {
  if (card.manuallyCompleted || (card.allTestsCompleted && card.readPercent >= 95)) return 'completed';
  if (card.readPercent > 0 || card.completedTests > 0) return 'in-progress';
  return 'not-started';
}

function CardSkeleton() {
  return <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} />;
}

export function MonthlyMagazineList() {
  const navigate = useNavigate();
  const { cards, isLoading, load, toggleManualCompletion } = useMonthlyMagazineStore();

  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [monthFilter, setMonthFilter] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => { load(); }, []);

  const years = useMemo(
    () => Array.from(new Set(cards.map((c) => c.issue.year))).sort((a, b) => b - a),
    [cards]
  );
  const months = useMemo(
    () => Array.from(new Set(cards.map((c) => c.issue.month))).sort(
      (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
    ),
    [cards]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (yearFilter !== 'all' && c.issue.year !== yearFilter) return false;
      if (monthFilter !== 'all' && c.issue.month !== monthFilter) return false;
      if (statusFilter !== 'all' && cardStatus(c) !== statusFilter) return false;
      if (q && !`${c.issue.month} ${c.issue.year}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, search, yearFilter, monthFilter, statusFilter]);

  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'not-started', label: 'Not Started' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={28} style={{ color: 'var(--text-muted)' }} />}
        title="No magazines yet"
        description="Add a Year/Month folder under data/monthly-magazine/ with a .md or .json file to see it here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by month or year…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm border outline-none focus:border-brand-400"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {statusOptions.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === key ? 'bg-brand-500 text-white border-brand-500' : ''
            }`}
            style={statusFilter !== key ? { background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={28} style={{ color: 'var(--text-muted)' }} />}
          title="No matches"
          description="Try a different search term or filter combination."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((card, i) => {
            const status = cardStatus(card);
            return (
              <motion.div
                key={card.issue.issueKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="card p-4 sm:p-5 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/monthly-magazine/${encodeURIComponent(card.issue.issueKey)}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                      {card.issue.month} {card.issue.year}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1">
                        <BookOpen size={11} /> {card.readPercent}% Read
                      </span>
                      {card.totalSections > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText size={11} /> {card.completedSections}/{card.totalSections} Sections
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <ListChecks size={11} /> {card.completedTests}/{card.totalTests} Tests
                      </span>
                      {card.lastOpenedAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {new Date(card.lastOpenedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); toggleManualCompletion(card.issue.issueKey); }}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-300 dark:border-green-800' : ''
                    }`}
                    style={status !== 'completed' ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
                    title={card.manuallyCompleted ? 'Marked completed manually — click to unmark' : 'Mark as completed'}
                  >
                    <CheckCircle2 size={13} />
                    <span className="hidden sm:inline">{card.manuallyCompleted ? 'Completed' : 'Mark Completed'}</span>
                  </button>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden mt-3" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(card.readPercent, card.totalTests ? (card.completedTests / card.totalTests) * 100 : 0)}%`,
                      background: status === 'completed' ? '#22c55e' : status === 'in-progress' ? '#f59e0b' : 'var(--border)',
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
