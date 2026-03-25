import type { RefObject } from 'react';
import { BellRing, Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';


interface FeedFiltersProps {
  activeSeverities: string[];
  addFilterRef: RefObject<HTMLDivElement | null>;
  hasActiveFilters: boolean;
  pushOnly: boolean;
  onClearFilters: () => void;
  onToggleAddFilterDropdown: () => void;
  onTogglePushOnly: () => void;
  onToggleSeverity: (severity: string) => void;
  severities: readonly string[];
  showAddFilterDropdown: boolean;
  showFilters: boolean;
}

export function FeedFilters({
  activeSeverities,
  addFilterRef,
  hasActiveFilters,
  pushOnly,
  onClearFilters,
  onToggleAddFilterDropdown,
  onTogglePushOnly,
  onToggleSeverity,
  severities,
  showAddFilterDropdown,
  showFilters,
}: FeedFiltersProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Active filters">
        {activeSeverities.map((severity) => (
          <button
            key={`sev-${severity}`}
            type="button"
            onClick={() => onToggleSeverity(severity)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
            role="listitem"
          >
            {severity}
            <X className="h-3 w-3" />
          </button>
        ))}

        <button
          type="button"
          onClick={onTogglePushOnly}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition',
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
            className="inline-flex items-center gap-1 rounded-lg border border-border-default px-2 py-1 text-xs font-medium text-text-tertiary transition hover:border-border-default hover:text-text-secondary"
          >
            <Plus className="h-3 w-3" />
            Add filter
          </button>

          {showAddFilterDropdown && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 space-y-3 rounded-xl border border-border-default bg-bg-surface p-3 shadow-lg">
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Severity</h4>
                <div className="flex flex-wrap gap-1.5">
                  {severities.map((severity) => (
                    <button
                      key={severity}
                      type="button"
                      onClick={() => onToggleSeverity(severity)}
                      className={cn(
                        'rounded-lg border px-2 py-1 text-xs font-medium transition',
                        activeSeverities.includes(severity)
                          ? 'border-interactive-default bg-interactive-default/20 text-interactive-default'
                          : 'border-border-default text-text-secondary hover:text-text-primary',
                      )}
                    >
                      {severity}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Delivery</h4>
                <button
                  type="button"
                  onClick={onTogglePushOnly}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition',
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
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-1 text-xs text-text-tertiary hover:text-text-primary"
          >
            Clear all
          </button>
        )}
      </div>

      {showFilters && (
        <section className="space-y-4 rounded-2xl border border-border-default bg-bg-surface p-4">
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
                      ? 'border-interactive-default bg-interactive-default/20 text-interactive-default'
                      : 'border-border-default bg-bg-surface text-text-primary hover:border-border-bright',
                  )}
                >
                  {severity}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
