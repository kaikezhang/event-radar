import { Link } from 'react-router-dom';
import { PricingCard } from '../components/PricingCard.js';

const HIGHLIGHTS = [
  '13 real-time data sources',
  'AI-classified severity',
  'Historical outcome tracking',
  'Truth Social → Market impact mapping',
] as const;

export function Landing() {
  return (
    <div className="mx-auto max-w-5xl py-8">
      <section className="overflow-hidden rounded-[2rem] border border-border-default bg-[linear-gradient(140deg,rgba(249,115,22,0.15),rgba(17,18,23,0.98)_35%,rgba(9,9,11,0.98))] p-6 shadow-[0_24px_60px_var(--shadow-color)] sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent-default">
              Market Intelligence
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
              Event Radar
            </h1>
            <p className="mt-4 text-lg font-medium text-text-primary sm:text-xl">
              AI-powered stock market event intelligence
            </p>
            <p className="mt-4 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
              Monitor live catalysts across filings, macro releases, political posts, and
              breaking headlines without losing the source context that matters when speed counts.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent-default px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                See Live Feed →
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-border-default bg-bg-elevated/70 px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-bg-elevated"
              >
                Start Free Trial →
              </Link>
            </div>

            <ul className="mt-8 grid gap-3 text-sm text-text-secondary sm:grid-cols-2">
              {HIGHLIGHTS.map((highlight) => (
                <li
                  key={highlight}
                  className="rounded-2xl border border-overlay-medium bg-bg-elevated/55 px-4 py-3"
                >
                  ✓ {highlight}
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm font-medium text-text-primary">
              $39/month · 14-day free trial
            </p>
          </div>

          <PricingCard />
        </div>
      </section>
    </div>
  );
}
