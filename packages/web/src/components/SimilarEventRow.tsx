import type { SimilarEvent } from '../types/index.js';
import { formatRelativeTime } from '../lib/format.js';

export function SimilarEventRow({ event }: { event: SimilarEvent }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border-default bg-bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">{event.title}</div>
      </div>
      <div className="font-mono text-xs text-text-secondary">
        {event.date ? formatRelativeTime(event.date) : ''}
        {event.move ? ` · ${event.move}` : ''}
      </div>
    </div>
  );
}
