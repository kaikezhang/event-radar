import type { MouseEvent, RefObject, TouchEvent } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState.js';
import { PillBanner } from '../../components/PillBanner.js';
import { useTickerBatchPrices } from '../../hooks/useTickerBatchPrices.js';
import { cn } from '../../lib/utils.js';
import { DailyBriefing } from '../../components/DailyBriefing.js';
import type { AlertSummary, FilterPreset, ScorecardSummary } from '../../types/index.js';
import { FeedCard } from './FeedCard.js';
import { FeedFilters } from './FeedFilters.js';
import { FeedHeader } from './FeedHeader.js';
import {
  BUILT_IN_PRESETS,
  POPULAR_TICKERS,
  PULL_THRESHOLD,
  SEVERITIES,
  type DateGroup,
  type FeedTab,
  type SortMode,
} from './useFeedState.js';

interface FeedListProps {
  activeFilterCount: number;
  highSignalCount: number;
  hiddenLowCount: number;
  lowSignalCount: number;
  mediumSignalCount: number;
  activeSeverities: string[];
  activeSources: string[];
  activeTab: FeedTab;
  addFilterRef: RefObject<HTMLDivElement | null>;
  addToWatchlist: (ticker: string) => void;
  allPresets: FilterPreset[];
  applyPreset: (preset: FilterPreset) => void;
  applyPendingAlerts: () => void;
  clearFilters: () => void;
  dateGroups: DateGroup[];
  deletePreset: (name: string) => void;
  dismissBanner: () => void;
  error: unknown;
  filteredAlerts: AlertSummary[];
  handleCardClick: (event: MouseEvent, alertId: string) => void;
  handleDismiss: (alertId: string) => void;
  handleQuickWatchlist: (alert: AlertSummary) => void | Promise<void>;
  handleTabChange: (tab: FeedTab) => void;
  hasActiveFilters: boolean;
  isDesktop: boolean;
  isEmpty: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  isOnWatchlist: (ticker: string) => boolean;
  isRefreshing: boolean;
  newAlertIds: Set<string>;
  onPresetNameChange: (value: string) => void;
  onToggleModeDropdown: () => void;
  onToggleWatchlist: (ticker: string) => void;
  pendingCount: number;
  presetName: string;
  pushOnly: boolean;
  pullDistance: number;
  revealLowSeverity: () => void;
  savePreset: () => void;
  scopedAlertCount: number;
  scorecardSummary: ScorecardSummary | null;
  selectedEventId: string | null;
  sentinelRef: RefObject<HTMLDivElement | null>;
  showAddFilterDropdown: boolean;
  showFilters: boolean;
  showModeDropdown: boolean;
  showUnauthBanner: boolean;
  showSmartFeedEmpty: boolean;
  showWatchlistOnboarding: boolean;
  sortMode: SortMode;
  sources: string[];
  toggleAddFilterDropdown: () => void;
  toggleFilters: () => void;
  togglePushOnly: () => void;
  toggleSortMode: (mode: SortMode) => void;
  toggleSeverity: (severity: string) => void;
  toggleSource: (source: string) => void;
  touchHandlers: {
    onTouchEnd: () => void;
    onTouchMove: (event: TouchEvent<HTMLDivElement>) => void;
    onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  };
}

