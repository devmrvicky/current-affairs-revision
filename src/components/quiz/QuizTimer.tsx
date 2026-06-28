import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { formatTime } from '../../utils';

interface QuizTimerProps {
  startTime: number;
  totalPausedTime: number;
  isPaused: boolean;
  pausedAt?: number;
  onTick?: (elapsed: number) => void;
}

export function QuizTimer({ startTime, totalPausedTime, isPaused, pausedAt, onTick }: QuizTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function update() {
      if (isPaused) return;
      const rawElapsed = (Date.now() - startTime) / 1000;
      const paused = totalPausedTime / 1000;
      const currentPause = isPaused && pausedAt ? (Date.now() - pausedAt) / 1000 : 0;
      const e = Math.floor(rawElapsed - paused - currentPause);
      setElapsed(e);
      onTick?.(e);
      rafRef.current = requestAnimationFrame(update);
    }

    if (!isPaused) {
      rafRef.current = requestAnimationFrame(update);
    }

    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [startTime, totalPausedTime, isPaused, pausedAt, onTick]);

  const isWarning = elapsed > 1800; // 30 min warning
  const isDanger = elapsed > 3600; // 1 hour

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
        <span>{formatTime(elapsed)}</span>
      )}
    </div>
  );
}
