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
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
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
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={vi.fn()}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
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
        onApplyPreset={vi.fn()}
        onClearFilters={vi.fn()}
        onDeletePreset={vi.fn()}
        onPresetNameChange={onPresetNameChange}
        onSavePreset={vi.fn()}
        onToggleSeverity={vi.fn()}
        onToggleSource={vi.fn()}
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
});
