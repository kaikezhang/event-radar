import { EventChart as PriceChart } from '../../components/EventChart.js';
import type { EventDetailData } from '../../types/index.js';

export function EventChart({
  data,
  height = 200,
  compact = true,
}: {
  data: EventDetailData;
  height?: number;
  compact?: boolean;
}) {
  const primaryTicker = data.tickers[0];
  if (!primaryTicker) return null;

  return (
    <PriceChart
      symbol={primaryTicker}
      defaultRange="3m"
      height={height}
      events={[
        {
          id: data.id,
          severity: data.severity,
          title: data.title,
          time: data.time,
          tickers: data.tickers,
          source: data.source,
          summary: '',
        },
      ]}
      compact={compact}
    />
  );
}
