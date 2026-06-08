import { BookX, WifiOff, AlertTriangle, Clock, Search } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--border)' }}>
        {icon ?? <BookX size={28} style={{ color: 'var(--text-muted)' }} />}
      </div>
      <h3 className="text-lg font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export function NoQuizToday() {
  return (
    <div className="card p-8 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-3xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-6">
        <Clock size={36} className="text-amber-500" />
      </div>
      <h2 className="text-xl font-display font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        No Current Affairs Available Today
      </h2>
      <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        The question file for today hasn't been uploaded yet. Check back later or practice with previous days' tests.
      </p>
    </div>
  );
}

export function NoSearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<Search size={28} style={{ color: 'var(--text-muted)' }} />}
      title="No results found"
      description={`No tests match "${query}". Try a different search term.`}
    />
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
        <AlertTriangle size={28} className="text-red-500" />
      </div>
      <h3 className="text-lg font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Something went wrong
      </h3>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {message ?? 'An unexpected error occurred. Please try again.'}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          Try Again
        </button>
      )}
    </div>
  );
}

export function OfflineState() {
  return (
    <EmptyState
      icon={<WifiOff size={28} className="text-gray-400" />}
      title="You're offline"
      description="Some features may not work. Your progress is saved locally."
    />
  );
}
