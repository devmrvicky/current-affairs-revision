import { ArrowDownWideNarrow, ArrowUpWideNarrow, Shuffle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { QuestionOrderMode } from '../../types/questionOrder';

interface QuestionPaletteControlsProps {
  orderMode: QuestionOrderMode;
  onOrderModeChange: (mode: QuestionOrderMode) => void;
  disabled?: boolean;
}

type OrderButton = {
  mode: Exclude<QuestionOrderMode, 'original'>;
  label: string;
  accessibleLabel: string;
  title: string;
  Icon: LucideIcon;
};

const ORDER_BUTTONS: OrderButton[] = [
  {
    mode: 'shuffle',
    label: 'Shuffle',
    accessibleLabel: 'Shuffle questions',
    title: 'Shuffle upcoming questions',
    Icon: Shuffle,
  },
  {
    mode: 'hard-to-easy',
    label: 'Hard → Easy',
    accessibleLabel: 'Sort hard to easy',
    title: 'Sort from hard to easy',
    Icon: ArrowDownWideNarrow,
  },
  {
    mode: 'easy-to-hard',
    label: 'Easy → Hard',
    accessibleLabel: 'Sort easy to hard',
    title: 'Sort from easy to hard',
    Icon: ArrowUpWideNarrow,
  },
];

/** The three ordering controls, displayed at the bottom of each question palette. */
export function QuestionPaletteControls({
  orderMode,
  onOrderModeChange,
  disabled = false,
}: QuestionPaletteControlsProps) {
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3" aria-label="Question ordering controls">
      <div className="grid grid-cols-3 gap-2">
        {ORDER_BUTTONS.map(({ mode, label, accessibleLabel, title, Icon }) => {
          const active = orderMode === mode;
          const isShuffle = mode === 'shuffle';
          const activeColor = isShuffle ? '#16a34a' : 'var(--brand, #6366f1)';

          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              aria-label={accessibleLabel}
              aria-pressed={active}
              onClick={() => onOrderModeChange(active ? 'original' : mode)}
              title={active ? `${title}. Click again to restore original order.` : title}
              className="group flex min-h-[70px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-center transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={active
                ? {
                    background: activeColor,
                    borderColor: activeColor,
                    color: '#fff',
                    boxShadow: `0 3px 10px ${isShuffle ? 'rgba(22,163,74,0.22)' : 'rgba(99,102,241,0.20)'}`,
                  }
                : {
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={active
                  ? { background: 'rgba(255,255,255,0.18)', color: '#fff' }
                  : { background: 'var(--bg)', color: 'var(--text-primary)' }}
              >
                <Icon size={18} strokeWidth={2.25} />
              </span>
              <span className="whitespace-nowrap text-[10px] font-semibold leading-tight sm:text-[11px]">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
