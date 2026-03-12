import type { PipelineFunnel } from '../types/api.js';
import { formatNumber } from '../lib/utils.js';

interface FunnelChartProps {
  funnel: PipelineFunnel;
  conversion: string;
}

const stages: { key: keyof PipelineFunnel; label: string; color: string }[] = [
  { key: 'ingested', label: 'Ingested', color: 'bg-radar-blue' },
  { key: 'deduplicated', label: 'Deduplicated', color: 'bg-radar-purple' },
  { key: 'unique', label: 'Unique', color: 'bg-radar-amber' },
  { key: 'filter_passed', label: 'Filter Passed', color: 'bg-radar-green-dim' },
  { key: 'delivered', label: 'Delivered', color: 'bg-radar-green' },
];

export function FunnelChart({ funnel, conversion }: FunnelChartProps) {
  const max = Math.max(funnel.ingested, 1);

  return (
    <div className="space-y-3">
      {stages.map(({ key, label, color }) => {
        const value = funnel[key];
        const pct = (value / max) * 100;
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-radar-text-muted">{label}</span>
              <span className="font-mono text-radar-text">{formatNumber(value)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-sm bg-white/5">
              <div
                className={`h-full rounded-sm ${color} transition-all duration-500`}
                style={{ width: `${Math.max(pct, 0.5)}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="mt-2 border-t border-radar-border pt-2 text-center">
        <span className="text-xs text-radar-text-muted">Conversion: </span>
        <span className="font-mono text-sm font-semibold text-radar-green">{conversion}</span>
      </div>
    </div>
  );
}
