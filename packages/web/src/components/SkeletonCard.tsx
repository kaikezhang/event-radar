export function SkeletonCard() {
  return (
    <div
      className="rounded-2xl border border-border-default bg-bg-surface p-4 animate-pulse"
      data-testid="skeleton-card"
      aria-hidden="true"
    >
      <div className="flex gap-2 mb-3">
        <div className="h-4 w-16 rounded bg-bg-elevated" />
        <div className="h-4 w-24 rounded bg-bg-elevated" />
      </div>
      <div className="h-5 w-full rounded bg-bg-elevated mb-2" />
      <div className="h-5 w-3/4 rounded bg-bg-elevated mb-2" />
      <div className="h-4 w-full rounded bg-bg-elevated" />
    </div>
  );
}
