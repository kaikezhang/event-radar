import { SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { useConnectionStatus, useConnectionRetry } from '../../contexts/ConnectionContext.js';
import { FeedTabs } from './FeedTabs.js';
import type { FeedTab, SortMode } from './useFeedState.js';

interface FeedHeaderProps {
  activeFilterCount: number;
  activeTab: FeedTab;
  highSignalCount: number;
  hiddenLowCount: number;
  hasActiveFilters: boolean;
  lowSignalCount: number;
  mediumSignalCount: number;
  onRevealLowSeverity: () => void;
  onSortModeChange: (mode: SortMode) => void;
  onTabChange: (tab: FeedTab) => void;
  onToggleFilters: () => void;
  onToggleModeDropdown: () => void;
  showModeDropdown: boolean;
  sortMode: SortMode;
  totalCount: number;
}

export function FeedHeader({
  activeFilterCount,
  activeTab,
  highSignalCount,
  hiddenLowCount,
  hasActiveFilters,
  lowSignalCount,
  mediumSignalCount,
  onRevealLowSeverity,
  onSortModeChange,
  onTabChange,
  onToggleFilters,
  onToggleModeDropdown,
  showModeDropdown,
  sortMode,
  totalCount,
}: FeedHeaderProps) {
  const connectionStatus = useConnectionStatus();
  const connectionRetry = useConnectionRetry();
  const importantLabel = `${highSignalCount} important event${highSignalCount === 1 ? '' : 's'} today`;
  const highWidth = totalCount > 0 ? `${(highSignalCount / totalCount) * 100}%` : '0%';
  const mediumWidth = totalCount > 0 ? `${(mediumSignalCount / totalCount) * 100}%` : '0%';
  const lowWidth = totalCount > 0 ? `${(lowSignalCount / totalCount) * 100}%` : '0%';

  return (
    <div className="space-y-2 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <FeedTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          onToggleModeDropdown={onToggleModeDropdown}
          showModeDropdown={showModeDropdown}
        />

        <div className="flex-1" />

        {connectionStatus === 'failed' ? (
          <button
            type="button"
            onClick={connectionRetry}
            className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
            title="Click to retry WebSocket connection"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Connection lost — click to retry
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary"
            title="Real-time event updates via WebSocket"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                connectionStatus === 'connected' && 'bg-emerald-500 animate-pulse',
                connectionStatus === 'reconnecting' && 'bg-amber-500 animate-pulse',
                connectionStatus === 'disconnected' && 'bg-red-500',
              )}
            />
            {connectionStatus === 'connected' && 'Live'}
            {connectionStatus === 'reconnecting' && 'Reconnecting\u2026'}
            {connectionStatus === 'disconnected' && 'Offline'}
          </span>
        )}

        <select
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          className="min-h-[44px] rounded-xl border border-border-default bg-bg-surface px-2.5 py-2 text-xs font-medium text-text-secondary outline-none focus:border-interactive-default"
        >
          <option value="latest">Latest first</option>
          <option value="severity">Highest severity</option>
        </select>

        <button
          type="button"
          onClick={onToggleFilters}
          className={cn(
            'flex min-h-[44px] items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-medium transition',
            hasActiveFilters
              ? 'border-interactive-default/30 bg-interactive-default/10 text-interactive-default'
              : 'border-border-default bg-bg-surface text-text-secondary',
          )}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-interactive-default text-xs text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        <span className="text-xs text-text-tertiary">
          Press ? for keyboard shortcuts
        </span>
      </div>

      {totalCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-default bg-bg-surface/70 px-3 py-2">
          <div className="min-w-[170px]">
            <p className="text-sm font-semibold text-text-primary">{importantLabel}</p>
            <p className="text-xs text-text-tertiary">
              {totalCount} events · {highSignalCount} HIGH+ · {lowSignalCount} LOW
            </p>
          </div>

          <div className="flex min-w-[140px] flex-1 items-center gap-2">
            <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-overlay-light">
              <span className="bg-severity-high" style={{ width: highWidth }} />
              <span className="bg-severity-medium" style={{ width: mediumWidth }} />
              <span className="bg-severity-low/70" style={{ width: lowWidth }} />
            </div>
          </div>

          {activeTab === 'smart' && hiddenLowCount > 0 ? (
            <button
              type="button"
              onClick={onRevealLowSeverity}
              className="rounded-full border border-severity-low/20 bg-severity-low/10 px-3 py-1 text-xs font-medium text-text-secondary transition hover:border-severity-low/35 hover:text-text-primary"
              aria-label={`Showing HIGH+ events · ${hiddenLowCount} LOW ${hiddenLowCount === 1 ? 'event' : 'events'} hidden`}
            >
              Showing HIGH+ events · {hiddenLowCount} LOW {hiddenLowCount === 1 ? 'event' : 'events'} hidden
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
