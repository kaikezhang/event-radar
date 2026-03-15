import { Plus, Check, CircleCheckBig } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AlertSummary } from '../types/index.js';
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

const severityColor: Record<string, string> = {
  CRITICAL: 'text-severity-critical',
  HIGH: 'text-severity-high',
  MEDIUM: 'text-severity-medium',
  LOW: 'text-severity-low',
};

const severityBarColor: Record<string, string> = {
  CRITICAL: 'bg-severity-critical',
  HIGH: 'bg-severity-high',
  MEDIUM: 'bg-severity-medium',
  LOW: 'bg-severity-low',
};

export function AlertCard({
  alert,
  trustCue,
  showWatchlistButton,
  isOnWatchlist,
  onToggleWatchlist,
}: AlertCardProps) {
  const primaryTicker = alert.tickers[0];

  return (
    <article
      aria-label={alert.title}
      className="relative overflow-hidden rounded-2xl border border-border-default bg-bg-surface p-4 pl-5 transition-colors active:bg-bg-elevated"
    >
      {/* Severity bar — left edge, 3px wide, full height, color-coded */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          severityBarColor[alert.severity] ?? 'bg-severity-low',
        )}
        aria-hidden="true"
      />

      {/* Row 1: Metadata */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            'font-semibold uppercase tracking-wider',
            severityColor[alert.severity] ?? 'text-severity-low',
          )}
        >
          {alert.severity}
        </span>

        <span className="text-text-tertiary">·</span>

        <span className="text-text-tertiary">
          {alert.source} · {formatRelativeTime(alert.time)}
        </span>

        {trustCue && (
          <>
            <span className="text-text-tertiary">·</span>
            <span
              className={cn(
                'text-[11px] font-medium',
                trustCue.tone === 'positive'
                  ? 'text-emerald-300'
                  : trustCue.tone === 'mixed'
                    ? 'text-amber-200'
                    : 'text-text-tertiary',
              )}
            >
              {trustCue.label}
            </span>
          </>
        )}

        {(alert.confirmationCount ?? 1) > 1 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
            <CircleCheckBig className="h-3 w-3" />
            {`Confirmed by ${alert.confirmationCount} sources`}
          </span>
        )}

        {showWatchlistButton && primaryTicker && onToggleWatchlist && (
          <button
            type="button"
            onClick={() => onToggleWatchlist(primaryTicker)}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition',
              isOnWatchlist
                ? 'bg-green-500/12 text-green-400'
                : 'bg-white/6 text-text-secondary hover:bg-white/8',
            )}
            aria-label={isOnWatchlist ? `${primaryTicker} on watchlist` : `Add ${primaryTicker} to watchlist`}
          >
            {isOnWatchlist ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {isOnWatchlist ? 'Watching' : 'Watch'}
          </button>
        )}

        {/* Tickers — right-aligned */}
        <div className={cn('flex gap-1', !showWatchlistButton && 'ml-auto')}>
          {alert.tickers.slice(0, 2).map((t) => (
            <Link
              key={t}
              to={`/ticker/${t}`}
              className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-text-primary transition hover:bg-bg-elevated/80"
            >
              {t}
            </Link>
          ))}
          {alert.tickers.length > 2 && (
            <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-tertiary">
              +{alert.tickers.length - 2}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Title + Summary */}
      <Link
        to={`/event/${alert.id}`}
        aria-label={`Open alert ${alert.title}`}
        className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <h2 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5 text-text-primary">
          {alert.title}
        </h2>
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-text-secondary">
          {alert.summary}
        </p>
      </Link>
    </article>
  );
}
