import { SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { useConnectionStatus } from '../../contexts/ConnectionContext.js';
import { FeedTabs } from './FeedTabs.js';
import type { FeedTab, SortMode } from './useFeedState.js';

interface FeedHeaderProps {
  activeFilterCount: number;
  activeTab: FeedTab;
  hasActiveFilters: boolean;
  onSortModeChange: (mode: SortMode) => void;
  onTabChange: (tab: FeedTab) => void;
  onToggleFilters: () => void;
  onToggleModeDropdown: () => void;
  showModeDropdown: boolean;
  sortMode: SortMode;
}

export function FeedHeader({
  activeFilterCount,
  activeTab,
  hasActiveFilters,
  onSortModeChange,
  onTabChange,
  onToggleFilters,
  onToggleModeDropdown,
  showModeDropdown,
  sortMode,
}: FeedHeaderProps) {
  const connectionStatus = useConnectionStatus();

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <FeedTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        onToggleModeDropdown={onToggleModeDropdown}
        showModeDropdown={showModeDropdown}
      />

      <div className="flex-1" />

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
          <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-interactive-default text-[10px] text-white">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}
