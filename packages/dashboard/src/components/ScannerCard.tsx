import type { ScannerDetail } from '../types/api.js';
import { cn } from '../lib/utils.js';

interface ScannerCardProps {
  scanner: ScannerDetail;
}

const statusColor: Record<string, string> = {
  healthy: 'text-radar-green',
  degraded: 'text-radar-amber',
  down: 'text-radar-red',
};

const borderColor: Record<string, string> = {
  healthy: 'border-radar-border',
  degraded: 'border-radar-amber/30',
  down: 'border-radar-red/30',
};

export function ScannerCard({ scanner }: ScannerCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-radar-surface p-3 transition-colors',
        borderColor[scanner.status] ?? 'border-radar-border',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              statusColor[scanner.status] === 'text-radar-green'
                ? 'bg-radar-green'
                : statusColor[scanner.status] === 'text-radar-amber'
                  ? 'bg-radar-amber'
                  : 'bg-radar-red',
            )}
          />
          <span className="text-sm font-medium">{scanner.name}</span>
        </div>
        <span className={cn('font-mono text-xs', statusColor[scanner.status] ?? 'text-radar-text-muted')}>
          {scanner.status}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-radar-text-muted">
        <span>Last: {scanner.last_scan}</span>
        <span>
          {scanner.error_count > 0 && (
            <span className="text-radar-red">
              {scanner.error_count} error{scanner.error_count !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>
      {scanner.in_backoff && (
        <div className="mt-1 text-xs font-medium text-radar-amber">⚠ In backoff</div>
      )}
    </div>
  );
}
