import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedHeader } from './FeedHeader.js';

describe('FeedHeader', () => {
  it('removes the smart feed label and explainer affordance', () => {
    render(
      <FeedHeader
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onToggleFilters={vi.fn()}
        sortMode="latest"
      />,
    );

    expect(screen.queryByText(/smart feed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /what is smart feed\?/i })).not.toBeInTheDocument();
  });

  it('shows the active filter count badge', () => {
    render(
      <FeedHeader
        activeFilterCount={3}
        hasActiveFilters
        onSortModeChange={vi.fn()}
        onToggleFilters={vi.fn()}
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
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={onSortModeChange}
        onToggleFilters={vi.fn()}
        sortMode="latest"
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'severity');

    expect(onSortModeChange).toHaveBeenCalledWith('severity');
  });

  it('keeps the smart feed explainer removed', () => {
    render(
      <FeedHeader
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onToggleFilters={vi.fn()}
        sortMode="latest"
      />,
    );

    expect(screen.queryByText(/smart feed shows watchlist-matching events/i)).not.toBeInTheDocument();
  });

  it('does not render the removed signal summary bar or shortcut hint', () => {
    render(
      <FeedHeader
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onToggleFilters={vi.fn()}
        sortMode="latest"
      />,
    );

    expect(screen.queryByText(/all events/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/my watchlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/press \? for keyboard shortcuts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/important events today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/events · 2 high\+ · 1 low/i)).not.toBeInTheDocument();
  });
});
