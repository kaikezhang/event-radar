import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { FeedTab } from './useFeedState.js';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  onToggleModeDropdown: () => void;
  showModeDropdown: boolean;
}

export function FeedTabs({
  activeTab,
  onTabChange,
  onToggleModeDropdown,
  showModeDropdown,
}: FeedTabsProps) {
  const isWatchlistMode = activeTab === 'watchlist';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleModeDropdown}
        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary"
      >
        {isWatchlistMode ? 'My Watchlist' : 'All Events'}
        <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
      </button>

      {showModeDropdown && (
        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border border-border-default bg-bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => onTabChange('all')}
            className={cn(
              'w-full px-3 py-2 text-left text-sm',
              !isWatchlistMode ? 'font-medium text-accent-default' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            All Events
          </button>
          <button
            type="button"
            onClick={() => onTabChange('watchlist')}
            className={cn(
              'w-full px-3 py-2 text-left text-sm',
              isWatchlistMode ? 'font-medium text-accent-default' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            My Watchlist
          </button>
        </div>
      )}
    </div>
  );
}
