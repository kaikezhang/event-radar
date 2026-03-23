import { BellRing, Star, CircleCheckBig } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AlertSummary } from '../types/index.js';
import { DirectionBadge } from './DirectionBadge.js';
import { formatRelativeTime } from '../lib/format.js';
import { cn } from '../lib/utils.js';

interface AlertCardProps {
  alert: AlertSummary;
  trustCue?: {
    label: string;
    tone: 'positive' | 'mixed' | 'caution';
  };
  showWatchlistButton?: boolean;
  isOnWatchlist?: boolean;
  onToggleWatchlist?: (ticker: string) => void;
}

const SOURCE_DISPLAY: Record<string, string> = {
  'sec-edgar': 'SEC EDGAR',
  'breaking-news': 'Breaking News',
  'trading-halt': 'Trading Halt',
  'stocktwits': 'StockTwits',
  'reddit': 'Reddit',
  'econ-calendar': 'Econ Calendar',
  'federal-register': 'Federal Register',
};

const severityColor: Record<string, string> = {
  CRITICAL: 'text-severity-critical',
  HIGH: 'text-severity-high',
  MEDIUM: 'text-severity-medium',
  LOW: 'text-severity-low',
};

const severityDot: Record<string, string> = {
  CRITICAL: 'bg-severity-critical',
  HIGH: 'bg-severity-high',
  MEDIUM: 'bg-severity-medium',
  LOW: 'bg-severity-low',
};

const severityBarColor: Record<string, string> = {
  CRITICAL: 'bg-severity-critical',
  HIGH: 'bg-severity-high',
  MEDIUM: 'bg-severity-medium',
  LOW: 'bg-severity-low',
};

function displaySource(source: string, sourceKey?: string): string {
  if (sourceKey && SOURCE_DISPLAY[sourceKey]) return SOURCE_DISPLAY[sourceKey];
  return SOURCE_DISPLAY[source] ?? source;
}

