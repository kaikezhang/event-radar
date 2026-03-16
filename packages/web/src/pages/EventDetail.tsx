import { ArrowLeft, ExternalLink, Share2, ThumbsDown, ThumbsUp, CircleCheckBig, ShieldCheck, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { StatCard } from '../components/StatCard.js';
import { TickerChip } from '../components/TickerChip.js';
import { EmptyState } from '../components/EmptyState.js';
import { formatPercent, formatPrice, formatRelativeTime } from '../lib/format.js';
import { submitFeedback } from '../lib/api.js';
import { useEventDetail } from '../hooks/useEventDetail.js';
import { cn } from '../lib/utils.js';

function formatTrustLabel(value: string | null | undefined, fallback = 'Not available') {
  if (!value) {
    return fallback;
  }

  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTrustMove(value: number | null) {
  return value == null ? 'Pending' : formatPercent(value, 2);
}

function formatSeverityLabel(value: string) {
  return `${value.charAt(0)}${value.slice(1).toLowerCase()} severity`;
}

function formatProvenanceOffset(baseTime: string, sourceTime: string) {
  const deltaMs = new Date(sourceTime).getTime() - new Date(baseTime).getTime();
  const deltaMinutes = Math.round(deltaMs / 60_000);

  if (deltaMinutes <= 0) {
    return 'Initial report';
  }

  return `${deltaMinutes}m later`;
}

function formatSignedPercent(value: number | null): string {
  if (value == null) return 'N/A';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function formatSignalLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === '🟡 Monitor' ? '⚡ Developing' : value;
}

function formatDirectionSummary(data: NonNullable<ReturnType<typeof useEventDetail>['data']>): string {
  const primaryDirection = data.enrichment?.tickers[0]?.direction
    ?? data.aiAnalysis.tickerDirections[0]?.direction
    ?? null;
  const normalizedDirection = typeof primaryDirection === 'string'
    ? primaryDirection.trim().toLowerCase()
    : null;
  const regimeContext = data.enrichment?.regimeContext?.trim();
  const tickerContext = data.aiAnalysis.tickerDirections[0]?.context?.trim();

  if (normalizedDirection === 'bullish') {
    return 'Direction: Bullish';
  }

  if (normalizedDirection === 'bearish') {
    return 'Direction: Bearish';
  }

  if ((normalizedDirection === 'neutral' || normalizedDirection === 'mixed') && regimeContext) {
    return `Direction: ${regimeContext}`;
  }

  if ((normalizedDirection === 'neutral' || normalizedDirection === 'mixed') && tickerContext) {
    return `Direction: ${tickerContext}`;
  }

  return 'Direction: Awaiting market reaction';
}

function getSignalReason(data: NonNullable<ReturnType<typeof useEventDetail>['data']>): string | null {
  return data.enrichment?.currentSetup
    ?? data.enrichment?.whyNow
    ?? data.enrichment?.historicalContext
    ?? data.enrichment?.regimeContext
    ?? data.enrichment?.impact
    ?? null;
}

function buildFilterPath(data: NonNullable<ReturnType<typeof useEventDetail>['data']>): string {
  const steps: string[] = [];
  const audit = data.audit;

  steps.push('Passed L1 rule filter');

  if (audit?.confidence != null) {
    steps.push(`L2 LLM judge (confidence ${audit.confidence.toFixed(2)})`);
  }

  if (audit?.historicalMatch || data.historicalPattern.matchCount > 0) {
    steps.push('Enriched with market context');
  }

  if (audit?.outcome === 'delivered') {
    steps.push('Delivered');
  }

  return steps.join(' → ');
}

function buildHistoricalRationale(data: NonNullable<ReturnType<typeof useEventDetail>['data']>): string | null {
  const pattern = data.historicalPattern;
  if (pattern.matchCount === 0) return null;

  const eventType = data.scorecard?.originalAlert.thesis?.historicalContext
    ?? `${pattern.matchCount} similar events`;

  return `Matched ${eventType} with ${pattern.confidence} confidence`;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-bg-elevated/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-medium leading-6 text-text-primary">{value}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">{title}</h2>
    </div>
  );
}

export function EventDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data, isLoading } = useEventDetail(id);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const shouldFallbackToWatchlist = location.key === 'default';

  const similarEvents = data?.historicalPattern?.similarEvents ?? [];
  const visibleSimilarEvents = useMemo(() => {
    return showAllSimilar ? similarEvents : similarEvents.slice(0, 3);
  }, [similarEvents, showAllSimilar]);

  function handleBack(): void {
    if (shouldFallbackToWatchlist) {
      navigate('/watchlist');
      return;
    }

    navigate(-1);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl border border-border-default bg-bg-primary/92 px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {shouldFallbackToWatchlist ? 'Back to watchlist' : 'Back'}
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

  const enrichment = data.enrichment;
  const historical = data.historical;
  const hasHistoricalPattern = historical != null || data.historicalPattern.matchCount > 0;
  const signalLabel = formatSignalLabel(enrichment?.action);
  const signalReason = getSignalReason(data);
  const directionSummary = formatDirectionSummary(data);
  const priceBarTicker = data.tickers[0];

  return (
    <div className="space-y-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl border border-border-default bg-bg-primary/92 px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <ArrowLeft className="h-4 w-4" />
          {shouldFallbackToWatchlist ? 'Back to watchlist' : 'Back'}
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
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-bg-elevated/70 px-3 py-2 text-text-secondary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          aria-label="Share alert"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Header: severity + title + meta */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-start gap-3">
          <SeverityBadge
            severity={data.severity}
            className="min-h-7 px-2.5 py-1 text-[10px] tracking-[0.14em]"
          />
          {signalLabel && (
            <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-text-primary">
              <p className="font-medium">{signalLabel}</p>
              {signalReason && (
                <p className="mt-1 max-w-xl text-[11px] leading-5 text-text-secondary">{signalReason}</p>
              )}
            </div>
          )}
        </div>
        <h1 className="mt-4 text-[20px] font-semibold leading-7 text-text-primary">{data.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>{data.source}</span>
          <span>·</span>
          {data.tickers.map((ticker) => (
            <TickerChip key={ticker} symbol={ticker} className="px-2.5 py-1.5 text-xs" />
          ))}
          <span className="font-mono">{formatRelativeTime(data.time)}</span>
        </div>
        {data.confirmationCount > 1 && (
          <div className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-200">
            <CircleCheckBig className="h-4 w-4" />
            {`Confirmed by ${data.confirmationCount} sources`}
          </div>
        )}
        {data.marketData && priceBarTicker && (
          <div
            className={cn(
              'mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-sm',
              data.marketData.change1d >= 0
                ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-200'
                : 'border-red-400/20 bg-red-400/8 text-red-200',
            )}
          >
            <span className="font-mono font-semibold">${priceBarTicker}</span>
            <span className="text-base font-semibold">{formatPrice(data.marketData.price)}</span>
            <span>{formatPercent(data.marketData.change1d, 1)} today</span>
            <span>RSI {Math.round(data.marketData.rsi14)}</span>
          </div>
        )}
      </section>

      {(signalLabel || signalReason) && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="AI signal" title="Signal Context" />
          <div className="space-y-2">
            {signalLabel && (
              <p className="text-[15px] font-semibold leading-6 text-text-primary">{signalLabel}</p>
            )}
            <p className="text-[15px] leading-7 text-text-secondary">{directionSummary}</p>
            {signalReason && (
              <p className="text-[15px] leading-7 text-text-secondary">{signalReason}</p>
            )}
          </div>
        </section>
      )}

      {/* AI Summary — always visible, use enrichment first */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <SectionHeading eyebrow="Catalyst / event summary" title="What happened" />
        <p className="text-[15px] leading-7 text-text-secondary">{data.aiAnalysis.summary}</p>
      </section>

      {/* Impact — from enrichment */}
      {(enrichment?.impact ?? data.aiAnalysis.impact) && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Why it matters" title="Impact" />
          <p className="text-[15px] leading-7 text-text-secondary">
            {enrichment?.impact ?? data.aiAnalysis.impact}
          </p>
        </section>
      )}

      {/* Why Now — from enrichment */}
      {enrichment?.whyNow && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Market timing" title="Why this matters now" />
          <p className="text-[15px] leading-7 text-text-secondary">{enrichment.whyNow}</p>
        </section>
      )}

      {/* Risks — from enrichment */}
      {enrichment?.risks && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Risk factors" title="Risks" />
          <p className="text-[15px] leading-7 text-text-secondary">{enrichment.risks}</p>
        </section>
      )}

      {/* Key fields: Source / Severity / Tickers / Signal — Discord-style grid */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="grid grid-cols-2 gap-3">
          <InfoField label="Source" value={data.source} />
          <InfoField label="Severity" value={formatSeverityLabel(data.severity)} />
          {data.tickers.length > 0 && (
            <InfoField
              label="Tickers"
              value={
                enrichment?.tickers.length
                  ? enrichment.tickers
                      .map((t) => `${t.symbol} ${t.direction === 'bullish' ? '📈' : t.direction === 'bearish' ? '📉' : ''}`.trim())
                      .join(', ')
                  : data.tickers.join(', ')
              }
            />
          )}
          {enrichment?.action && (
            <InfoField label="Signal" value={formatSignalLabel(enrichment.action) ?? enrichment.action} />
          )}
        </div>
      </section>

      {/* Filing Items — SEC-specific */}
      {enrichment?.filingItems && enrichment.filingItems.length > 0 && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="SEC filing" title="Filing Items" />
          <p className="text-[15px] font-mono leading-7 text-text-primary">
            {enrichment.filingItems.join(', ')}
          </p>
        </section>
      )}

      {/* Regime Context */}
      {enrichment?.regimeContext && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Market regime" title="Regime Context" />
          <p className="text-[15px] leading-7 text-text-secondary">{enrichment.regimeContext}</p>
        </section>
      )}

      {/* Market Context — ticker directions */}
      {data.aiAnalysis.tickerDirections.length > 0 && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Directional context" title="Market Context" />
          <div className="space-y-3">
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

      {/* Historical Pattern — full data from metadata.historical_context */}
      {hasHistoricalPattern && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                Pattern match
              </p>
              <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">
                📊 Historical Pattern
              </h2>
              {historical?.patternLabel && (
                <p className="mt-1 text-sm leading-6 text-text-secondary">{historical.patternLabel}</p>
              )}
            </div>
            {data.historicalPattern.confidence && (
              <div className="rounded-full bg-white/6 px-3 py-1 text-sm font-medium text-text-primary">
                {data.historicalPattern.confidence}
              </div>
            )}
          </div>

          <p className="text-sm leading-6 text-text-secondary">
            {`📊 ${data.historicalPattern.matchCount} similar events | Avg move T+20: ${formatSignedPercent(data.historicalPattern.avgMoveT20)} | Win rate: ${data.historicalPattern.winRate ?? 'N/A'}%`}
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {data.historicalPattern.avgMoveT5 != null && (
              <StatCard value={formatSignedPercent(data.historicalPattern.avgMoveT5)} label="Avg Alpha T+5" />
            )}
            {data.historicalPattern.avgMoveT20 != null && (
              <StatCard value={formatSignedPercent(data.historicalPattern.avgMoveT20)} label="Avg Alpha T+20" />
            )}
            {data.historicalPattern.winRate != null && (
              <StatCard value={`${data.historicalPattern.winRate}%`} label="Win Rate" />
            )}
            <StatCard value={String(data.historicalPattern.matchCount)} label="Similar events" />
          </div>

          {similarEvents.length > 0 && (
            <div className="mt-4">
              <SectionHeading eyebrow="Historical precedents" title="Similar Playbook" />
              <div className="space-y-3">
                {visibleSimilarEvents.map((event, i) => (
                  <div key={i} className="flex items-center justify-between rounded-2xl border border-white/6 bg-bg-elevated/70 p-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{event.title}</p>
                      <p className="mt-1 font-mono text-xs text-text-secondary">
                        {event.date ? formatRelativeTime(event.date) : ''}
                      </p>
                    </div>
                    {event.move && (
                      <p className="text-sm font-semibold text-text-primary">{event.move}</p>
                    )}
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
            </div>
          )}

          {/* Best / Worst cases */}
          {(historical?.bestCase || historical?.worstCase) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {historical.bestCase && (
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    🏆 Best
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-300">
                    {historical.bestCase.ticker} {formatSignedPercent(historical.bestCase.move)}
                  </p>
                </div>
              )}
              {historical.worstCase && (
                <div className="rounded-2xl border border-red-400/15 bg-red-400/5 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    💀 Worst
                  </p>
                  <p className="mt-2 text-sm font-semibold text-severity-critical">
                    {historical.worstCase.ticker} {formatSignedPercent(historical.worstCase.move)}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Trust / Verification — always visible */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Trust / scorecard context
            </p>
            <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">Verification</h2>
          </div>
          {data.scorecard?.notes.verdictWindow && (
            <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-text-primary">
              {data.scorecard.notes.verdictWindow} window
            </div>
          )}
        </div>

        {data.scorecard ? (
          <>
            {data.scorecard.notes.summary && (
              <p className="mb-4 text-sm leading-6 text-text-secondary">{data.scorecard.notes.summary}</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoField
                label="Original signal label"
                value={data.scorecard.originalAlert.actionLabel ?? 'Not captured'}
              />
              <InfoField
                label="Direction verdict"
                value={formatTrustLabel(data.scorecard.outcome.directionVerdict)}
              />
              <InfoField
                label="Setup verdict"
                value={formatTrustLabel(data.scorecard.outcome.setupVerdict)}
              />
              <InfoField
                label="Primary verdict window"
                value={data.scorecard.notes.verdictWindow ?? 'Pending'}
              />
              <InfoField
                label="T+5 move"
                value={formatTrustMove(data.scorecard.outcome.tPlus5.movePercent)}
              />
              <InfoField
                label="T+20 move"
                value={formatTrustMove(data.scorecard.outcome.tPlus20.movePercent)}
              />
            </div>

            {data.scorecard.notes.items.length > 0 && (
              <div className="mt-4 rounded-2xl border border-white/6 bg-bg-elevated/50 p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                  Verification notes
                </h3>
                <div className="mt-3 space-y-2">
                  {data.scorecard.notes.items.map((item) => (
                    <p key={item} className="text-sm leading-6 text-text-secondary">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : hasHistoricalPattern ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoField
              label="Historical matches"
              value={String(data.historicalPattern.matchCount)}
            />
            <InfoField
              label="Pattern confidence"
              value={formatTrustLabel(data.historicalPattern.confidence)}
            />
          </div>
        ) : (
          <p className="text-sm leading-6 text-text-secondary">
            Verification data is not available yet.
          </p>
        )}
      </section>

      {/* Feedback — placed after main content, before metadata */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <h2 className="text-base font-semibold text-text-primary">Was this useful?</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Your feedback improves future alerts.
        </p>
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

      {/* Source link */}
      {data.url && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
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

      {/* Provenance — collapsible metadata */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-4">
        <button
          type="button"
          aria-expanded={provenanceOpen}
          aria-controls="provenance-panel"
          onClick={() => setProvenanceOpen((c) => !c)}
          className="flex w-full items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Alert provenance
            </p>
            <span className="mt-1 block text-[17px] font-semibold leading-6 text-text-primary">
              Why this alert
            </span>
            <span className="mt-1 block text-sm leading-6 text-text-secondary">
              Source, filter path, and pipeline context.
            </span>
          </div>
          <ShieldCheck className="hidden h-5 w-5 text-accent-default sm:block" />
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-bg-elevated/70 text-text-secondary">
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', provenanceOpen ? 'rotate-180' : '')}
              aria-hidden="true"
            />
          </span>
        </button>

        {provenanceOpen && (
          <div id="provenance-panel" className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoField
                label="Source"
                value={`${data.source} · ${formatRelativeTime(data.time)}`}
              />
              <InfoField
                label="Filter path"
                value={buildFilterPath(data)}
              />
              {buildHistoricalRationale(data) && (
                <InfoField
                  label="Historical match"
                  value={buildHistoricalRationale(data)!}
                />
              )}
              {data.audit?.confidence != null && (
                <InfoField
                  label="Classification confidence"
                  value={`${(data.audit.confidence * 100).toFixed(0)}%`}
                />
              )}
              <InfoField
                label="Severity"
                value={formatSeverityLabel(data.severity)}
              />
              <InfoField
                label="Alert label"
                value={data.scorecard?.originalAlert.actionLabel ?? 'Initial signal label not captured'}
              />
              <InfoField
                label="Confidence bucket"
                value={formatTrustLabel(data.scorecard?.originalAlert.confidenceBucket, 'Not available yet')}
              />
              <InfoField
                label="Arrival time"
                value={`${formatRelativeTime(data.time)} from the latest update`}
              />
            </div>

            {data.confirmationCount > 1 && (
              <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                <p className="text-sm font-medium text-emerald-200">
                  Also reported by: {data.confirmedSources.filter((s) => s !== data.source).join(', ')}
                  {data.provenance.length > 1 && (
                    <span className="text-text-secondary">
                      {' '}({formatProvenanceOffset(data.provenance[0]?.receivedAt ?? data.time, data.provenance[data.provenance.length - 1]?.receivedAt ?? data.time)})
                    </span>
                  )}
                </p>
              </div>
            )}

            {data.provenance.length > 1 && (
              <div className="mt-4 space-y-3">
                {data.provenance.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/6 bg-bg-elevated/60 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{item.source}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-text-secondary">
                        {formatProvenanceOffset(data.provenance[0]?.receivedAt ?? data.time, item.receivedAt)}
                      </span>
                      <span className="ml-auto text-xs font-mono text-text-secondary">
                        {formatRelativeTime(item.receivedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-text-primary">{item.title}</p>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-accent-default transition hover:text-accent-strong"
                      >
                        View original source
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.audit?.reason && (
              <div className="mt-3 rounded-2xl border border-white/6 bg-bg-elevated/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                  Pipeline note
                </p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{data.audit.reason}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Legal disclaimer — collapsed by default */}
      <Disclaimer />
    </div>
  );
}

function Disclaimer() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-border-default bg-bg-muted/88 p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="disclaimer-panel"
        onClick={() => setOpen((c) => !c)}
        className="flex w-full items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Informational only
          </p>
          <span className="mt-1 block text-[17px] font-semibold leading-6 text-text-primary">
            Disclaimer
          </span>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-bg-elevated/70 text-text-secondary">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div id="disclaimer-panel" className="mt-4">
          <p className="text-xs leading-5 text-text-secondary">
            Event Radar provides AI-processed market event notifications for informational purposes only.
            Content may be generated or summarized by AI and could contain errors or inaccuracies. This is
            not investment advice or financial advice, and should not be relied upon as the sole basis for
            any investment decision. Always verify information with official sources and consult a qualified
            financial advisor before making investment decisions. Past performance and historical patterns are
            not indicative of future results.
          </p>
        </div>
      )}
    </section>
  );
}
