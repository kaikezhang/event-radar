import { cn } from '../lib/utils.js';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  healthy: 'bg-radar-green/10 text-radar-green border-radar-green/30',
  ok: 'bg-radar-green/10 text-radar-green border-radar-green/30',
  degraded: 'bg-radar-amber/10 text-radar-amber border-radar-amber/30',
  down: 'bg-radar-red/10 text-radar-red border-radar-red/30',
  delivered: 'bg-radar-green/10 text-radar-green border-radar-green/30',
  filtered: 'bg-radar-red/10 text-radar-red border-radar-red/30',
  deduped: 'bg-white/5 text-radar-text-muted border-white/10',
  grace_period: 'bg-radar-amber/10 text-radar-amber border-radar-amber/30',
  error: 'bg-radar-red/10 text-radar-red border-radar-red/30',
  connected: 'bg-radar-green/10 text-radar-green border-radar-green/30',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-white/5 text-radar-text-muted border-white/10';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono',
        style,
        className,
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
