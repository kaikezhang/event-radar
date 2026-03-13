import { EmptyState } from '../components/EmptyState.js';

export function Watchlist() {
  return (
    <EmptyState
      icon="👁"
      title="Watchlist is coming next"
      description="P0 and P1 focus on the public feed. Watchlist management will layer in after auth and persistence."
      ctaLabel="Back to feed"
    />
  );
}
