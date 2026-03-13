import { useState } from 'react';
import { ChevronDown, ChevronUp, Siren, TriangleAlert } from 'lucide-react';
import type { ScannerDetail } from '../types/api.js';
import { formatPollInterval } from '../lib/dashboard.js';
import { cn, timeAgo } from '../lib/utils.js';
import { useScannerEvents } from '../hooks/queries.js';
import { Card } from './Card.js';
import { StatusBadge } from './StatusBadge.js';
import { LoadingSpinner } from './LoadingSpinner.js';

interface ScannerCardProps {
  scanner: ScannerDetail;
}

const statusColor: Record<string, string> = {
  healthy: 'text-radar-green',
  degraded: 'text-radar-amber',
  down: 'text-radar-red',
};

const borderColor: Record<string, string> = {
  healthy: 'border-radar-border',
  degraded: 'border-radar-amber/30',
  down: 'border-radar-red/30',
};

export function ScannerCard({ scanner }: ScannerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cadence = formatPollInterval(scanner.poll_interval_ms);
  const { data, isLoading, error } = useScannerEvents(scanner.name, expanded);
  const events = data?.events ?? [];
  const oneHourAgo = Date.now() - 3_600_000;
  const hourlyRate = `${events.filter((event) => new Date(event.received_at).getTime() >= oneHourAgo).length}/hr`;
  const showHourlyRate = expanded && data != null;

  return (
    <Card
      className={cn(
        'p-0 transition-colors',
        borderColor[scanner.status] ?? 'border-radar-border',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={`${scanner.name}-events`}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  statusColor[scanner.status] === 'text-radar-green'
                    ? 'bg-radar-green'
                    : statusColor[scanner.status] === 'text-radar-amber'
                      ? 'bg-radar-amber'
                      : 'bg-radar-red',
                )}
              />
              <span className="text-sm font-medium">{scanner.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={scanner.status} />
              <span className="text-xs text-radar-text-muted">Last: {scanner.last_scan}</span>
              {showHourlyRate ? (
                <span className="text-xs text-radar-text-muted">1h rate: {hourlyRate}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {scanner.error_count > 0 && (
              <span className="text-xs font-medium text-radar-red">
                {scanner.error_count} error{scanner.error_count !== 1 ? 's' : ''}
              </span>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-radar-text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-radar-text-muted" />
            )}
          </div>
        </div>
        {cadence && (
          <div className="mt-2 text-xs text-radar-text-muted">Expected: {cadence}</div>
        )}
        {scanner.in_backoff && (
          <div className="mt-1 text-xs font-medium text-radar-amber">In backoff</div>
        )}
      </button>

      {expanded && (
        <div id={`${scanner.name}-events`} className="border-t border-radar-border px-3 pb-3 pt-3">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-radar-text-muted">
                Recent Events
              </div>
              {isLoading ? (
                <LoadingSpinner className="p-4" />
              ) : error ? (
                <div className="rounded-md border border-radar-red/30 bg-radar-red/5 px-3 py-2 text-xs text-radar-red">
                  {error.message}
                </div>
              ) : data?.events.length ? (
                <div className="space-y-2">
                  {data.events.map((event) => (
                    <div key={event.id} className="rounded-md border border-radar-border bg-radar-bg/70 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-radar-text">{event.title}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-radar-text-muted">
                            {event.summary}
                          </div>
                        </div>
                        <StatusBadge status={event.severity} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        {event.tickers.map((ticker) => (
                          <span key={ticker} className="rounded bg-radar-amber/10 px-1.5 py-0.5 font-mono text-radar-amber">
                            {ticker}
                          </span>
                        ))}
                        <span className="text-radar-text-muted">{timeAgo(event.received_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-radar-border bg-radar-bg/60 px-3 py-4 text-sm text-radar-text-muted">
                  No recent events from this scanner
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-md border border-radar-border bg-radar-bg/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-radar-text-muted">
                  <Siren className="h-3.5 w-3.5" />
                  Scanner Health
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-radar-text-muted">Cadence</span>
                    <span className="font-mono">{cadence ?? 'n/a'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-radar-text-muted">Errors</span>
                    <span className="font-mono">{scanner.error_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-radar-text-muted">Consecutive</span>
                    <span className="font-mono">{scanner.consecutive_errors ?? scanner.error_count} consecutive</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-radar-border bg-radar-bg/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-radar-text-muted">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Recent Error Details
                </div>
                <div className="text-xs text-radar-text-muted">
                  {scanner.message ?? 'No recent scanner error details recorded'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