export function FeedList({
  activeFilterCount,
  highSignalCount,
  hiddenLowCount,
  lowSignalCount,
  mediumSignalCount,
  activeSeverities,
  activeSources,
  activeTab,
  addFilterRef,
  addToWatchlist,
  allPresets,
  applyPreset,
  applyPendingAlerts,
  clearFilters,
  dateGroups,
  deletePreset,
  dismissBanner,
  error,
  filteredAlerts,
  handleCardClick,
  handleDismiss,
  handleQuickWatchlist,
  handleTabChange,
  hasActiveFilters,
  isDesktop,
  isEmpty,
  isInitialLoading,
  isLoadingMore,
  isOnWatchlist,
  isRefreshing,
  newAlertIds,
  onPresetNameChange,
  onToggleModeDropdown,
  onToggleWatchlist,
  pendingCount,
  presetName,
  pushOnly,
  pullDistance,
  revealLowSeverity,
  savePreset,
  scopedAlertCount,
  scorecardSummary,
  selectedEventId,
  sentinelRef,
  showAddFilterDropdown,
  showFilters,
  showModeDropdown,
  showSmartFeedEmpty,
  showUnauthBanner,
  showWatchlistOnboarding,
  sortMode,
  sources,
  toggleAddFilterDropdown,
  toggleFilters,
  togglePushOnly,
  toggleSortMode,
  toggleSeverity,
  toggleSource,
  touchHandlers,
}: FeedListProps) {
  const isWatchlistMode = activeTab === 'watchlist';
  const priceQuotes = useTickerBatchPrices(filteredAlerts, {
    enabled: !isInitialLoading && !error,
  });

  return (
    <div
      className="space-y-3 overflow-x-hidden"
      onTouchStart={touchHandlers.onTouchStart}
      onTouchMove={touchHandlers.onTouchMove}
      onTouchEnd={touchHandlers.onTouchEnd}
    >
      {showUnauthBanner && (
        <div className="flex items-center justify-between rounded-xl border border-accent-default/10 bg-accent-default/5 px-3 py-2">
          <span className="text-xs text-text-secondary">Viewing delayed public feed</span>
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-xs font-medium text-accent-default">
              Sign in for live →
            </Link>
            <button
              type="button"
              onClick={dismissBanner}
              className="text-text-tertiary hover:text-text-secondary"
              aria-label="Dismiss banner"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <FeedHeader
        activeFilterCount={activeFilterCount}
        activeTab={activeTab}
        highSignalCount={highSignalCount}
        hiddenLowCount={hiddenLowCount}
        hasActiveFilters={hasActiveFilters}
        lowSignalCount={lowSignalCount}
        mediumSignalCount={mediumSignalCount}
        onRevealLowSeverity={revealLowSeverity}
        onSortModeChange={toggleSortMode}
        onTabChange={handleTabChange}
        onToggleFilters={toggleFilters}
        onToggleModeDropdown={onToggleModeDropdown}
        showModeDropdown={showModeDropdown}
        sortMode={sortMode}
        totalCount={scopedAlertCount}
      />

      <FeedFilters
        activeSeverities={activeSeverities}
        activeSources={activeSources}
        addFilterRef={addFilterRef}
        allPresets={allPresets}
        builtinPresetNames={BUILT_IN_PRESETS.map((preset) => preset.name)}
        hasActiveFilters={hasActiveFilters}
        pushOnly={pushOnly}
        onApplyPreset={applyPreset}
        onCloseAddFilterDropdown={toggleAddFilterDropdown}
        onClearFilters={clearFilters}
        onDeletePreset={deletePreset}
        onPresetNameChange={onPresetNameChange}
        onSavePreset={savePreset}
        onToggleAddFilterDropdown={toggleAddFilterDropdown}
        onTogglePushOnly={togglePushOnly}
        onToggleSeverity={toggleSeverity}
        onToggleSource={toggleSource}
        presetName={presetName}
        severities={SEVERITIES}
        showAddFilterDropdown={showAddFilterDropdown}
        showFilters={showFilters}
        sources={sources}
      />

      <div
        className={cn(
          'flex items-center justify-center gap-2 transition-opacity',
          pullDistance > 0 || isRefreshing ? 'opacity-100' : 'opacity-0',
        )}
        style={{ height: pullDistance > 0 || isRefreshing ? `${Math.max(pullDistance * 0.3, isRefreshing ? 32 : 0)}px` : '0px' }}
      >
        <RefreshCw
          className={cn(
            'h-4 w-4 text-text-tertiary transition-transform',
            isRefreshing && 'animate-spin',
            pullDistance >= PULL_THRESHOLD && 'text-interactive-default',
          )}
          style={!isRefreshing ? { transform: `rotate(${Math.min(pullDistance * 2, 360)}deg)` } : undefined}
        />
        {isRefreshing && (
          <span className="text-xs text-text-secondary">Refreshing&hellip;</span>
        )}
      </div>

      {pendingCount > 0 ? <PillBanner count={pendingCount} onApply={applyPendingAlerts} /> : null}

      {!isInitialLoading && !error && filteredAlerts.length > 0 && (
        <DailyBriefing />
      )}

      {showSmartFeedEmpty ? (
        <EmptyState
          icon="\u{1F324}\uFE0F"
          title="Quiet day for your watchlist"
          description="No significant events detected in the last 24 hours for your tickers. We're monitoring 15+ sources."
        >
          <button
            type="button"
            onClick={() => handleTabChange('all')}
            className="text-sm font-medium text-accent-default"
          >
            View all events &rarr;
          </button>
        </EmptyState>
      ) : null}

      {showWatchlistOnboarding ? (
        <EmptyState
          icon="📋"
          title="Your watchlist is empty"
          description="Add tickers to see relevant alerts."
        >
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-text-tertiary">Popular right now:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {POPULAR_TICKERS.map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => addToWatchlist(ticker)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-sm font-semibold text-text-primary transition hover:border-accent-default/30"
                >
                  {ticker}
                  <Plus className="h-3 w-3 text-text-tertiary" />
                </button>
              ))}
            </div>
          </div>
          <Link
            to="/"
            onClick={(event) => {
              event.preventDefault();
              handleTabChange('all');
            }}
            className="text-sm font-medium text-accent-default"
          >
            Browse all events →
          </Link>
        </EmptyState>
      ) : null}

      {!showWatchlistOnboarding && (
        <section aria-live="polite">
          {isInitialLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <RefreshCw className="h-6 w-6 animate-spin text-interactive-default" />
              <p className="mt-3 text-sm font-medium text-text-secondary animate-pulse">
                Scanning 15 sources for your watchlist&hellip;
              </p>
            </div>
          ) : null}

          {!isInitialLoading && error ? (
            <EmptyState
              icon="⚠️"
              title="Can't reach the server"
              description="Check your connection and try again."
              ctaLabel="Retry"
            />
          ) : null}

          {!isInitialLoading && !error && filteredAlerts.length === 0 && !isEmpty ? (
            <EmptyState
              icon="🔍"
              title="No alerts match your filters"
              description="Your filters are hiding all alerts."
              ctaLabel="Clear filters"
              onCtaClick={clearFilters}
            />
          ) : null}

          {!isInitialLoading && isEmpty ? (
            <EmptyState
              icon="📡"
              title={isWatchlistMode ? 'No watchlist events yet' : 'Markets are quiet'}
              description={
                isWatchlistMode
                  ? 'No events detected for your watchlist tickers recently. They will appear here when something happens.'
                  : 'No new events match your criteria. Event Radar is scanning SEC filings, executive orders, breaking news, and more.'
              }
            >
              <p className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Live · Scanning
              </p>
            </EmptyState>
          ) : null}

          {!isInitialLoading && !error && dateGroups.length > 0 && (
            <div className="space-y-1">
              {dateGroups.map((group) => (
                <div key={group.date}>
                  <div className="sticky top-0 z-10 -mx-4 px-4 py-2 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-border-default" />
                      <span className="text-xs text-text-tertiary">
                        {group.alerts.length} {group.alerts.length === 1 ? 'event' : 'events'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.alerts.map((alert) => (
                      <FeedCard
                        key={alert.id}
                        alert={alert}
                        isDesktop={isDesktop}
                        isNew={newAlertIds.has(alert.id)}
                        isOnWatchlist={alert.tickers[0] ? isOnWatchlist(alert.tickers[0]) : false}
                        isSelected={selectedEventId === alert.id}
                        onCardClick={handleCardClick}
                        onDismiss={handleDismiss}
                        onQuickWatchlist={handleQuickWatchlist}
                        onToggleWatchlist={onToggleWatchlist}
                        priceQuote={alert.tickers[0] ? priceQuotes[alert.tickers[0].toUpperCase()] : undefined}
                        scorecardSummary={scorecardSummary}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div ref={sentinelRef} className="h-px" />
              {isLoadingMore && (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="h-4 w-4 animate-spin text-text-tertiary" />
                  <span className="ml-2 text-xs text-text-tertiary">Loading more...</span>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
