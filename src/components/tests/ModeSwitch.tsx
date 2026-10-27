import { Zap, ClipboardList } from 'lucide-react';
import type { SessionMode } from '../../types/practiceSession';

/** Compact Practice | Test segmented control — Practice reveals answers instantly and is untimed; Test is timed with no reveal. */
export function ModeSwitch({ mode, onChange, className = '' }: { mode: SessionMode; onChange: (mode: SessionMode) => void; className?: string }) {
  const options: { id: SessionMode; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: 'practice', label: 'Practice', icon: <Zap size={12} />, hint: 'Instant feedback, no timer' },
    { id: 'test', label: 'Test', icon: <ClipboardList size={12} />, hint: 'Timed, answers revealed at the end' },
  ];
  return (
    <div role="radiogroup" aria-label="Session mode" className={`inline-flex p-0.5 rounded-lg ${className}`} style={{ background: 'var(--border)' }}>
      {options.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className="px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            style={active ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
          >
            {o.icon} {o.label}
          </button>
        );
      })}
    </div>
  );
}
