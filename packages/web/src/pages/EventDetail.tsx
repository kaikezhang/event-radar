import { ArrowLeft, ExternalLink, Share2, ThumbsDown, ThumbsUp, CircleCheckBig, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CollapsiblePanel } from '../components/CollapsiblePanel.js';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { StatCard } from '../components/StatCard.js';
import { TickerChip } from '../components/TickerChip.js';
import { EmptyState } from '../components/EmptyState.js';
import { formatPercent, formatRelativeTime } from '../lib/format.js';
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

function buildWhyNow(data: NonNullable<ReturnType<typeof useEventDetail>['data']>) {
  const thesis = data.scorecard?.originalAlert.thesis;

  return thesis?.whyNow
    ?? thesis?.impact
    ?? data.aiAnalysis.impact
    ?? `${data.source} pushed this alert ${formatRelativeTime(data.time)}, so the catalyst is still fresh for ${data.tickers.join(', ') || 'this name'}.`;
}

function buildTrustSummary(data: NonNullable<ReturnType<typeof useEventDetail>['data']>) {
  if (data.scorecard?.notes.summary) {
    return data.scorecard.notes.summary;
  }

  if (data.historicalPattern.matchCount > 0) {
    return `${data.historicalPattern.matchCount} similar events were found with ${data.historicalPattern.confidence} pattern confidence.`;
  }

  return 'This alert is currently relying on live source context rather than a closed scorecard outcome.';
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

export function EventDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data, isLoading } = useEventDetail(id);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const shouldFallbackToWatchlist = location.key === 'default';

  const similarEvents = data?.historicalPattern?.similarEvents ?? [];
  const whyNow = data ? buildWhyNow(data) : '';
  const trustSummary = data ? buildTrustSummary(data) : '';
  const notificationReasons = data ? [
    { label: 'Severity', value: formatSeverityLabel(data.severity) },
    { label: 'Source', value: data.source },
    { label: 'Tickers', value: data.tickers.join(', ') || 'No ticker tagged' },
    {
      label: 'Alert label',
      value: data.scorecard?.originalAlert.actionLabel ?? 'Initial signal label not captured',
    },
    {
      label: 'Confidence bucket',
      value: formatTrustLabel(data.scorecard?.originalAlert.confidenceBucket, 'Not available yet'),
    },
    {
      label: 'Arrival time',
      value: `${formatRelativeTime(data.time)} from the latest update`,
    },
  ] : [];
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

      {/* Header card */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <SeverityBadge
          severity={data.severity}
          className="min-h-7 px-2.5 py-1 text-[10px] tracking-[0.14em]"
        />
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
      </section>

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Landing guide
            </p>
            <h2 className="mt-2 text-[17px] font-semibold leading-[1.4] text-text-primary">
              Read this in under 30 seconds
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-text-secondary">
            Start with the catalyst, then the time-sensitive angle, then why the push fired, and finally the trust check.
          </p>
        </div>

        <nav
          aria-label="Event detail quick links"
          className="mt-4 flex flex-wrap gap-2"
        >
          <a
            href="#what-happened"
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-bg-elevated/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            What happened
          </a>
          <a
            href="#why-now"
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-bg-elevated/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Why this matters now
          </a>
          <a
            href="#why-notified"
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-bg-elevated/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Why you were notified
          </a>
          <a
            href="#trust-check"
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-bg-elevated/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Trust check
          </a>
          <a
            href="#why-this-alert"
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-bg-elevated/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Why this alert
          </a>
        </nav>
      </section>

      <CollapsiblePanel
        id="what-happened"
        title="What happened"
        eyebrow="Catalyst / event summary"
        description="Start with the source-backed summary before scanning the market context."
        defaultOpen
        className="scroll-mt-24"
      >
        <p className="text-[15px] leading-7 text-text-secondary">{data.aiAnalysis.summary}</p>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="why-now"
        title="Why now"
        eyebrow="Market timing"
        description="Why this matters now"
        defaultOpen
        className="scroll-mt-24"
      >
        <p className="text-[15px] leading-7 text-text-secondary">{whyNow}</p>
      </CollapsiblePanel>

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <h2 className="text-base font-semibold text-text-primary">Was this useful?</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Rate the explanation before you move to routing and trust details.
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

      <CollapsiblePanel
        id="why-notified"
        title="Why notified"
        eyebrow="Alert routing context"
        description="The metadata behind the push, so you can decide whether to keep reading or move immediately."
        defaultOpen
        className="scroll-mt-24"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notificationReasons.map((item) => (
            <InfoField key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </CollapsiblePanel>

      <section className="scroll-mt-24 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Multi-source provenance
            </p>
            <h2 className="mt-2 text-[17px] font-semibold leading-[1.4] text-text-primary">
              Provenance
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-text-secondary">
            Follow who reported the event first and which sources echoed it after the initial alert.
          </p>
        </div>

        {data.confirmationCount > 1 ? (
          <>
            <div className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-200">
              <CircleCheckBig className="h-4 w-4" />
              {`Confirmed by ${data.confirmationCount} sources`}
            </div>
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
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {item.id === data.provenance[0]?.id
                      ? `First report: ${item.source}`
                      : `Also reported by: ${item.source} (${formatProvenanceOffset(data.provenance[0]?.receivedAt ?? data.time, item.receivedAt)})`}
                  </p>
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
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-text-secondary">
            No follow-on confirmation sources have been recorded for this alert yet.
          </p>
        )}
      </section>

      <CollapsiblePanel
        id="trust-check"
        title="Trust"
        eyebrow="Trust / scorecard context"
        description={trustSummary}
        defaultOpen
        className="scroll-mt-24"
        headerSlot={
          data.scorecard?.notes.verdictWindow ? (
            <div className="inline-flex w-fit min-h-9 items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-text-primary">
              {data.scorecard.notes.verdictWindow} window
            </div>
          ) : null
        }
      >
        <div className="rounded-2xl border border-white/6 bg-bg-elevated/50 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            How to read this scorecard
          </h3>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Direction verdict shows whether price followed the alert call. Setup verdict reflects whether the trade setup actually worked.
          </p>
        </div>

        {data.scorecard ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            {data.scorecard.notes.items.length > 0 ? (
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
            ) : null}
          </>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoField
              label="Historical matches"
              value={String(data.historicalPattern.matchCount)}
            />
            <InfoField
              label="Pattern confidence"
              value={formatTrustLabel(data.historicalPattern.confidence)}
            />
          </div>
        )}
      </CollapsiblePanel>

      {/* Why This Alert — provenance + audit trail */}
      <CollapsiblePanel
        id="why-this-alert"
        title="Why this alert"
        eyebrow="Alert provenance"
        description="Source, filter path, and pipeline context for why this alert made it to you."
        defaultOpen
        className="scroll-mt-24"
        headerSlot={<ShieldCheck className="h-5 w-5 text-accent-default" />}
      >
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

        {data.audit?.reason && (
          <div className="mt-3 rounded-2xl border border-white/6 bg-bg-elevated/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Pipeline note
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{data.audit.reason}</p>
          </div>
        )}
      </CollapsiblePanel>

      {/* Market Context */}
      {data.aiAnalysis.tickerDirections.length > 0 && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
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
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
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
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
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

      {/* Legal disclaimer */}
      <CollapsiblePanel
        id="disclaimer"
        title="Disclaimer"
        eyebrow="Informational only"
        description="Short legal context. Expanded only when you need it."
        className="bg-bg-muted/88 p-3 shadow-none"
      >
        <p className="text-xs leading-5 text-text-secondary">
          Event Radar provides AI-processed market event notifications for informational purposes only.
          Content may be generated or summarized by AI and could contain errors or inaccuracies. This is
          not investment advice or financial advice, and should not be relied upon as the sole basis for
          any investment decision. Always verify information with official sources and consult a qualified
          financial advisor before making investment decisions. Past performance and historical patterns are
          not indicative of future results.
        </p>
      </CollapsiblePanel>
    </div>
  );
}