export function AlertCard({
  alert,
  trustCue,
  showWatchlistButton,
  isOnWatchlist,
  onToggleWatchlist,
}: AlertCardProps) {
  const tickers = Array.isArray(alert.tickers) ? alert.tickers : [];
  const primaryTicker = tickers[0];
  const isCritical = alert.severity === 'CRITICAL';
  const isLow = alert.severity === 'LOW';
  const showPushBadge = alert.pushed === true;

  // LOW tier: compressed single-line card
  if (isLow) {
    return (
      <article
        aria-label={alert.title}
        className="relative overflow-hidden rounded-2xl border border-border-default bg-bg-surface p-3 pl-4 opacity-75 transition-colors active:bg-bg-elevated"
      >
        {/* Subtle left border instead of severity bar */}
        <div className="absolute inset-y-0 left-0 w-px bg-border-default" aria-hidden="true" />

        {/* Row 1: Metadata */}
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span className={cn('font-semibold uppercase tracking-wider', severityColor.LOW)}>
            LOW
          </span>
          <span>·</span>
          <span>{displaySource(alert.source, alert.sourceKey)}</span>
          <span>·</span>
          <span>{formatRelativeTime(alert.time)}</span>
          {showPushBadge && (
            <>
              <span>·</span>
              <PushDeliveryBadge compact />
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {alert.direction && (
              <span className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                alert.direction.toLowerCase() === 'bullish' ? 'text-emerald-400' :
                alert.direction.toLowerCase() === 'bearish' ? 'text-red-400' :
                'text-zinc-400',
              )}>
                {alert.direction.toLowerCase() === 'bullish' ? '▲' :
                 alert.direction.toLowerCase() === 'bearish' ? '▼' : '●'}{' '}
                {alert.direction.toUpperCase()}
              </span>
            )}
            {showWatchlistButton && primaryTicker && onToggleWatchlist && (
              <button
                type="button"
                onClick={() => onToggleWatchlist(primaryTicker)}
                className={cn(
                  'transition',
                  isOnWatchlist ? 'text-amber-400' : 'text-text-tertiary hover:text-text-secondary',
                )}
                aria-label={isOnWatchlist ? `${primaryTicker} on watchlist` : `Add ${primaryTicker} to watchlist`}
              >
                <Star className={cn('h-3 w-3', isOnWatchlist && 'fill-current')} />
              </button>
            )}
          </div>
        </div>

        {/* Compressed title with inline direction */}
        <Link
          to={`/event/${alert.id}`}
          aria-label={`Open alert ${alert.title}`}
          className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <h2 className="mt-1.5 line-clamp-1 text-[14px] font-medium leading-5 text-text-secondary">
            {primaryTicker && <span className="font-semibold text-text-primary">{primaryTicker}</span>}
            {primaryTicker && ' — '}
            {alert.title}
          </h2>
        </Link>

        {/* Single-line footer */}
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          {Array.isArray(alert.tickers) && alert.tickers.slice(0, 3).map((t) => (
            <Link
              key={t}
              to={`/ticker/${t}`}
              className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-semibold text-text-primary transition hover:bg-bg-elevated/80"
            >
              {t}
            </Link>
          ))}
          {Array.isArray(alert.tickers) && alert.tickers.length > 3 && (
            <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-text-tertiary">
              +{alert.tickers.length - 3}
            </span>
          )}
          {alert.direction && (
            <OutcomeBadge direction={alert.direction} change5d={alert.change5d} />
          )}
        </div>
      </article>
    );
  }

  // CRITICAL and standard (HIGH/MEDIUM) cards
  return (
    <article
      aria-label={alert.title}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border-default p-4 transition-colors active:bg-bg-elevated',
        isCritical ? 'bg-bg-elevated pl-7' : 'bg-bg-surface pl-6',
      )}
    >
      {/* Severity bar — left edge */}
      <div
        className={cn(
          'absolute inset-y-0 left-0',
          isCritical ? 'w-[8px] animate-pulse' : 'w-[4px]',
          severityBarColor[alert.severity] ?? 'bg-severity-low',
        )}
        aria-hidden="true"
      />

      {/* Row 1: Signal metadata */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn('inline-block h-1.5 w-1.5 rounded-full', severityDot[alert.severity] ?? 'bg-severity-low')}
            aria-hidden="true"
          />
          <span className={cn('font-semibold uppercase tracking-wider', severityColor[alert.severity])}>
            {alert.severity}
          </span>
        </span>
        <span>{displaySource(alert.source, alert.sourceKey)}</span>
        <span>{formatRelativeTime(alert.time)}</span>
        {(alert.confirmationCount ?? 1) > 1 && (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
            <CircleCheckBig className="h-3 w-3" />
            Confirmed
          </span>
        )}
        {trustCue && (
          <span
            className={cn(
              'font-medium',
              trustCue.tone === 'positive'
                ? 'text-emerald-300'
                : trustCue.tone === 'mixed'
                  ? 'text-amber-200'
                  : 'text-text-tertiary',
            )}
          >
            {trustCue.label}
          </span>
        )}
        {showPushBadge && <PushDeliveryBadge />}
      </div>

      {/* Row 2: Headline */}
      <Link
        to={`/event/${alert.id}`}
        aria-label={`Open alert ${alert.title}`}
        className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <h2 className="mt-2 line-clamp-2 text-[17px] font-semibold leading-6 text-text-primary">
          {primaryTicker && <span className="font-bold">{primaryTicker}</span>}
          {primaryTicker && ' — '}
          {alert.title}
        </h2>
      </Link>

      {/* Row 2.5: Thesis preview */}
      <ThesisPreview summary={alert.summary} direction={alert.direction} />

      {/* Row 3: Direction + Summary */}
      <div className="mt-2.5 flex items-start gap-3">
        {alert.direction && (
          <div className="shrink-0">
            <DirectionBadge
              direction={alert.direction}
              confidence={alert.confidence}
              confidenceBucket={alert.confidenceBucket}
              size="sm"
            />
          </div>
        )}
        <Link
          to={`/event/${alert.id}`}
          className="min-w-0 flex-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <p className="line-clamp-2 text-[14px] leading-5 text-text-secondary">
            {alert.summary}
          </p>
        </Link>
      </div>

      {/* Row 3.5: Price data + outcome badge */}
      {alert.eventPrice != null && (
        <div className="mt-2 flex items-center gap-3 text-[12px]">
          <span className="text-text-tertiary">${alert.eventPrice.toFixed(2)}</span>
          <PriceChange change={alert.change1d} label="1d" />
          <PriceChange change={alert.change5d} label="5d" />
          {alert.direction && (
            <OutcomeBadge direction={alert.direction} change5d={alert.change5d} />
          )}
        </div>
      )}

      {/* Row 3.5: Source-specific detail strip */}
      <SourceDetailStrip source={alert.source} sourceKey={alert.sourceKey} metadata={alert.sourceMetadata} />

      {/* Critical tier: historical preview */}
      {isCritical && alert.summary && (
        <HistoricalPreview summary={alert.summary} />
      )}

      {/* Row 4: Footer */}
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {/* Ticker chips */}
        {Array.isArray(alert.tickers) && alert.tickers.slice(0, 3).map((t) => (
          <Link
            key={t}
            to={`/ticker/${t}`}
            className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-semibold text-text-primary transition hover:bg-bg-elevated/80"
          >
            {t}
          </Link>
        ))}
        {Array.isArray(alert.tickers) && alert.tickers.length > 3 && (
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-text-tertiary">
            +{alert.tickers.length - 3}
          </span>
        )}

        <div className="flex-1" />

        {/* Source accuracy */}
        {trustCue && (
          <span className="text-text-tertiary">
            {trustCue.label}
          </span>
        )}

        {/* Watchlist toggle star */}
        {showWatchlistButton && primaryTicker && onToggleWatchlist && (
          <button
            type="button"
            onClick={() => onToggleWatchlist(primaryTicker)}
            className={cn(
              'ml-1 transition',
              isOnWatchlist ? 'text-amber-400' : 'text-text-tertiary hover:text-text-secondary',
            )}
            aria-label={isOnWatchlist ? `${primaryTicker} on watchlist` : `Add ${primaryTicker} to watchlist`}
          >
            <Star className={cn('h-3.5 w-3.5', isOnWatchlist && 'fill-current')} />
          </button>
        )}
      </div>
    </article>
  );
}

function PushDeliveryBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-sky-400/20 bg-sky-400/10 font-semibold uppercase tracking-[0.16em] text-sky-300',
        compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs',
      )}
      aria-label="Sent as a push alert"
      title="Sent as a push alert"
    >
      <BellRing className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      Push alert
    </span>
  );
}

/** Source-specific detail strip below the summary */
function SourceDetailStrip({
  source,
  sourceKey,
  metadata,
}: {
  source: string;
  sourceKey?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const src = sourceKey ?? source;

  switch (src) {
    case 'breaking-news': {
      const feed = metadata.sourceFeed as string | undefined;
      if (!feed) return null;
      return (
        <div className="mt-2 text-[12px] text-text-tertiary">
          via {feed}
        </div>
      );
    }

    case 'sec-edgar': {
      const formType = metadata.formType as string | undefined;
      const raw = metadata.itemDescriptions;
      const items = Array.isArray(raw) ? raw as string[] : undefined;
      const link = metadata.filingLink as string | undefined;
      if (!formType && !items?.length) return null;
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
          {formType && (
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-primary">
              {formType}
            </span>
          )}
          {items?.map((item, i) => (
            <span key={i} className="text-text-tertiary">{item}</span>
          ))}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-default hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View filing →
            </a>
          )}
        </div>
      );
    }

    case 'trading-halt': {
      const isResume = metadata.isResume as boolean | undefined;
      const code = metadata.haltReasonCode as string | undefined;
      const desc = metadata.haltReasonDescription as string | undefined;
      const haltTime = metadata.haltTime as string | undefined;
      const resumeTime = metadata.resumeTime as string | undefined;

      if (isResume) {
        return (
          <div className="mt-2 text-[12px] text-emerald-400">
            ✅ RESUMED{resumeTime ? ` at ${resumeTime}` : ''}
            {code && desc ? ` · ${code} — ${desc}` : ''}
          </div>
        );
      }

      return (
        <div className="mt-2 text-[12px] text-text-secondary">
          {code && desc ? `${code} — ${desc}` : code ?? desc ?? ''}
          {haltTime ? ` · Halted ${haltTime}` : ''}
          {resumeTime ? ` · Resume ${resumeTime}` : ''}
        </div>
      );
    }

    case 'econ-calendar': {
      const name = metadata.indicatorName as string | undefined;
      const freq = metadata.frequency as string | undefined;
      if (!name && !freq) return null;
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
          {name && <span>{name}</span>}
          {freq && (
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-text-tertiary capitalize">
              {freq}
            </span>
          )}
        </div>
      );
    }

    case 'stocktwits': {
      const current = metadata.currentVolume as number | undefined;
      const previous = metadata.previousVolume as number | undefined;
      const ratio = metadata.ratio as number | undefined;
      if (current == null && ratio == null) return null;
      const ratioLabel = current != null && previous != null && previous > 0
        ? `${(current / previous).toFixed(1)}x`
        : ratio != null
          ? `${ratio.toFixed(1)}x`
          : null;
      return (
        <div className="mt-2 text-[12px] text-text-secondary">
          {ratioLabel && <span>🔥 {ratioLabel} normal volume</span>}
        </div>
      );
    }

    case 'reddit': {
      const upvotes = metadata.upvotes as number | undefined;
      const comments = metadata.comments as number | undefined;
      if (upvotes == null && comments == null) return null;
      const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
      return (
        <div className="mt-2 text-[12px] text-text-secondary">
          {upvotes != null && <span>↑ {fmtNum(upvotes)}</span>}
          {upvotes != null && comments != null && <span> · </span>}
          {comments != null && <span>💬 {fmtNum(comments)}</span>}
        </div>
      );
    }

    default:
      return null;
  }
}

