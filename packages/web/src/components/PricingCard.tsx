import { Link } from 'react-router-dom';

const DEFAULT_FEATURES = [
  'Full real-time feed (13 sources)',
  'AI analysis with bull/bear thesis',
  'Earnings calendar + historical outcomes',
  'Audio alerts for CRITICAL events',
  'Watchlist with price tracking',
  'Scorecard with setup-worked metrics',
] as const;

interface PricingCardProps {
  ctaHref?: string;
  ctaLabel?: string;
}

export function PricingCard({
  ctaHref = '/login',
  ctaLabel = 'Start 14-Day Free Trial',
}: PricingCardProps) {
  return (
    <section className="rounded-[2rem] border border-border-default bg-[linear-gradient(160deg,rgba(249,115,22,0.14),rgba(17,18,23,0.98)_42%,rgba(9,9,11,0.98))] p-6 shadow-[0_22px_50px_var(--shadow-color)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-default">
            Single Tier
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-text-primary">Trader</h2>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Pricing</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">$39/month</p>
        </div>
      </div>

      <ul className="mt-6 space-y-3 text-sm text-text-secondary">
        {DEFAULT_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-default/15 text-xs font-semibold text-accent-default">
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        to={ctaHref}
        className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-accent-default px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}
