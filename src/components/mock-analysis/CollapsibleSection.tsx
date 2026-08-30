import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Every section on the result dashboard uses this so mobile users get a scannable, tap-to-expand page instead of one long scroll (product spec: "Use collapsible sections on mobile"). Open by default on desktop-width screens via defaultOpen, but the accordion behavior itself is consistent everywhere — simplest correct approach for all breakpoints. */
export function CollapsibleSection({ title, subtitle, icon, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="flex-shrink-0" style={{ color: 'var(--brand-500, #6366f1)' }}>{icon}</span>}
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            {subtitle && <p className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
        </div>
        <ChevronDown size={18} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}
