export function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  if (high === low) {
    return (
      <div className="mt-3 px-1">
        <div className="flex items-center justify-between text-[10px] text-text-secondary mb-1">
          <span>${low.toFixed(0)}</span>
          <span>52-Week Range</span>
          <span>${high.toFixed(0)}</span>
        </div>
        <div className="relative h-1.5 rounded-full bg-overlay-medium">
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-accent-default border-2 border-bg-surface"
            style={{ left: '50%' }}
          />
        </div>
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div className="mt-3 px-1">
      <div className="flex items-center justify-between text-[10px] text-text-secondary mb-1">
        <span>${low.toFixed(0)}</span>
        <span>52-Week Range</span>
        <span>${high.toFixed(0)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-overlay-medium">
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-accent-default border-2 border-bg-surface"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
