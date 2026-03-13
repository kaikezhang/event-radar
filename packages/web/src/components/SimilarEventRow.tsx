import { Link } from 'react-router-dom';
import type { SimilarEvent } from '../types/index.js';
import { formatMonthYear } from '../lib/format.js';

export function SimilarEventRow({ event }: { event: SimilarEvent }) {
  return (
    <Link
      to={`/event/${event.id}`}
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border-default bg-bg-surface px-4 py-3 transition hover:border-white/10 hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-accent-default"
    >
      <div className="min-w-0">
        <div className="mb-1 text-sm font-semibold text-text-primary">{event.symbol}</div>
        <div className="truncate text-[13px] text-text-secondary">{event.title}</div>
      </div>
      <div className="font-mono text-xs text-text-secondary">{formatMonthYear(event.occurredOn)}</div>
    </Link>
  );
}
