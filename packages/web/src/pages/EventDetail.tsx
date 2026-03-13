import { ArrowLeft, ExternalLink, Share2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { StatCard } from '../components/StatCard.js';
import { TickerChip } from '../components/TickerChip.js';
import { EmptyState } from '../components/EmptyState.js';
import { formatPercent, formatRelativeTime } from '../lib/format.js';
import { submitFeedback } from '../lib/api.js';
import { useEventDetail } from '../hooks/useEventDetail.js';
import { cn } from '../lib/utils.js';

export function EventDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data, isLoading } = useEventDetail(id);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showAllSimilar, setShowAllSimilar] = useState(false);

  const similarEvents = data?.historicalPattern?.similarEvents ?? [];
  const visibleSimilarEvents = useMemo(() => {
    return showAllSimilar ? similarEvents : similarEvents.slice(0, 3);
  }, [similarEvents, showAllSimilar]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-[24px] border border-white/8 bg-bg-primary/90 px-4 py-3 backdrop-blur-md">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/8 px-4 py-2 text-sm text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <Share2 className="h-5 w-5 text-text-secondary" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="⚠️"
        title="Alert not found"
        description="This event could not be loaded."
        ctaLabel="Back to feed"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 flex items-center justify-between rounded-[24px] border border-white/8 bg-bg-primary/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/8 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (navigator.share) {
              void navigator.share({ title: data.title, url: window.location.href });
              return;
            }
            void navigator.clipboard?.writeText(window.location.href);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/8 px-3 py-2 text-text-secondary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          aria-label="Share alert"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Header card */}
      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <SeverityBadge severity={data.severity} />
        <h1 className="mt-4 text-[20px] font-semibold leading-7 text-text-primary">{data.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>{data.source}</span>
          <span>·</span>
          {data.tickers.map((ticker) => (
            <TickerChip key={ticker} symbol={ticker} className="px-2.5 py-1.5 text-xs" />
          ))}
          <span className="font-mono">{formatRelativeTime(data.time)}</span>
        </div>
      </section>

      {/* AI Summary */}
      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <h2 className="text-[17px] font-semibold leading-[1.4] text-text-primary">Summary</h2>
        <p className="mt-3 text-[15px] leading-7 text-text-secondary">{data.aiAnalysis.summary}</p>
      </section>

      {/* Market Context */}
      {data.aiAnalysis.tickerDirections.length > 0 && (
        <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
          <h2 className="text-[17px] font-semibold leading-[1.4] text-text-primary">Market Context</h2>
          <div className="mt-4 space-y-3">
            {data.aiAnalysis.tickerDirections.map((td) => (
              <div
                key={td.symbol}
                className="flex items-start gap-3 rounded-2xl border border-white/6 bg-bg-elevated/70 p-4"
              >
                <span
                  className={cn(
                    'mt-0.5 font-mono text-sm font-semibold',
                    td.direction === 'bullish' ? 'text-emerald-300' :
                    td.direction === 'bearish' ? 'text-severity-critical' :
                    'text-text-secondary',
                  )}
                >
                  {td.direction === 'bullish' ? '▲' : td.direction === 'bearish' ? '▼' : '•'} ${td.symbol}
                </span>
                <p className="text-[15px] leading-6 text-text-secondary">
                  {td.context || td.direction}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Historical Pattern */}
      {data.historicalPattern.matchCount > 0 && (
        <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold leading-[1.4] text-text-primary">Historical Pattern</h2>
            <div className="rounded-full bg-white/6 px-3 py-1 text-sm font-medium text-text-primary">
              {data.historicalPattern.confidence} confidence
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard value={String(data.historicalPattern.matchCount)} label="Matches found" />
            {data.historicalPattern.avgMoveT5 != null && (
              <StatCard value={formatPercent(data.historicalPattern.avgMoveT5)} label="Avg move T+5" />
            )}
            {data.historicalPattern.avgMoveT20 != null && (
              <StatCard value={formatPercent(data.historicalPattern.avgMoveT20)} label="Avg move T+20" />
            )}
            {data.historicalPattern.winRate != null && (
              <StatCard value={`${data.historicalPattern.winRate}%`} label="Win rate" />
            )}
          </div>
        </section>
      )}

      {/* Similar Events */}
      {similarEvents.length > 0 && (
        <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
          <h2 className="text-[17px] font-semibold leading-[1.4] text-text-primary">Similar Events</h2>
          <div className="mt-4 space-y-3">
            {visibleSimilarEvents.map((event, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl border border-white/6 bg-bg-elevated/70 p-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">{event.title}</p>
                  <p className="mt-1 font-mono text-xs text-text-secondary">
                    {event.date ? formatRelativeTime(event.date) : ''}
                    {event.move ? ` · ${event.move}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {similarEvents.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllSimilar((c) => !c)}
              className="mt-4 inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              {showAllSimilar ? 'Show fewer' : `Show all ${similarEvents.length} →`}
            </button>
          )}
        </section>
      )}

      {/* Source link */}
      {data.url && (
        <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            View original source <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      )}

      {/* Feedback */}
      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <h2 className="text-base font-semibold text-text-primary">Was this useful?</h2>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => { setFeedback('up'); void submitFeedback(data.id, true); }}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
              feedback === 'up'
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 text-text-primary hover:bg-white/6',
            )}
          >
            <ThumbsUp className="h-4 w-4" /> Yes
          </button>
          <button
            type="button"
            onClick={() => { setFeedback('down'); void submitFeedback(data.id, false); }}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
              feedback === 'down'
                ? 'border-severity-critical/40 bg-severity-critical/10 text-severity-critical'
                : 'border-white/10 text-text-primary hover:bg-white/6',
            )}
          >
            <ThumbsDown className="h-4 w-4" /> No
          </button>
        </div>
      </section>

      {/* Legal disclaimer */}
      <footer className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-xs leading-5 text-text-secondary">
        <p className="font-semibold">⚖️ Disclaimer</p>
        <p className="mt-1">
          Event Radar provides AI-processed market event notifications for informational purposes only. 
          Content may be generated or summarized by AI and could contain errors or inaccuracies. 
          This is not financial advice, and should not be relied upon as the sole basis for any 
          investment decision. Always verify information with official sources and consult a qualified 
          financial advisor before making investment decisions. Past performance and historical patterns 
          are not indicative of future results.
        </p>
      </footer>
    </div>
  );
}
