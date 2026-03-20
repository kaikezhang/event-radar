import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedHeader } from './FeedHeader.js';

describe('FeedHeader', () => {
  it('shows the active feed mode label', () => {
    render(
      <FeedHeader
        activeTab="watchlist"
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
      />,
    );

    expect(screen.getByRole('button', { name: /my watchlist/i })).toBeInTheDocument();
  });

  it('shows the active filter count badge', () => {
    render(
      <FeedHeader
        activeTab="all"
        activeFilterCount={3}
        hasActiveFilters
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls back with a new sort mode', async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();

    render(
      <FeedHeader
        activeTab="all"
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={onSortModeChange}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'severity');

    expect(onSortModeChange).toHaveBeenCalledWith('severity');
  });
});
