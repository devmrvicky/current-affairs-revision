import { Timer } from 'lucide-react';
import { formatClock } from '../../services/sessionTiming';

interface SectionTimerBadgeProps {
  sectionLabel: string;
  sectionNumber: number;
  sectionCount: number;
  sectionRemainingSeconds: number;
  totalRemainingSeconds: number;
}

/** Header clock for a sectional test: the active section's countdown, with the whole test's time left beneath. */
export function SectionTimerBadge({ sectionLabel, sectionNumber, sectionCount, sectionRemainingSeconds, totalRemainingSeconds }: SectionTimerBadgeProps) {
  const danger = sectionRemainingSeconds <= 60;
  const warning = sectionRemainingSeconds <= 300;
  const tone = danger ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : warning ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400';
  return (
    <div className={`flex flex-col items-end px-2.5 sm:px-3 py-1 rounded-xl font-mono flex-shrink-0 ${tone}`} data-testid="section-timer" role="timer" aria-label={`${sectionLabel} of ${sectionCount}: ${formatClock(sectionRemainingSeconds)} left`}>
      <span className="flex items-center gap-1 text-xs sm:text-sm font-semibold"><Timer size={13} aria-hidden /> {formatClock(sectionRemainingSeconds)}</span>
      <span className="text-[10px] leading-tight opacity-80 font-sans">{sectionLabel} · {sectionNumber}/{sectionCount} · total {formatClock(totalRemainingSeconds)}</span>
    </div>
  );
}
