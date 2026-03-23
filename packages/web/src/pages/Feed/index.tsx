import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Toast } from '../../components/Toast.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useWatchlist } from '../../hooks/useWatchlist.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { getEventSources } from '../../lib/api.js';
import { EventDetail } from '../EventDetail.js';
import { FeedList } from './FeedList.js';
import { useFeedState } from './useFeedState.js';

const ONBOARDING_KEY = 'onboardingComplete';

export function Feed() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);
  const { data: sources = [] } = useQuery<string[]>({
    queryKey: ['event-sources'],
    queryFn: getEventSources,
    staleTime: 60_000,
  });
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const {
    items: watchlistItems,
    isLoading: isWatchlistLoading,
    isOnWatchlist,
    add,
    addAsync,
  } = useWatchlist({ enabled: isAuthenticated });
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const state = useFeedState({
    addAsync,
    hasWatchlist: watchlistItems.length > 0,
    isAuthenticated,
    isAuthLoading,
    isDesktop,
    isOnWatchlist,
    isWatchlistLoading,
    watchlistItems,
  });

  const feedList = (
    <FeedList
      activeFilterCount={state.activeFilterCount}
      highSignalCount={state.highSignalCount}
      hiddenLowCount={state.hiddenLowCount}
      lowSignalCount={state.lowSignalCount}
      mediumSignalCount={state.mediumSignalCount}
      activeSeverities={state.activeSeverities}
      activeSources={state.activeSources}
      activeTab={state.activeTab}
      addFilterRef={state.addFilterRef}
      addToWatchlist={add}
      allPresets={state.allPresets}
      applyPreset={state.applyPreset}
      applyPendingAlerts={state.applyPendingAlerts}
      clearFilters={state.clearFilters}
      dateGroups={state.dateGroups}
      deletePreset={state.deletePreset}
      dismissBanner={state.dismissBanner}
      error={state.error}
      filteredAlerts={state.filteredAlerts}
      handleCardClick={state.handleCardClick}
      handleDismiss={state.handleDismiss}
      handleQuickWatchlist={state.handleQuickWatchlist}
      handleTabChange={state.handleTabChange}
      hasActiveFilters={state.hasActiveFilters}
      isDesktop={isDesktop}
      isEmpty={state.isEmpty}
      isInitialLoading={state.isInitialLoading}
      isLoadingMore={state.isLoadingMore}
      isOnWatchlist={isOnWatchlist}
      isRefreshing={state.isRefreshing}
      newAlertIds={state.newAlertIds}
      onPresetNameChange={state.setPresetName}
      onToggleModeDropdown={() => state.setShowModeDropdown((current) => !current)}
      onToggleWatchlist={add}
      pendingCount={state.pendingCount}
      presetName={state.presetName}
      pushOnly={state.pushOnly}
      pullDistance={state.pullDistance}
      revealLowSeverity={state.revealLowSeverity}
      savePreset={state.savePreset}
      scopedAlertCount={state.scopedAlertCount}
      selectedEventId={state.selectedEventId}
      sentinelRef={state.sentinelRef}
      showAddFilterDropdown={state.showAddFilterDropdown}
      showFilters={state.showFilters}
      showModeDropdown={state.showModeDropdown}
      showSmartFeedEmpty={state.showSmartFeedEmpty}
      showUnauthBanner={!user && !state.bannerDismissed}
      showWatchlistOnboarding={state.showWatchlistOnboarding}
      sortMode={state.sortMode}
      sources={sources}
      toggleAddFilterDropdown={() => state.setShowAddFilterDropdown((current) => !current)}
      toggleFilters={() => state.setShowFilters((current) => !current)}
      togglePushOnly={state.togglePushOnly}
      toggleSortMode={state.setSortMode}
      toggleSeverity={state.toggleSeverity}
      toggleSource={state.toggleSource}
      touchHandlers={{
        onTouchEnd: state.handleTouchEnd,
        onTouchMove: state.handleTouchMove,
        onTouchStart: state.handleTouchStart,
      }}
    />
  );

  if (isDesktop) {
    return (
      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="w-[40%] shrink-0 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          {feedList}
        </div>

        <div
          className="flex-1 overflow-y-auto rounded-2xl border border-border-default bg-bg-surface/50 p-4"
          style={{ maxHeight: 'calc(100vh - 80px)' }}
        >
          {state.selectedEventId ? (
            <EventDetail eventId={state.selectedEventId} onBack={() => state.setSelectedEventId(null)} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-3xl" aria-hidden="true">📰</p>
                <p className="mt-3 text-[15px] font-medium text-text-secondary">Select an event to view details</p>
                <p className="mt-1 text-xs text-text-tertiary">Click any alert card on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {feedList}
      <Toast
        message={state.toastMessage}
        visible={state.toastVisible}
        onDismiss={() => state.setToastVisible(false)}
      />
    </>
  );
}
