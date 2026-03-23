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
        hiddenLowCount={0}
        hasActiveFilters={false}
        lowSignalCount={0}
        mediumSignalCount={0}
        onRevealLowSeverity={vi.fn()}
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
        hiddenLowCount={0}
        hasActiveFilters
        lowSignalCount={0}
        mediumSignalCount={0}
        onRevealLowSeverity={vi.fn()}
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
        hiddenLowCount={0}
        hasActiveFilters={false}
        lowSignalCount={0}
        mediumSignalCount={0}
        onRevealLowSeverity={vi.fn()}
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
        hiddenLowCount={0}
        hasActiveFilters={false}
        lowSignalCount={0}
        mediumSignalCount={1}
        onRevealLowSeverity={vi.fn()}
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

  it('shows feed quality stats and a reveal-low pill in smart mode', async () => {
    const user = userEvent.setup();
    const onRevealLowSeverity = vi.fn();

    render(
      <FeedHeader
        activeTab="smart"
        activeFilterCount={0}
        highSignalCount={2}
        hiddenLowCount={3}
        hasActiveFilters={false}
        lowSignalCount={3}
        mediumSignalCount={1}
        onRevealLowSeverity={onRevealLowSeverity}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={6}
      />,
    );

    expect(screen.getByText(/2 important events today/i)).toBeInTheDocument();
    expect(screen.getByText(/6 events · 2 high\+ · 3 low/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /showing high\+ events · 3 low events hidden/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /showing high\+ events · 3 low events hidden/i }));

    expect(onRevealLowSeverity).toHaveBeenCalledTimes(1);
  });

  it('shows a visible keyboard shortcuts hint near the primary feed controls', () => {
    render(
      <FeedHeader
        activeTab="all"
        activeFilterCount={0}
        highSignalCount={1}
        hiddenLowCount={0}
        hasActiveFilters={false}
        lowSignalCount={0}
        mediumSignalCount={0}
        onRevealLowSeverity={vi.fn()}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
        totalCount={1}
      />,
    );

    expect(screen.getByText(/press \? for keyboard shortcuts/i)).toBeInTheDocument();
  });
});
