import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedFilters } from './FeedFilters.js';

describe('FeedFilters', () => {
  it('renders active severity and source chips', () => {
    render(
      <FeedFilters
        activeSeverities={['HIGH']}
        activeSources={['sec-edgar']}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly={false}
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters={false}
        sources={['sec-edgar', 'fed']}
      />,
    );

    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('sec-edgar')).toBeInTheDocument();
  });

  it('opens the add filter controls when requested', () => {
    render(
      <FeedFilters
        activeSeverities={[]}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters={false}
        pushOnly
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown
        showFilters={false}
        sources={['sec-edgar', 'fed']}
      />,
    );

    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /push alerts only/i }).length).toBeGreaterThan(0);
  });

  it('shows only delivery, severity, and source controls when the filter panel is expanded', () => {
    render(
      <FeedFilters
        activeSeverities={['HIGH']}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly={false}
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters
        sources={['sec-edgar', 'fed']}
      />,
    );

    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/preset name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('renders an active push-only chip and toggles it off when clicked', async () => {
    const user = userEvent.setup();
    const onTogglePushOnly = vi.fn();

    render(
      <FeedFilters
        activeSeverities={[]}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={onTogglePushOnly}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters={false}
        sources={['sec-edgar', 'fed']}
      />,
    );

    await user.click(screen.getByRole('button', { name: /push alerts only/i }));

    expect(onTogglePushOnly).toHaveBeenCalledTimes(1);
  });

  it('shows clear all when push-only is the only active filter', () => {
    render(
      <FeedFilters
        activeSeverities={[]}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters
        pushOnly
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters={false}
        sources={['sec-edgar', 'fed']}
      />,
    );

    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('filters dummy out of the source filter options', () => {
    render(
      <FeedFilters
        activeSeverities={[]}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        hasActiveFilters={false}
        pushOnly={false}
        onClearFilters={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown
        showFilters={false}
        sources={['dummy', 'sec-edgar', 'fed']}
      />,
    );

    expect(screen.queryByRole('button', { name: /^dummy$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sec-edgar$/i })).toBeInTheDocument();
  });
});
