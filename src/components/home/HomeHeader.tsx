import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useStatisticsStore } from '../../store/statsStore';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

/** Greeting, the selected exam, and the study streak — the streak is the real stored one (nothing shown until stats have loaded). */
export function HomeHeader({ examName }: { examName?: string }) {
  const navigate = useNavigate();
  const stats = useStatisticsStore((s) => s.stats);
  const streak = stats?.currentStreak ?? 0;
  return (
    <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-display font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Good {greeting()}! 👋</h1>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          {examName ?? 'Choose your exam'}
          <button type="button" onClick={() => navigate('/exams')} className="ml-2 min-h-11 px-1 text-sm font-medium text-brand-500 hover:text-brand-600">{examName ? 'Change exam' : 'Choose'}</button>
        </p>
      </div>
      {stats && (
        <div data-testid="home-streak" className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <Flame size={16} className={streak > 0 ? 'text-orange-500' : ''} aria-hidden />
          {streak > 0 ? `${streak}-day study streak` : 'No streak yet — study today to start one'}
        </div>
      )}
    </motion.header>
  );
}
