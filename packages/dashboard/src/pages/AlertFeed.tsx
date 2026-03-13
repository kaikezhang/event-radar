import { BellRing, ChevronRight } from 'lucide-react';
import { useDeliveryFeed } from '../hooks/queries.js';
import { Card } from '../components/Card.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ErrorDisplay, LoadingSpinner } from '../components/LoadingSpinner.js';
import { timeAgo } from '../lib/utils.js';

export function AlertFeed() {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useDeliveryFeed();

  const alerts = data?.pages.flatMap((page) => page.events) ?? [];

  if (isLoading && !data) return <LoadingSpinner />;
  if (error && !data) return <ErrorDisplay message={error.message} />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-radar-border bg-[linear-gradient(135deg,rgba(56,189,248,0.08),rgba(34,197,94,0.03),transparent)] px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-radar-blue/30 bg-radar-blue/10 p-2 text-radar-blue">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-radar-text">Alert Feed</div>
              <div className="text-sm text-radar-text-muted">
                Delivered alerts with AI context, channels, and timing.
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-radar-border bg-radar-bg/60 px-6 py-12 text-center">
              <div className="text-sm font-medium text-radar-text">No alerts delivered yet</div>
              <div className="mt-1 text-xs text-radar-text-muted">
                Delivered alerts will appear here once the pipeline sends its first notification.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <Card
                  key={alert.id}
                  className="border-radar-border/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_18px_60px_rgba(2,6,23,0.25)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-radar-text">{alert.title}</h2>
                        <span className="rounded-md border border-radar-border bg-white/5 px-2 py-0.5 font-mono text-[11px] text-radar-text-muted">
                          {alert.source}
                        </span>
                        <StatusBadge status={alert.severity} />
                      </div>
                      <div className="mt-3 max-w-3xl text-sm leading-6 text-radar-text-muted">
                        {buildAnalysisSnippet(alert.analysis, alert.impact)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-radar-text-muted">
                      <div>Delivered</div>
                      <div className="mt-1 font-mono text-radar-text">{timeAgo(alert.delivered_at)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {alert.tickers.map((ticker) => (
                      <span key={ticker} className="rounded-md bg-radar-amber/10 px-2 py-1 font-mono text-xs text-radar-amber">
                        {ticker}
                      </span>
                    ))}
                    {alert.action && (
                      <span className="rounded-md border border-radar-blue/20 bg-radar-blue/10 px-2 py-1 text-xs text-radar-blue">
                        {alert.action}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                    <div className="rounded-md border border-radar-border bg-radar-bg/60 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-radar-text-muted">
                        Regime Context
                      </div>
                      <div className="mt-1 text-sm text-radar-text-muted">
                        {alert.regime_context ?? 'No additional regime context recorded'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                      {alert.delivery_channels.map((channel) => (
                        <span
                          key={`${alert.id}-${channel.channel}`}
                          className="rounded-md border border-radar-border bg-white/5 px-2 py-1 text-xs text-radar-text"
                        >
                          {channel.channel} {channel.ok ? '✅' : '❌'}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {hasNextPage && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="inline-flex items-center gap-2 rounded-md border border-radar-border bg-radar-bg px-4 py-2 text-sm text-radar-text transition-colors hover:border-radar-green/40 hover:text-radar-green disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFetchingNextPage ? 'Loading more' : 'Load More Alerts'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function buildAnalysisSnippet(analysis: string, impact: string): string {
  const combined = [analysis, impact].filter(Boolean).join(' ');
  if (combined.length <= 200) {
    return combined;
  }

  return `${combined.slice(0, 200)}...`;
}
