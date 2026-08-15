import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { formatTime } from '../../utils';

interface QuizTimerProps {
  startTime: number;
  totalPausedTime: number;
  isPaused: boolean;
  pausedAt?: number;
  onTick?: (elapsed: number) => void;
  /** When set, the timer counts DOWN from this many seconds and fires `onExpire` once at zero — used by timed mock tests. Omit for the default count-up stopwatch. */
  durationSeconds?: number;
  onExpire?: () => void;
}

export function QuizTimer({ startTime, totalPausedTime, isPaused, pausedAt, onTick, durationSeconds, onExpire }: QuizTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number>(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    function update() {
      if (isPaused) return;
      const rawElapsed = (Date.now() - startTime) / 1000;
      const paused = totalPausedTime / 1000;
      const currentPause = isPaused && pausedAt ? (Date.now() - pausedAt) / 1000 : 0;
      const e = Math.floor(rawElapsed - paused - currentPause);
      setElapsed(e);
      onTick?.(e);

      if (durationSeconds !== undefined && e >= durationSeconds && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
        return; // stop the loop — test has ended
      }

      rafRef.current = requestAnimationFrame(update);
    }

    if (!isPaused) {
      rafRef.current = requestAnimationFrame(update);
    }

    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [startTime, totalPausedTime, isPaused, pausedAt, onTick, durationSeconds, onExpire]);

  const remaining = durationSeconds !== undefined ? Math.max(0, durationSeconds - elapsed) : undefined;
  const displaySeconds = remaining ?? elapsed;

  const isWarning = remaining !== undefined ? remaining <= 300 : elapsed > 1800; // countdown: 5 min left; stopwatch: 30 min elapsed
  const isDanger = remaining !== undefined ? remaining <= 60 : elapsed > 3600; // countdown: 1 min left; stopwatch: 1 hr elapsed

  return (
    <div className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-mono font-semibold text-xs sm:text-sm transition-colors flex-shrink-0 ${
      isDanger ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
      isWarning ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
      'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
    }`}>
      <Timer size={13} className="flex-shrink-0" />
      {isPaused ? (
        <span className="animate-pulse">⏸ Timer Paused</span>
      ) : (
        <span>{formatTime(displaySeconds)}</span>
      )}
    </div>
  );
}
