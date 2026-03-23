import { AlertTriangle, ArrowDown, ArrowUp, Dot } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils.js';

const severityConfig: Record<string, {
    label: string;
    color: string;
    icon: ReactNode;
    barClassName: string;
    barStyle?: string;
  }
> = {
  CRITICAL: {
    label: 'Critical',
    color: 'text-severity-critical',
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
    barClassName: 'w-[3px] bg-severity-critical',
  },
  HIGH: {
    label: 'High',
    color: 'text-severity-high',
    icon: <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />,
    barClassName:
      'w-[3px] bg-[length:4px_4px] bg-[repeating-linear-gradient(180deg,var(--severity-high)_0,var(--severity-high)_2px,transparent_2px,transparent_4px)]',
  },
  MEDIUM: {
    label: 'Medium',
    color: 'text-severity-medium',
    icon: <Dot className="h-4 w-4" aria-hidden="true" />,
    barClassName:
      'w-[3px] bg-[length:4px_6px] bg-[radial-gradient(circle,var(--severity-medium)_1px,transparent_1.4px)]',
  },
  LOW: {
    label: 'Low',
    color: 'text-severity-low',
    icon: <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />,
    barClassName: 'w-px bg-severity-low',
  },
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  const config = severityConfig[severity];
  const tooltip = 'CRITICAL = Major market-moving event, HIGH = Significant event, MEDIUM = Notable event, LOW = Minor event';

  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-full border border-overlay-medium bg-bg-elevated/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]',
        config.color,
        className,
      )}
      aria-label={`${config.label} severity alert`}
      title={tooltip}
    >
      <span
        className={cn('h-5 shrink-0 rounded-full', config.barClassName)}
        aria-hidden="true"
      />
      {config.icon}
      <span>{severity}</span>
    </span>
  );
}
