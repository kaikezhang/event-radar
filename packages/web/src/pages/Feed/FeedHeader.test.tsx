import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedHeader } from './FeedHeader.js';

describe('FeedHeader', () => {
  it('shows the active feed mode label', () => {
    render(
      <FeedHeader
        activeTab="watchlist"
        activeFilterCount={0}
        highSignalCount={0}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={0}
      />,
    );

    expect(screen.getByRole('button', { name: /my watchlist/i })).toBeInTheDocument();
  });

  it('shows the active filter count badge', () => {
    render(
      <FeedHeader
        activeTab="all"
        activeFilterCount={3}
        highSignalCount={0}
        hasActiveFilters
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={0}
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
        highSignalCount={0}
        hasActiveFilters={false}
        onSortModeChange={onSortModeChange}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={0}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'severity');

    expect(onSortModeChange).toHaveBeenCalledWith('severity');
  });

  it('toggles the Smart Feed explainer on click', async () => {
    const user = userEvent.setup();

    render(
      <FeedHeader
        activeTab="smart"
        activeFilterCount={0}
        highSignalCount={2}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={4}
      />,
    );

    expect(screen.queryByText(/smart feed shows events matching your watchlist tickers/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /what is smart feed\?/i }));

    expect(
      screen.getByText(
        /smart feed shows events matching your watchlist tickers, plus all critical events and high-severity events from trusted sources like sec filings and breaking news\./i,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /what is smart feed\?/i }));

    expect(
      screen.queryByText(
        /smart feed shows events matching your watchlist tickers, plus all critical events and high-severity events from trusted sources like sec filings and breaking news\./i,
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the smart-feed quality ratio when alerts are visible', () => {
    render(
      <FeedHeader
        activeTab="smart"
        activeFilterCount={0}
        highSignalCount={2}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={4}
      />,
    );

    expect(screen.getByText(/2 high-signal \/ 4 total/i)).toBeInTheDocument();
  });
});
