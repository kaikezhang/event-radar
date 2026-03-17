import { ArrowLeft, ExternalLink, Share2, ThumbsDown, ThumbsUp, Ban, CircleCheckBig, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DirectionBadge } from '../components/DirectionBadge.js';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { TickerChip } from '../components/TickerChip.js';
import { EmptyState } from '../components/EmptyState.js';
import { formatPercent, formatRelativeTime } from '../lib/format.js';
import { mapSource, submitFeedback } from '../lib/api.js';
import { useEventDetail } from '../hooks/useEventDetail.js';
import { cn } from '../lib/utils.js';
import { EventChart } from '../components/EventChart.js';
import { RangeBar } from '../components/RangeBar.js';
import { StatMini } from '../components/StatMini.js';
import type { LlmEnrichment } from '../types/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTrustLabel(value: string | null | undefined, fallback = 'Not available') {
  if (!value) return fallback;
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTrustMove(value: number | null) {
  return value == null ? 'Pending' : formatPercent(value, 2);
}


function formatSignedPercent(value: number | null): string {
  if (value == null) return 'N/A';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function getPrimaryDirection(data: NonNullable<ReturnType<typeof useEventDetail>['data']>): string {
  const enrichDir = data.enrichment?.tickers[0]?.direction;
  if (enrichDir) return enrichDir;
  const aiDir = data.aiAnalysis.tickerDirections[0]?.direction;
  if (aiDir) return aiDir;
  return 'neutral';
}

function getPrimaryConfidence(data: NonNullable<ReturnType<typeof useEventDetail>['data']>): number | null {
  return data.audit?.confidence ?? data.scorecard?.originalAlert.confidence ?? null;
}

function deriveBullBear(enrichment: LlmEnrichment | null, direction: string): { bullPoints: string[]; bearPoints: string[] } {
  if (!enrichment) return { bullPoints: [], bearPoints: [] };

  const isBearish = direction === 'bearish';
  const bullPoints: string[] = [];
  const bearPoints: string[] = [];

  if (enrichment.impact) {
    (isBearish ? bearPoints : bullPoints).push(enrichment.impact);
  }
  if (enrichment.currentSetup) {
    (isBearish ? bearPoints : bullPoints).push(enrichment.currentSetup);
  }
  if (enrichment.risks) {
    bearPoints.push(enrichment.risks);
  }
  if (enrichment.historicalContext) {
    (isBearish ? bullPoints : bearPoints).push(enrichment.historicalContext);
  }

  return { bullPoints, bearPoints };
}

function getConfidenceLevel(matchCount: number): { label: string; level: 'insufficient' | 'moderate' | 'high'; fill: number } {
  if (matchCount < 10) return { label: 'Insufficient', level: 'insufficient', fill: 15 };
  if (matchCount < 30) return { label: 'Moderate', level: 'moderate', fill: 50 };
  return { label: 'High', level: 'high', fill: 85 };
}

// ── Sub-components ──────────────────────────────────────────────────────────

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

function AnchorNav({ activeSection }: { activeSection: string; onNavigate: (id: string) => void }) {
  const sections = [
    { id: 'verdict', label: 'Summary' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'trust', label: 'Trust' },
  ];

  function handleClick(id: string) {
    const el = document.getElementById(`zone-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className="sticky top-[60px] z-10 flex gap-1 overflow-x-auto rounded-2xl border border-border-default bg-bg-primary/92 px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.18)] backdrop-blur-md" aria-label="Page sections">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => handleClick(s.id)}
          className={cn(
            'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
            activeSection === s.id
              ? 'border-b-2 border-accent-default bg-white/6 text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function BullBearColumns({ bullPoints, bearPoints }: { bullPoints: string[]; bearPoints: string[] }) {
  if (bullPoints.length === 0 && bearPoints.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Directional thesis" title="Bull Case vs Bear Case" />
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Bull column */}
        <div className="flex-1 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-emerald-400">▲ Bull</h3>
          {bullPoints.length > 0 ? (
            <ul className="space-y-2">
              {bullPoints.map((point, i) => (
                <li key={i} className="text-sm leading-6 text-text-secondary">
                  • {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-text-secondary/60">No upside thesis identified</p>
          )}
        </div>
        {/* Bear column */}
        <div className="flex-1 rounded-xl border border-red-500/15 bg-red-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-red-400">▼ Bear</h3>
          {bearPoints.length > 0 ? (
            <ul className="space-y-2">
              {bearPoints.map((point, i) => (
                <li key={i} className="text-sm leading-6 text-text-secondary">
                  • {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-text-secondary/60">No downside thesis identified</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ConfidenceBar({ matchCount }: { matchCount: number }) {
  const { label, level, fill } = getConfidenceLevel(matchCount);
  const barColor =
    level === 'high' ? 'bg-emerald-500' :
    level === 'moderate' ? 'bg-yellow-500' :
    'bg-zinc-500';

  return (
    <div className="mt-4 flex items-center gap-3">
      <span className="text-xs font-medium text-text-secondary">Confidence:</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${fill}%` }} />
      </div>
      <span className={cn(
        'text-xs font-medium',
        level === 'high' ? 'text-emerald-400' :
        level === 'moderate' ? 'text-yellow-400' :
        'text-zinc-400',
      )}>
        {label} (n={matchCount})
      </span>
    </div>
  );
}

