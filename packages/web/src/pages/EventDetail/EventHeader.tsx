import { CircleCheckBig } from 'lucide-react';
import { DirectionBadge } from '../../components/DirectionBadge.js';
import { SeverityBadge } from '../../components/SeverityBadge.js';
import { TickerChip } from '../../components/TickerChip.js';
import { formatRelativeTime } from '../../lib/format.js';
import type { EventDetailData } from '../../types/index.js';

export function EventHeader({
  data,
  direction,
  confidence,
  directionContextLine,
}: {
  data: EventDetailData;
  direction: string;
  confidence: number | null;
  directionContextLine: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-center gap-3">
        <SeverityBadge
          severity={data.severity}
          className="min-h-7 px-2.5 py-1 text-[10px] tracking-[0.14em]"
        />
        <span className="text-sm text-text-secondary">{data.source}</span>
        <span className="font-mono text-sm text-text-secondary">{formatRelativeTime(data.time)}</span>
      </div>

      <h1 className="mt-4 text-[20px] font-semibold leading-7 text-text-primary">{data.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {data.tickers.map((ticker) => (
          <TickerChip key={ticker} symbol={ticker} className="px-2.5 py-1.5 text-xs" />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <DirectionBadge
          direction={direction}
          confidence={confidence}
          confidenceBucket={data.scorecard?.originalAlert.confidenceBucket}
          size="md"
        />
        {data.enrichment?.action && (
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium text-text-primary">
            {data.enrichment.action}
          </span>
        )}
      </div>

      {directionContextLine && (
        <p className="mt-3 text-sm text-text-secondary">{directionContextLine}</p>
      )}

      {data.confirmationCount > 1 && (
        <div className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-200">
          <CircleCheckBig className="h-4 w-4" />
          {`Confirmed by ${data.confirmationCount} sources`}
        </div>
      )}
    </section>
  );
}
