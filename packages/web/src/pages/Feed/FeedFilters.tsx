import type { RefObject } from 'react';
import { BellRing, Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { FilterPreset } from '../../types/index.js';

interface FeedFiltersProps {
  activeSeverities: string[];
  activeSources: string[];
  addFilterRef: RefObject<HTMLDivElement | null>;
  allPresets: FilterPreset[];
  builtinPresetNames: string[];
  hasActiveFilters: boolean;
  pushOnly: boolean;
  onApplyPreset: (preset: FilterPreset) => void;
  onCloseAddFilterDropdown?: () => void;
  onClearFilters: () => void;
  onDeletePreset: (name: string) => void;
  onPresetNameChange: (value: string) => void;
  onSavePreset: () => void;
  onToggleAddFilterDropdown: () => void;
  onTogglePushOnly: () => void;
  onToggleSeverity: (severity: string) => void;
  onToggleSource: (source: string) => void;
  presetName: string;
  severities: readonly string[];
  showAddFilterDropdown: boolean;
  showFilters: boolean;
  sources: string[];
}

export function FeedFilters({
  activeSeverities,
  activeSources,
  addFilterRef,
  allPresets,
  builtinPresetNames,
  hasActiveFilters,
  pushOnly,
  onApplyPreset,
  onCloseAddFilterDropdown,
  onClearFilters,
  onDeletePreset,
  onPresetNameChange,
  onSavePreset,
  onToggleAddFilterDropdown,
  onTogglePushOnly,
  onToggleSeverity,
  onToggleSource,
  presetName,
  severities,
  showAddFilterDropdown,
  showFilters,
  sources,
}: FeedFiltersProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Active filters">
        {activeSeverities.map((severity) => (
          <button
            key={`sev-${severity}`}
            type="button"
            onClick={() => onToggleSeverity(severity)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-accent-default/20 bg-accent-default/10 px-2 py-1 text-[11px] font-medium text-accent-default"
            role="listitem"
          >
            {severity}
            <X className="h-3 w-3" />
          </button>
        ))}

        {activeSources.map((source) => (
          <button
            key={`src-${source}`}
            type="button"
            onClick={() => onToggleSource(source)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-accent-default/20 bg-accent-default/10 px-2 py-1 text-[11px] font-medium text-accent-default"
            role="listitem"
          >
            {source}
            <X className="h-3 w-3" />
          </button>
        ))}

        <button
          type="button"
          onClick={onTogglePushOnly}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition',
            pushOnly
              ? 'border-sky-400/20 bg-sky-400/10 text-sky-300'
              : 'border-border-default text-text-secondary hover:border-sky-400/30 hover:text-text-primary',
          )}
          aria-label="Push alerts only"
        >
          <BellRing className="h-3 w-3" />
          Push alerts only
          {pushOnly && <X className="h-3 w-3" />}
        </button>

        <div className="relative" ref={addFilterRef}>
          <button
            type="button"
            onClick={onToggleAddFilterDropdown}
            className="inline-flex items-center gap-1 rounded-lg border border-border-default px-2 py-1 text-[11px] font-medium text-text-tertiary transition hover:border-border-default hover:text-text-secondary"
          >
            <Plus className="h-3 w-3" />
            Add filter
          </button>

          {showAddFilterDropdown && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 space-y-3 rounded-xl border border-border-default bg-bg-surface p-3 shadow-lg">
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Severity</h4>
                <div className="flex flex-wrap gap-1.5">
                  {severities.map((severity) => (
                    <button
                      key={severity}
                      type="button"
                      onClick={() => onToggleSeverity(severity)}
                      className={cn(
                        'rounded-lg border px-2 py-1 text-[11px] font-medium transition',
                        activeSeverities.includes(severity)
                          ? 'border-accent-default bg-accent-default/20 text-accent-default'
                          : 'border-border-default text-text-secondary hover:text-text-primary',
                      )}
                    >
                      {severity}
                    </button>
                  ))}
                </div>
              </div>

              {sources.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Source</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map((source) => (
                      <button
                        key={source}
                        type="button"
                        onClick={() => onToggleSource(source)}
                        className={cn(
                          'rounded-lg border px-2 py-1 text-[11px] font-medium transition',
                          activeSources.includes(source)
                            ? 'border-accent-default bg-accent-default/20 text-accent-default'
                            : 'border-border-default text-text-secondary hover:text-text-primary',
                        )}
                      >
                        {source}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Delivery</h4>
                <button
                  type="button"
                  onClick={onTogglePushOnly}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition',
                    pushOnly
                      ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                      : 'border-border-default text-text-secondary hover:text-text-primary',
                  )}
                  aria-label="Push alerts only"
                  aria-pressed={pushOnly}
                >
                  <BellRing className="h-3 w-3" />
                  Push alerts only
                </button>
              </div>

              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Presets</h4>
                <div className="flex flex-wrap gap-1.5">
                  {allPresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        onCloseAddFilterDropdown?.();
                      }}
                      className="rounded-lg border border-border-default px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:text-text-primary"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-1 text-[11px] text-text-tertiary hover:text-text-primary"
          >
            Clear all
          </button>
        )}
      </div>

      {showFilters && (
        <section className="space-y-4 rounded-2xl border border-border-default bg-bg-surface p-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Presets</h3>
            <div className="flex flex-wrap gap-2">
              {allPresets.map((preset) => (
                <div key={preset.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onApplyPreset(preset)}
                    className="inline-flex items-center rounded-xl border border-border-default bg-bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition hover:border-border-bright"
                  >
                    {preset.name}
                  </button>

                  {!builtinPresetNames.includes(preset.name) && (
                    <button
                      type="button"
                      onClick={() => onDeletePreset(preset.name)}
                      className="rounded-full p-1 text-text-tertiary hover:text-red-400"
                      aria-label={`Delete preset ${preset.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(event) => onPresetNameChange(event.target.value)}
                placeholder="Preset name..."
                className="flex-1 rounded-xl border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-default focus:outline-none"
              />
              <button
                type="button"
                onClick={onSavePreset}
                disabled={!presetName.trim()}
                className="inline-flex items-center rounded-xl bg-accent-default px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Delivery</h3>
            <button
              type="button"
              onClick={onTogglePushOnly}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                pushOnly
                  ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                  : 'border-border-default bg-bg-surface text-text-primary hover:border-border-bright',
              )}
              aria-label="Push alerts only"
              aria-pressed={pushOnly}
            >
              <BellRing className="h-4 w-4" />
              Push alerts only
            </button>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Severity</h3>
            <div className="flex flex-wrap gap-2">
              {severities.map((severity) => (
                <button
                  key={severity}
                  type="button"
                  onClick={() => onToggleSeverity(severity)}
                  className={cn(
                    'inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                    activeSeverities.includes(severity)
                      ? 'border-accent-default bg-accent-default/20 text-accent-default'
                      : 'border-border-default bg-bg-surface text-text-primary hover:border-border-bright',
                  )}
                >
                  {severity}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Source</h3>
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => onToggleSource(source)}
                  className={cn(
                    'inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                    activeSources.includes(source)
                      ? 'border-accent-default bg-accent-default/20 text-accent-default'
                      : 'border-border-default bg-bg-surface text-text-primary hover:border-border-bright',
                  )}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
