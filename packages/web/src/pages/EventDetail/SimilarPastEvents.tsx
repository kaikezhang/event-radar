import { formatRelativeTime } from '../../lib/format.js';
import type { SimilarEvent, SimilarEventOutcomeStats } from '../../types/index.js';
import { SectionHeading } from './shared.js';

interface SimilarPastEventsProps {
  similarEvents: SimilarEvent[];
  outcomeStats?: SimilarEventOutcomeStats | null;
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatOutcomeBadge(event: SimilarEvent): {
  label: string;
  className: string;
} {
  if (typeof event.changeT5 === 'number') {
    return event.changeT5 >= 0
      ? {
          label: `▲ ${formatSignedPercent(event.changeT5)}`,
          className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
        }
      : {
          label: `▼ ${formatSignedPercent(event.changeT5)}`,
          className: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
        };
  }

  if (event.move) {
    return {
      label: event.move,
      className: 'border-overlay-medium bg-overlay-light text-text-primary',
    };
  }

  return {
    label: 'Pending',
    className: 'border-overlay-medium bg-overlay-subtle text-text-secondary',
  };
}

export function SimilarPastEvents({ similarEvents, outcomeStats = null }: SimilarPastEventsProps) {
  const preview = similarEvents.slice(0, 3);

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Historical context" title="📜 Similar Past Events" />

      {outcomeStats && outcomeStats.totalWithOutcomes > 0 ? (
        <div className="mb-4 rounded-2xl border border-border-default bg-bg-elevated/55 p-4">
          <h3 className="text-sm font-semibold text-text-primary">
            {`📊 Historical Outcomes (${similarEvents.length} similar events)`}
          </h3>
          <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
            {outcomeStats.setupWorkedPct != null ? (
              <p>{`${outcomeStats.setupWorkedPct}% moved 5%+ (setup worked)`}</p>
            ) : null}
            {outcomeStats.avgMoveT5 != null ? (
              <p>{`Average T+5 move: ${formatSignedPercent(outcomeStats.avgMoveT5)}`}</p>
            ) : null}
            {outcomeStats.bestOutcome ? (
              <p>{`Best outcome: ${formatSignedPercent(outcomeStats.bestOutcome.changeT5)} (${outcomeStats.bestOutcome.ticker}, ${outcomeStats.bestOutcome.date ?? 'unknown'})`}</p>
            ) : null}
            {outcomeStats.worstOutcome ? (
              <p>{`Worst outcome: ${formatSignedPercent(outcomeStats.worstOutcome.changeT5)} (${outcomeStats.worstOutcome.ticker}, ${outcomeStats.worstOutcome.date ?? 'unknown'})`}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {preview.length === 0 ? (
        <p className="text-sm text-text-secondary">No similar past events found for this ticker</p>
      ) : (
        <div className="space-y-2">
          {preview.map((event, index) => {
            const outcomeBadge = formatOutcomeBadge(event);

            return (
              <div
                key={event.eventId ?? `${event.title}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-elevated/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{event.title}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-secondary">
                    {event.date ? formatRelativeTime(event.date) : ''}
                    {event.ticker ? ` · ${event.ticker}` : ''}
                  </p>
                </div>
                <span
                  className={`ml-3 shrink-0 rounded-full border px-2.5 py-1 font-mono text-xs font-medium ${outcomeBadge.className}`}
                >
                  {outcomeBadge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
