import { ChevronDown, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils.js';
import type { FeedTab } from './useFeedState.js';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  onToggleModeDropdown: () => void;
  showModeDropdown: boolean;
}

const TAB_LABELS: Record<FeedTab, string> = {
  smart: 'Smart Feed',
  watchlist: 'My Watchlist',
  all: 'All Events',
};

export function FeedTabs({
  activeTab,
  onTabChange,
  onToggleModeDropdown,
  showModeDropdown,
}: FeedTabsProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showTooltip) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!infoButtonRef.current?.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showTooltip]);

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleModeDropdown}
        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary"
      >
        {TAB_LABELS[activeTab]}
        <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
      </button>

      {activeTab === 'smart' && (
        <button
          ref={infoButtonRef}
          type="button"
          className="relative"
          aria-label="What is Smart Feed?"
          aria-expanded={showTooltip}
          onClick={() => setShowTooltip((prev) => !prev)}
        >
          <Info className="h-3.5 w-3.5 text-text-tertiary cursor-help" />
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-xs text-text-secondary shadow-lg">
              Smart Feed shows events matching your watchlist tickers, plus all CRITICAL events and HIGH-severity events from trusted sources like SEC filings and breaking news.
            </div>
          )}
        </button>
      )}

      {showModeDropdown && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-border-default bg-bg-surface py-1 shadow-lg">
          {(['smart', 'watchlist', 'all'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm',
                activeTab === tab ? 'font-medium text-accent-default' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