function ProvenanceTimeline({ data }: { data: NonNullable<ReturnType<typeof useEventDetail>['data']> }) {
  const steps: Array<{ icon: string; name: string; time: string; detail: string }> = [];

  // Step 1: Source
  const firstProv = data.provenance[0];
  if (firstProv) {
    steps.push({
      icon: '📡',
      name: data.source,
      time: formatTimeShort(firstProv.receivedAt),
      detail: '',
    });
  }

  // Step 2: Rule Filter
  steps.push({
    icon: '🔍',
    name: 'Rule Filter',
    time: firstProv ? formatTimeShort(firstProv.receivedAt) : '',
    detail: 'Passed L1 filter',
  });

  // Step 3: AI Judge
  if (data.audit?.confidence != null) {
    steps.push({
      icon: '🤖',
      name: 'AI Judge',
      time: firstProv ? formatTimeShort(firstProv.receivedAt) : '',
      detail: `Confidence: ${data.audit.confidence.toFixed(2)}`,
    });
  }

  // Step 4: Enrichment
  if (data.enrichment) {
    const enrichTime = data.audit?.enrichedAt ? formatTimeShort(data.audit.enrichedAt) : '';
    const matchInfo = data.historicalPattern.matchCount > 0
      ? `+ ${data.historicalPattern.matchCount} historical matches`
      : '+ market context';
    steps.push({
      icon: '📊',
      name: 'Enriched',
      time: enrichTime,
      detail: matchInfo,
    });
  }

  // Step 5: Delivery
  if (data.audit?.outcome === 'delivered') {
    const channels = Array.isArray(data.audit.deliveryChannels)
      ? (data.audit.deliveryChannels as Array<{ channel?: string }>).map((c) => c.channel).filter(Boolean).join(', ')
      : '';
    const firstTime = firstProv ? new Date(firstProv.receivedAt).getTime() : 0;
    const enrichTime = data.audit.enrichedAt ? new Date(data.audit.enrichedAt).getTime() : firstTime;
    const totalSec = firstTime > 0 ? Math.round((enrichTime - firstTime) / 1000) : 0;

    steps.push({
      icon: '📱',
      name: 'Delivered',
      time: data.audit.enrichedAt ? formatTimeShort(data.audit.enrichedAt) : '',
      detail: [
        channels ? `via ${channels}` : '',
        totalSec > 0 ? `Total: ${totalSec}s` : '',
      ].filter(Boolean).join(' · '),
    });
  }

  if (steps.length === 0) return null;

  return (
    <div className="relative ml-4 border-l-2 border-white/10 pl-6">
      {steps.map((step, i) => (
        <div key={i} className="relative mb-5 last:mb-0">
          {/* Dot on the timeline */}
          <div className="absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg-surface text-xs">
            {step.icon}
          </div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-text-primary">{step.name}</p>
              {step.detail && (
                <p className="mt-0.5 text-xs text-text-secondary">{step.detail}</p>
              )}
            </div>
            {step.time && (
              <span className="shrink-0 font-mono text-xs text-text-secondary">{step.time}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StockContextPanel({ data }: { data: NonNullable<ReturnType<typeof useEventDetail>['data']> }) {
  const md = data.marketData;
  if (!md) return null;

  const primaryTicker = data.tickers[0];

  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Stock context" title={primaryTicker ?? 'Market Data'} />

      {/* Candlestick chart with event marker */}
      {primaryTicker && (
        <div className="mb-4 -mx-1">
          <EventChart
            symbol={primaryTicker}
            defaultRange="3m"
            height={200}
            events={[{
              id: data.id,
              severity: data.severity,
              title: data.title,
              time: data.time,
              tickers: data.tickers,
              source: data.source,
              summary: '',
            }]}
            compact
          />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatMini label="Price" value={`$${md.price.toFixed(2)}`} />
        <StatMini
          label="Today"
          value={`${md.change1d > 0 ? '+' : ''}${md.change1d.toFixed(1)}%`}
          tone={md.change1d >= 0 ? 'positive' : 'negative'}
        />
        <StatMini
          label="5-Day"
          value={`${md.change5d > 0 ? '+' : ''}${md.change5d.toFixed(1)}%`}
          tone={md.change5d >= 0 ? 'positive' : 'negative'}
        />
        <StatMini label="RSI" value={`RSI ${md.rsi14}`} />
        <StatMini label="Volume" value={md.volumeRatio ? `${md.volumeRatio.toFixed(1)}x avg` : 'N/A'} />
        <StatMini label="52W Range" value={md.high52w && md.low52w
          ? `$${md.low52w.toFixed(0)} - $${md.high52w.toFixed(0)}`
          : 'N/A'} />
      </div>

      {/* 52-Week Range Bar */}
      {md.high52w && md.low52w && md.price && (
        <RangeBar low={md.low52w} high={md.high52w} current={md.price} />
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function EventDetail({ eventId, onBack }: { eventId?: string; onBack?: () => void } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const id = eventId ?? paramId;
  const isInline = Boolean(eventId);
  const { data, isLoading } = useEventDetail(id);
  const [feedback, setFeedback] = useState<'up' | 'down' | 'bad' | null>(null);
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const [activeSection, setActiveSection] = useState('verdict');
  const shouldFallbackToWatchlist = location.key === 'default';

  const verdictRef = useRef<HTMLDivElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLDivElement>(null);

  // Intersection observer for anchor nav
  useEffect(() => {
    const refs = [
      { id: 'verdict', ref: verdictRef },
      { id: 'evidence', ref: evidenceRef },
      { id: 'trust', ref: trustRef },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const match = refs.find((r) => r.ref.current === entry.target);
            if (match) setActiveSection(match.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );

    for (const { ref } of refs) {
      if (ref.current) observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [data]);

  const similarEvents = data?.historicalPattern?.similarEvents ?? [];
  const visibleSimilarEvents = useMemo(() => {
    return showAllSimilar ? similarEvents : similarEvents.slice(0, 3);
  }, [similarEvents, showAllSimilar]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (shouldFallbackToWatchlist) {
      navigate('/watchlist');
      return;
    }
    navigate(-1);
  }, [onBack, shouldFallbackToWatchlist, navigate]);

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
            {isInline ? '← Back to list' : shouldFallbackToWatchlist ? 'Back to watchlist' : 'Back'}
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
  const direction = getPrimaryDirection(data);
  const confidence = getPrimaryConfidence(data);
  const { bullPoints, bearPoints } = deriveBullBear(enrichment, direction);

  // "Why It Matters Now" bullet points: combine impact, whyNow, currentSetup
  const whyNowBullets = [
    enrichment?.impact,
    enrichment?.whyNow,
    enrichment?.currentSetup,
  ].filter((v): v is string => Boolean(v));

  // Direction context for neutral/mixed
  const directionContextLine = (() => {
    if (direction === 'neutral' && enrichment?.regimeContext) {
      return `Direction: ${enrichment.regimeContext}`;
    }
    if (direction === 'mixed' || direction === 'unclear') {
      return 'Direction: Awaiting market reaction';
    }
    return null;
  })();

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
          {isInline ? '← Back to list' : shouldFallbackToWatchlist ? 'Back to watchlist' : 'Back'}
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

      {/* Anchor navigation */}
      <AnchorNav activeSection={activeSection} onNavigate={(id) => setActiveSection(id)} />

      {/* ═══════════════════════ DESKTOP 2-COLUMN LAYOUT ═══════════════════════ */}
      <div className="lg:flex lg:gap-6">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-4 lg:flex-[2]">

          {/* ═══════════════════ ZONE 1: THE VERDICT ═══════════════════ */}
          <div id="zone-verdict" ref={verdictRef} className="scroll-mt-28">
            {/* 1. Header: severity + source + time */}
            <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <div className="flex items-center gap-3">
                <SeverityBadge
                  severity={data.severity}
                  className="min-h-7 px-2.5 py-1 text-[10px] tracking-[0.14em]"
                />
                <span className="text-sm text-text-secondary">{data.source}</span>
                <span className="font-mono text-sm text-text-secondary">{formatRelativeTime(data.time)}</span>
              </div>

              {/* 2. Headline: tickers + title */}
              <h1 className="mt-4 text-[20px] font-semibold leading-7 text-text-primary">{data.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {data.tickers.map((ticker) => (
                  <TickerChip key={ticker} symbol={ticker} className="px-2.5 py-1.5 text-xs" />
                ))}
              </div>

              {/* 3. Direction badge */}
              <div className="mt-4 flex items-center gap-3">
                <DirectionBadge
                  direction={direction}
                  confidence={confidence}
                  confidenceBucket={data.scorecard?.originalAlert.confidenceBucket}
                  size="md"
                />
                {enrichment?.action && (
                  <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium text-text-primary">
                    {enrichment.action}
                  </span>
                )}
              </div>

              {/* Direction context for neutral/mixed */}
              {directionContextLine && (
                <p className="mt-3 text-sm text-text-secondary">{directionContextLine}</p>
              )}

              {/* Confirmation badge */}
              {data.confirmationCount > 1 && (
                <div className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-200">
                  <CircleCheckBig className="h-4 w-4" />
                  {`Confirmed by ${data.confirmationCount} sources`}
                </div>
              )}
            </section>

            {/* 4. "What Happened" — factual summary */}
            <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
              <SectionHeading eyebrow="Catalyst / event summary" title="What Happened" />
              <p className="text-[15px] leading-relaxed text-text-primary">{data.aiAnalysis.summary}</p>
            </section>

            {/* 5. "Why It Matters Now" — bullet points */}
            {whyNowBullets.length > 0 && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
                <SectionHeading eyebrow="Market context" title="Why It Matters Now" />
                <ul className="space-y-2">
                  {whyNowBullets.map((bullet, i) => (
                    <li key={i} className="text-[15px] leading-7 text-text-secondary">
                      • {bullet}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 6. Bull Case vs Bear Case */}
            <div className="mt-4">
              <BullBearColumns bullPoints={bullPoints} bearPoints={bearPoints} />
            </div>

            {/* 7. Key Risks */}
            {enrichment?.risks && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
                <SectionHeading eyebrow="Risk factors" title="Key Risks" />
                <div className="rounded-lg border-l-2 border-amber-500/30 bg-amber-500/5 py-3 pl-4 pr-3">
                  <p className="text-[15px] leading-7 text-text-secondary">
                    ⚠ {enrichment.risks}
                  </p>
                </div>
              </section>
            )}

            {/* Filing Items — SEC-specific */}
            {enrichment?.filingItems && enrichment.filingItems.length > 0 && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
                <SectionHeading eyebrow="SEC filing" title="Filing Items" />
                <p className="font-mono text-[15px] leading-7 text-text-primary">
                  {enrichment.filingItems.join(', ')}
                </p>
              </section>
            )}
          </div>

          {/* Zone divider */}
          <div className="border-t-2 border-white/10" />

          {/* ═══════════════════ ZONE 2: THE EVIDENCE ═══════════════════ */}
          <div id="zone-evidence" ref={evidenceRef} className="scroll-mt-28">
            {/* 8. Stock Context — inline on mobile (sidebar has it on desktop) */}
            <div className="lg:hidden">
              <StockContextPanel data={data} />
            </div>

            {/* 9. Market Regime — inline on mobile */}
            {enrichment?.regimeContext && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5 lg:mt-0">
                <SectionHeading eyebrow="Market regime" title="Regime Context" />
                <p className="text-[15px] leading-7 text-text-secondary">{enrichment.regimeContext}</p>
              </section>
            )}

            {/* 10. Historical Similar Events */}
            {hasHistoricalPattern && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    Pattern match
                  </p>
                  <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">
                    Historical Similar Events
                  </h2>
                  {historical?.patternLabel && (
                    <p className="mt-1 text-sm leading-6 text-text-secondary">{historical.patternLabel}</p>
                  )}
                </div>

                {/* Stats grid — plain language labels */}
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
                  {data.historicalPattern.avgMoveT20 != null && (
                    <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
                      <div className="font-mono text-2xl font-semibold text-text-primary">
                        {formatSignedPercent(data.historicalPattern.avgMoveT20)}
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">Avg 20-day Move</div>
                    </div>
                  )}
                  {data.historicalPattern.winRate != null && (
                    <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
                      <div className="font-mono text-2xl font-semibold text-text-primary">
                        {data.historicalPattern.winRate}%
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        Win Rate
                      </div>
                    </div>
                  )}
                  {data.historicalPattern.avgMoveT5 != null && (
                    <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
                      <div className="font-mono text-2xl font-semibold text-text-primary">
                        {formatSignedPercent(data.historicalPattern.avgMoveT5)}
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">Avg 5-day Move</div>
                    </div>
                  )}
                  <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
                    <div className="font-mono text-2xl font-semibold text-text-primary">
                      {data.historicalPattern.matchCount}
                    </div>
                    <div className="mt-1 text-sm text-text-secondary">Similar events</div>
                  </div>
                </div>

                {/* Confidence bar */}
                <ConfidenceBar matchCount={data.historicalPattern.matchCount} />

                {/* Best / Worst cases */}
                {(historical?.bestCase || historical?.worstCase) && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {historical.bestCase && (
                      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">Best</p>
                        <p className="mt-2 text-sm font-semibold text-emerald-300">
                          {historical.bestCase.ticker} {formatSignedPercent(historical.bestCase.move)}
                        </p>
                      </div>
                    )}
                    {historical.worstCase && (
                      <div className="rounded-2xl border border-red-400/15 bg-red-400/5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">Worst</p>
                        <p className="mt-2 text-sm font-semibold text-severity-critical">
                          {historical.worstCase.ticker} {formatSignedPercent(historical.worstCase.move)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Similar event cards */}
                {similarEvents.length > 0 && (
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
                    {similarEvents.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSimilar((c) => !c)}
                        className="mt-2 inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
                      >
                        {showAllSimilar ? 'Show fewer' : `Show all ${similarEvents.length} →`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Zone divider */}
          <div className="border-t-2 border-white/10" />

          {/* ═══════════════════ ZONE 3: THE TRUST ═══════════════════ */}
          <div id="zone-trust" ref={trustRef} className="scroll-mt-28">
            {/* 11. Source Journey Timeline */}
            {(data.audit || data.provenance.length > 0) && (
              <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
                <SectionHeading eyebrow="Alert provenance" title="Source Journey" />
                <ProvenanceTimeline data={data} />
              </section>
            )}

            {/* 12. Source Accuracy / Verification */}
            {(data.scorecard || hasHistoricalPattern) && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
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
                ) : (
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
                )}
              </section>
            )}

            {/* 13. Confirmation badges */}
            {data.confirmationCount > 1 && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
                <SectionHeading eyebrow="Multi-source confirmation" title="Confirmed Sources" />
                <div className="flex flex-wrap gap-2">
                  {data.confirmedSources.map((source) => (
                    <span
                      key={source}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-200"
                    >
                      <CircleCheckBig className="h-3.5 w-3.5" />
                      {mapSource(source)}
                    </span>
                  ))}
                </div>
                {data.provenance.length > 1 && (
                  <div className="mt-4 space-y-3">
                    {data.provenance.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/6 bg-bg-elevated/60 p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-text-primary">{item.source}</span>
                          <span className="font-mono text-xs text-text-secondary">
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
              </section>
            )}

            {/* 14. Related Events / Source link */}
            {data.url && (
              <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
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

            {/* 15. Feedback bar — inline, not floating */}
            <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">Was this alert useful?</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setFeedback('up'); void submitFeedback(data.id, true); }}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                      feedback === 'up'
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/10 text-text-primary hover:bg-white/6',
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> Useful
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFeedback('down'); void submitFeedback(data.id, false); }}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                      feedback === 'down'
                        ? 'border-severity-critical/40 bg-severity-critical/10 text-severity-critical'
                        : 'border-white/10 text-text-primary hover:bg-white/6',
                    )}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> Not useful
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFeedback('bad'); void submitFeedback(data.id, false); }}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                      feedback === 'bad'
                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                        : 'border-white/10 text-text-primary hover:bg-white/6',
                    )}
                  >
                    <Ban className="h-3.5 w-3.5" /> Bad data
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Legal disclaimer */}
          <Disclaimer />
        </div>

        {/* ── Sidebar (desktop only) ── */}
        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:flex-1 lg:self-start">
          {/* Stock Context */}
          <StockContextPanel data={data} />

          {/* Market Regime */}
          {enrichment?.regimeContext && (
            <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
              <SectionHeading eyebrow="Market regime" title="Regime Context" />
              <p className="text-sm leading-6 text-text-secondary">{enrichment.regimeContext}</p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Quick actions
            </p>
            <div className="space-y-2">
              {data.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6"
                >
                  <ExternalLink className="h-4 w-4" /> View original
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  if (navigator.share) {
                    void navigator.share({ title: data.title, url: window.location.href });
                    return;
                  }
                  void navigator.clipboard?.writeText(window.location.href);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6"
              >
                <Share2 className="h-4 w-4" /> Share alert
              </button>
            </div>
          </div>
        </aside>
      </div>
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
