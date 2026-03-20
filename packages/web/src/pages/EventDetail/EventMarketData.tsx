import { RangeBar } from '../../components/RangeBar.js';
import { StatMini } from '../../components/StatMini.js';
import type { EventDetailData } from '../../types/index.js';
import { EventChart } from './EventChart.js';
import { SectionHeading } from './shared.js';

export function EventMarketData({ data }: { data: EventDetailData }) {
  const marketData = data.marketData;
  if (!marketData) return null;

  const primaryTicker = data.tickers[0];

  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Stock context" title={primaryTicker ?? 'Market Data'} />

      {primaryTicker && (
        <div className="mb-4 -mx-1">
          <EventChart data={data} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatMini label="Price" value={`$${marketData.price.toFixed(2)}`} />
        <StatMini
          label="Today"
          value={`${marketData.change1d > 0 ? '+' : ''}${marketData.change1d.toFixed(1)}%`}
          tone={marketData.change1d >= 0 ? 'positive' : 'negative'}
        />
        <StatMini
          label="5-Day"
          value={`${marketData.change5d > 0 ? '+' : ''}${marketData.change5d.toFixed(1)}%`}
          tone={marketData.change5d >= 0 ? 'positive' : 'negative'}
        />
        <StatMini label="RSI" value={`RSI ${marketData.rsi14}`} />
        <StatMini
          label="Volume"
          value={marketData.volumeRatio ? `${marketData.volumeRatio.toFixed(1)}x avg` : 'N/A'}
        />
        <StatMini
          label="52W Range"
          value={marketData.high52w && marketData.low52w
            ? `$${marketData.low52w.toFixed(0)} - $${marketData.high52w.toFixed(0)}`
            : 'N/A'}
        />
      </div>

      {marketData.high52w && marketData.low52w && marketData.price && (
        <RangeBar low={marketData.low52w} high={marketData.high52w} current={marketData.price} />
      )}
    </div>
  );
}
