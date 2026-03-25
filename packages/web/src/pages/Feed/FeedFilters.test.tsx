import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedFilters } from './FeedFilters.js';

describe('FeedFilters', () => {
  it('renders active severity chips without source chips', () => {
    render(
      <FeedFilters
        activeSeverities={['HIGH']}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly={false}
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters={false}
      />,
    );

    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.queryByText('sec-edgar')).not.toBeInTheDocument();
  });

  it('opens only severity and delivery controls when requested', () => {
    render(
      <FeedFilters
        activeSeverities={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters={false}
        pushOnly
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown
        showFilters={false}
      />,
    );

    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /push alerts only/i }).length).toBeGreaterThan(0);
  });

  it('shows only delivery and severity controls when the filter panel is expanded', () => {
    render(
      <FeedFilters
        activeSeverities={['HIGH']}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly={false}
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters
      />,
    );

    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/preset name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('renders an active push-only chip and toggles it off when clicked', async () => {
    const user = userEvent.setup();
    const onTogglePushOnly = vi.fn();

    render(
      <FeedFilters
        activeSeverities={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onTogglePushOnly={onTogglePushOnly}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: /push alerts only/i }));

    expect(onTogglePushOnly).toHaveBeenCalledTimes(1);
  });

  it('shows clear all when push-only is the only active filter', () => {
    render(
      <FeedFilters
        activeSeverities={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters={false}
      />,
    );

    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('removes source filter options entirely', () => {
    render(
      <FeedFilters
        activeSeverities={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters={false}
        pushOnly={false}
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown
        showFilters={false}
      />,
    );

    expect(screen.queryByRole('button', { name: /^dummy$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sec-edgar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^fed$/i })).not.toBeInTheDocument();
  });
});
