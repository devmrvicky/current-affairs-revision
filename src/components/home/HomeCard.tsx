import type { ReactNode } from 'react';

interface HomeCardProps {
  title: string;
  icon?: ReactNode;
  /** A small link/button at the right of the title. */
  action?: ReactNode;
  testId?: string;
  children: ReactNode;
}

/** The one frame every Home section uses, so they all look and read the same. A labelled region for screen readers. */
export function HomeCard({ title, icon, action, testId, children }: HomeCardProps) {
  return (
    <section className="card p-4 sm:p-5 min-w-0" aria-label={title} data-testid={testId}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="flex items-center gap-2 font-display font-semibold text-sm min-w-0" style={{ color: 'var(--text-primary)' }}>
          {icon}<span className="truncate">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-9 rounded-xl shimmer" style={{ background: 'var(--border)' }} />)}
    </div>
  );
}

export function CardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="text-sm">
      <p style={{ color: 'var(--text-secondary)' }}>Couldn't load this section. {message}</p>
      <button type="button" onClick={onRetry} className="btn-secondary mt-2 px-4 py-2 text-xs">Try again</button>
    </div>
  );
}

/** An honest empty state: says what is missing and offers one useful next step. */
export function CardEmpty({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-2 min-h-11 text-sm font-medium text-brand-500 hover:text-brand-600">{actionLabel} →</button>
      )}
    </div>
  );
}
