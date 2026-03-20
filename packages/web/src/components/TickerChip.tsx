import { Link } from 'react-router-dom';
import { cn } from '../lib/utils.js';

export function TickerChip({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  return (
    <Link
      to={`/ticker/${symbol}`}
      className={cn(
        'inline-flex min-h-11 items-center rounded-full border border-overlay-medium bg-overlay-subtle px-3 py-2 text-[13px] font-semibold tracking-wide text-text-primary transition hover:border-accent-default/40 hover:bg-accent-default/10 focus:outline-none focus:ring-2 focus:ring-accent-default',
        className,
      )}
    >
      ${symbol}
    </Link>
  );
}
