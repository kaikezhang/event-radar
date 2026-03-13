import { EmptyState } from '../components/EmptyState.js';

export function Search() {
  return (
    <EmptyState
      icon="🔍"
      title="Search coming soon"
      description="The tab is here to keep navigation stable while search and ticker autocomplete land."
      ctaLabel="Browse feed"
    />
  );
}
