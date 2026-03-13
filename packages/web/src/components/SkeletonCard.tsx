export function SkeletonCard() {
  return (
    <div
      className="overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.24)]"
      data-testid="skeleton-card"
      aria-hidden="true"
    >
      <div className="mb-3 h-4 w-32 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none" />
      <div className="mb-2 h-5 w-11/12 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
      <div className="mb-2 h-4 w-10/12 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none" />
      <div className="h-4 w-7/12 animate-pulse rounded-full bg-white/7 motion-reduce:animate-none" />
    </div>
  );
}
