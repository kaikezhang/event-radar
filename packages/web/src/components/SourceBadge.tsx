import { cn } from '../lib/utils.js';

const sourceTone: Record<string, string> = {
  'SEC Filing': 'border-accent-default/30 bg-accent-default/10 text-accent-default',
  'Breaking News': 'border-severity-critical/25 bg-severity-critical/10 text-severity-critical',
  'Federal Register': 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  'White House': 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  'StockTwits': 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300',
  'Reddit': 'border-orange-400/25 bg-orange-400/10 text-orange-300',
  'Economic Calendar': 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300',
  'DOJ': 'border-purple-400/25 bg-purple-400/10 text-purple-300',
  'FDA': 'border-green-400/25 bg-green-400/10 text-green-300',
  'Congress': 'border-blue-400/25 bg-blue-400/10 text-blue-300',
  'Options Flow': 'border-pink-400/25 bg-pink-400/10 text-pink-300',
  'Analyst': 'border-indigo-400/25 bg-indigo-400/10 text-indigo-300',
  'Earnings': 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  'WARN Act': 'border-red-400/25 bg-red-400/10 text-red-300',
};

const defaultTone = 'border-gray-400/25 bg-gray-400/10 text-gray-300';

export function SourceBadge({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide',
        sourceTone[source] ?? defaultTone,
        className,
      )}
    >
      {source}
    </span>
  );
}
