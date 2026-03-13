import type { SourceName } from '../types/index.js';
import { cn } from '../lib/utils.js';

const sourceTone: Record<SourceName, string> = {
  'SEC Filing': 'border-accent-default/30 bg-accent-default/10 text-accent-default',
  'Breaking News': 'border-severity-critical/25 bg-severity-critical/10 text-severity-critical',
  'Federal Register': 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  StockTwits: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300',
  Reddit: 'border-orange-400/25 bg-orange-400/10 text-orange-300',
  'Press Release': 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300',
};

export function SourceBadge({
  source,
  className,
}: {
  source: SourceName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide',
        sourceTone[source],
        className,
      )}
    >
      {source}
    </span>
  );
}
