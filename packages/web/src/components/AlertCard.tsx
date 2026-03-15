import { Plus, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AlertSummary } from '../types/index.js';
import { formatRelativeTime } from '../lib/format.js';
import { cn } from '../lib/utils.js';
import { SeverityBadge } from './SeverityBadge.js';
import { SourceBadge } from './SourceBadge.js';
import { TickerChip } from './TickerChip.js';

const severityBarClassName = {
  CRITICAL: 'w-[3px] bg-severity-critical',
  HIGH:
    'w-[3px] bg-[length:5px_5px] bg-[repeating-linear-gradient(180deg,var(--severity-high)_0,var(--severity-high)_2px,transparent_2px,transparent_5px)]',
  MEDIUM:
    'w-[3px] bg-[length:5px_8px] bg-[radial-gradient(circle,var(--severity-medium)_1.2px,transparent_1.5px)]',
  LOW: 'w-px bg-severity-low',
};

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
      className="relative overflow-hidden rounded-[28px] border border-border-default bg-bg-surface/95 p-4 pl-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
    >
      <div
        className={cn(
          'absolute inset-y-4 left-0 rounded-full',
          severityBarClassName[alert.severity as keyof typeof severityBarClassName] ?? 'w-px bg-severity-low',
        )}
        aria-hidden="true"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={alert.severity} className="min-h-9 bg-transparent px-0 py-0" />
        <SourceBadge source={alert.source} />
        <div className="flex flex-wrap gap-2">
          {alert.tickers.map((ticker) => (
            <TickerChip key={ticker} symbol={ticker} className="px-2.5 py-1.5 text-xs" />
          ))}
        </div>
        {trustCue && (
          <span
            className={cn(
              'inline-flex min-h-8 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide',
              trustCue.tone === 'positive'
                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                : trustCue.tone === 'mixed'
                ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                : 'border-white/10 bg-white/6 text-text-secondary',
            )}
          >
            {trustCue.label}
          </span>
        )}
        {showWatchlistButton && primaryTicker && onToggleWatchlist && (
          <button
            type="button"
            onClick={() => onToggleWatchlist(primaryTicker)}
            className={cn(
              'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
              isOnWatchlist
                ? 'border-green-500/30 bg-green-500/12 text-green-400'
                : 'border-white/10 bg-white/6 text-text-secondary hover:bg-white/8',
            )}
            aria-label={isOnWatchlist ? `${primaryTicker} on watchlist` : `Add ${primaryTicker} to watchlist`}
          >
            {isOnWatchlist ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {isOnWatchlist ? 'Watching' : 'Watch'}
          </button>
        )}
        <span className="ml-auto font-mono text-xs text-text-secondary">
          {formatRelativeTime(alert.time)}
        </span>
      </div>

      <Link
        to={`/event/${alert.id}`}
        aria-label={`Open alert ${alert.title}`}
        className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <h2 className="line-clamp-2 text-[17px] font-semibold leading-6 text-text-primary">
          {alert.title}
        </h2>
        <p className="mt-2 line-clamp-1 text-[15px] leading-6 text-text-secondary">
          {alert.summary}
        </p>
      </Link>
    </article>
  );
}