/** Compact price change indicator */
function PriceChange({ change, label }: { change?: number | null; label: string }) {
  if (change == null) return null;
  const isPositive = change > 0;
  const isFlat = change === 0;
  const arrow = isFlat ? '—' : isPositive ? '▲' : '▼';
  const color = isFlat ? 'text-zinc-400' : isPositive ? 'text-emerald-400' : 'text-red-400';
  return (
    <span className={cn('font-medium', color)}>
      {arrow} {isFlat ? 'Flat' : `${isPositive ? '+' : ''}${change.toFixed(1)}%`} ({label})
    </span>
  );
}

/** Outcome badge: correct/wrong/pending */
function OutcomeBadge({ direction, change5d }: { direction: string; change5d?: number | null }) {
  if (!direction || direction === 'neutral') return null;

  if (change5d == null) {
    return <span className="text-zinc-400" title="Outcome pending">&#x23F3;</span>;
  }

  if (change5d === 0) {
    return <span className="text-zinc-400" title="Flat — unclear outcome">&#x2796;</span>;
  }

  const isBearish = direction.toLowerCase() === 'bearish';
  const priceDown = change5d < 0;
  const correct = isBearish ? priceDown : !priceDown;

  return correct
    ? <span className="text-emerald-400" title="Prediction correct">&#x2705;</span>
    : <span className="text-red-400" title="Prediction wrong">&#x274C;</span>;
}

/** One-line thesis preview extracted from the summary */
function ThesisPreview({ summary, direction }: { summary?: string; direction?: string }) {
  if (!summary || !direction || direction === 'neutral') return null;

  // Extract the first sentence as a thesis snippet
  const firstSentence = summary.match(/^[^.!?]+[.!?]/)?.[0] ?? summary;
  const thesis = firstSentence.length > 100 ? firstSentence.slice(0, 97) + '\u2026' : firstSentence;

  // Skip when the thesis would duplicate the full summary
  if (thesis === summary) return null;

  return (
    <p className="mt-1.5 line-clamp-1 text-[13px] leading-5 text-text-tertiary italic">
      {thesis}
    </p>
  );
}

/** Extract a historical pattern preview from the summary text for CRITICAL cards */
function HistoricalPreview({ summary }: { summary: string }) {
  // Look for historical pattern mentions in summary text
  const histMatch = summary.match(/historical.*?(\d+%\s*win\s*rate)/i)
    ?? summary.match(/(similar\s+events.*?\d+%)/i);

  if (!histMatch) return null;

  return (
    <div className="mt-2 rounded-lg bg-bg-surface/50 px-3 py-1.5 text-[12px] text-text-secondary">
      <span aria-hidden="true">📊</span>{' '}
      <span className="font-medium">Historical:</span> {histMatch[0]}
    </div>
  );
}
