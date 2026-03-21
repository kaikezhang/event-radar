import { formatRelativeTime } from '../../lib/format.js';
import type { SimilarEvent } from '../../types/index.js';
import { SectionHeading } from './shared.js';

interface SimilarPastEventsProps {
  similarEvents: SimilarEvent[];
}

export function SimilarPastEvents({ similarEvents }: SimilarPastEventsProps) {
  const preview = similarEvents.slice(0, 3);

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Historical context" title="📜 Similar Past Events" />

      {preview.length === 0 ? (
        <p className="text-sm text-text-secondary">No similar past events found for this ticker</p>
      ) : (
        <div className="space-y-2">
          {preview.map((event, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg border border-border-default bg-bg-elevated/50 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{event.title}</p>
                <p className="mt-0.5 font-mono text-xs text-text-secondary">
                  {event.date ? formatRelativeTime(event.date) : ''}
                </p>
              </div>
              {event.move && (
                <span className="ml-3 shrink-0 font-mono text-sm font-medium text-text-primary">
                  {event.move}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
