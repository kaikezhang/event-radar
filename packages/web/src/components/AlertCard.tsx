import { Link } from 'react-router-dom';
import type { AlertSummary } from '../types/index.js';
import { formatRelativeTime } from '../lib/format.js';
import { cn } from '../lib/utils.js';
import { SeverityBadge } from './SeverityBadge.js';
import { SourceBadge } from './SourceBadge.js';
import { TickerChip } from './TickerChip.js';

const severityBarClassName = {
  CRITICAL: 'bg-severity-critical',
  HIGH:
    'bg-[length:5px_5px] bg-[repeating-linear-gradient(180deg,var(--severity-high)_0,var(--severity-high)_2px,transparent_2px,transparent_5px)]',
  MEDIUM:
    'bg-[length:5px_8px] bg-[radial-gradient(circle,var(--severity-medium)_1.2px,transparent_1.5px)]',
  LOW: 'bg-severity-low',
};

export function AlertCard({ alert }: { alert: AlertSummary }) {
  return (
    <article
      aria-label={alert.title}
      className="relative overflow-hidden rounded-[28px] border border-border-default bg-bg-surface/95 p-4 pl-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
    >
      <div
        className={cn(
          'absolute inset-y-4 left-0 w-[3px] rounded-full',
          severityBarClassName[alert.severity],
        )}
        aria-hidden="true"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={alert.severity} className="min-h-9 bg-transparent px-0 py-0" />
        <SourceBadge source={alert.source} />
        <div className="flex flex-wrap gap-2">
          {alert.tickers.map((ticker) => (
            <TickerChip key={ticker} symbol={ticker} className="min-h-9 px-2.5 py-1.5 text-xs" />
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-text-secondary">
          {formatRelativeTime(alert.publishedAt)}
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
