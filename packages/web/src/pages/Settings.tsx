import { EmptyState } from '../components/EmptyState.js';

export function Settings() {
  return (
    <EmptyState
      icon="⚙️"
      title="Settings placeholder"
      description="Account settings and notification preferences are out of scope for this delivery, but the shell is ready."
      ctaLabel="Browse feed"
    />
  );
}
