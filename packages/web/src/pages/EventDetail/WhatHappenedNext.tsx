import { cn } from '../../lib/utils.js';
import type { EventOutcome } from '../../types/index.js';
import { SectionHeading } from './shared.js';

interface WhatHappenedNextProps {
  outcome: EventOutcome;
  direction: string;
}

function formatPrice(value: number | null): string {
  if (value == null) return 'pending...';
  return `$${value.toFixed(2)}`;
}

function formatChange(value: number | null): { text: string; color: string; arrow: string } | null {
  if (value == null) return null;
  const pct = value; // DB stores as percentage already (e.g. -5.94 = -5.94%)
  if (pct === 0) {
    return { text: 'Flat', color: 'text-zinc-400', arrow: '—' };
  }
  const isPositive = pct > 0;
  return {
    text: `${isPositive ? '+' : ''}${pct.toFixed(1)}%`,
    color: isPositive ? 'text-emerald-400' : 'text-red-400',
    arrow: isPositive ? '▲' : '▼',
  };
}

function getVerdict(direction: string, change: number | null): { icon: string; label: string } {
  if (change == null) return { icon: '\u23F3', label: 'Pending' };
  if (change === 0) return { icon: '\u2796', label: 'Unclear' };

  const isBearish = direction.toLowerCase() === 'bearish';
  const priceDown = change < 0;
  const correct = isBearish ? priceDown : !priceDown;

  return correct
    ? { icon: '\u2705', label: 'Correct' }
    : { icon: '\u274C', label: 'Wrong' };
}

function PriceRow({
  label,
  price,
  change,
  isPending,
}: {
  label: string;
  price: number | null;
  change: number | null;
  isPending: boolean;
}) {
  const changeInfo = formatChange(change);

  return (
    <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-elevated/50 px-4 py-3">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <div className="flex items-center gap-2 text-[14px]">
        <span className={cn('font-medium', isPending ? 'text-text-tertiary italic' : 'text-text-primary')}>
          {formatPrice(price)}
        </span>
        {changeInfo && (
          <span className={cn('text-[13px] font-medium', changeInfo.color)}>
            ({changeInfo.arrow} {changeInfo.text})
          </span>
        )}
      </div>
    </div>
  );
}

/** Check if ALL follow-up price fields are still pending (null). */
function isAllPending(outcome: EventOutcome): boolean {
  return outcome.price1d == null && outcome.priceT5 == null && outcome.priceT20 == null;
}

/** Check if at least one follow-up price field has data. */
function hasSomeData(outcome: EventOutcome): boolean {
  return outcome.price1d != null || outcome.priceT5 != null || outcome.priceT20 != null;
}

export function WhatHappenedNext({ outcome, direction }: WhatHappenedNextProps) {
  if (outcome.eventPrice == null) return null;

  // If ALL outcome fields are pending, show a single-line message instead of a wall of "pending..."
  if (isAllPending(outcome)) {
    return (
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <SectionHeading eyebrow="Price outcome" title="What Happened Next" />
        <div className="space-y-2">
          <PriceRow label="Price at event" price={outcome.eventPrice} change={null} isPending={false} />
          <div className="flex items-center gap-3 rounded-lg border border-border-default bg-bg-elevated/50 px-4 py-3">
            <span className="text-lg">📊</span>
            <p className="text-sm text-text-secondary">
              Outcome tracking in progress — first results typically appear within 1 trading day
            </p>
          </div>
        </div>
      </section>
    );
  }

  const verdict5d = getVerdict(direction, outcome.changeT5);
  const verdict20d = getVerdict(direction, outcome.changeT20);
  // Use the best available verdict window
  const primaryVerdict = outcome.changeT5 != null ? verdict5d : verdict20d;

  // Build rows — only show available data rows fully, gray out pending ones
  const rows: Array<{ label: string; price: number | null; change: number | null; isPending: boolean }> = [
    { label: 'Price at event', price: outcome.eventPrice, change: null, isPending: false },
  ];

  if (hasSomeData(outcome)) {
    // Show all rows but with pending styling for unavailable ones
    rows.push(
      { label: 'After 1 day', price: outcome.price1d, change: outcome.change1d, isPending: outcome.price1d == null },
      { label: 'After 5 days', price: outcome.priceT5, change: outcome.changeT5, isPending: outcome.priceT5 == null },
      { label: 'After 20 days', price: outcome.priceT20, change: outcome.changeT20, isPending: outcome.priceT20 == null },
    );
  }

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <div className="flex items-center justify-between">
        <SectionHeading eyebrow="Price outcome" title="What Happened Next" />
        {direction && direction !== 'neutral' && (
          <span className="text-lg" title={`Prediction ${primaryVerdict.label.toLowerCase()}`}>
            {primaryVerdict.icon}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <PriceRow
            key={row.label}
            label={row.label}
            price={row.price}
            change={row.change}
            isPending={row.isPending}
          />
        ))}
      </div>
    </section>
  );
}
