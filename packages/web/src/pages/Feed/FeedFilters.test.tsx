import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterPreset } from '../../types/index.js';
import { FeedFilters } from './FeedFilters.js';

const presets: FilterPreset[] = [
  { name: 'Full Firehose', severities: [], sources: [] },
  { name: 'High Conviction', severities: ['HIGH', 'CRITICAL'], sources: [] },
];

describe('FeedFilters', () => {
  it('renders active severity and source chips', () => {
    render(
      <FeedFilters
        activeSeverities={['HIGH']}
        activeSources={['sec-edgar']}
        addFilterRef={createRef<HTMLDivElement>()}
        allPresets={presets}
        builtinPresetNames={['Full Firehose', 'High Conviction']}
        hasActiveFilters
        pushOnly={false}
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        presetName=""
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
        allPresets={presets}
        builtinPresetNames={['Full Firehose', 'High Conviction']}
        hasActiveFilters={false}
        pushOnly
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        presetName=""
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown
        showFilters={false}
        sources={['sec-edgar', 'fed']}
      />,
    );

    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /push alerts only/i }).length).toBeGreaterThan(0);
  });

  it('shows the save preset controls when the filter panel is expanded with active filters', async () => {
    const user = userEvent.setup();
    const onPresetNameChange = vi.fn();

    render(
      <FeedFilters
        activeSeverities={['HIGH']}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        allPresets={presets}
        builtinPresetNames={['Full Firehose', 'High Conviction']}
        hasActiveFilters
        pushOnly={false}
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={onPresetNameChange}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        presetName=""
        severities={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
        showAddFilterDropdown={false}
        showFilters
        sources={['sec-edgar', 'fed']}
      />,
    );

    await user.type(screen.getByPlaceholderText(/preset name/i), 'Momentum');

    expect(onPresetNameChange).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('renders an active push-only chip and toggles it off when clicked', async () => {
    const user = userEvent.setup();
    const onTogglePushOnly = vi.fn();

    render(
      <FeedFilters
        activeSeverities={[]}
        activeSources={[]}
        addFilterRef={createRef<HTMLDivElement>()}
        allPresets={presets}
        builtinPresetNames={['Full Firehose', 'High Conviction']}
        hasActiveFilters
        pushOnly
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={onTogglePushOnly}
        onToggleAddFilterDropdown={vi.fn()}
        presetName=""
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
        allPresets={presets}
        builtinPresetNames={['Full Firehose', 'High Conviction']}
        hasActiveFilters
        pushOnly
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        presetName=""
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
        allPresets={presets}
        builtinPresetNames={['Full Firehose', 'High Conviction']}
        hasActiveFilters={false}
        pushOnly={false}
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
        onTogglePushOnly={vi.fn()}
        onToggleAddFilterDropdown={vi.fn()}
        presetName=""
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
