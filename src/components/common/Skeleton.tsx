interface SkeletonProps {
  className?: string;
  rows?: number;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`shimmer rounded-xl ${className}`}
      style={{ background: 'var(--border)' }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-6 space-y-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function QuizCardSkeleton() {
  return (
    <div className="card p-6 space-y-6">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

export function HistoryCardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
    </div>
  );
}
