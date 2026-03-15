import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../components/EmptyState.js';
import { AlertCard } from '../components/AlertCard.js';
import { PillBanner } from '../components/PillBanner.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { useAlerts } from '../hooks/useAlerts.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { getEventSources, getScorecardSummary } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import type { AlertSummary, FilterPreset, ScorecardSummary } from '../types/index.js';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const PRESETS_KEY = 'event-radar-filter-presets';
const FEED_TAB_KEY = 'event-radar-feed-tab';
const UNAUTH_BANNER_KEY = 'event-radar-unauth-banner-dismissed';

type FeedTab = 'watchlist' | 'all';

const BUILT_IN_PRESETS: FilterPreset[] = [
  { name: 'Full Firehose', severities: [], sources: [] },
  { name: 'High Conviction', severities: ['HIGH', 'CRITICAL'], sources: [] },
];

function loadCustomPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: FilterPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function loadFeedTab(): FeedTab | null {
  try {
    const raw = localStorage.getItem(FEED_TAB_KEY);
    return raw === 'watchlist' || raw === 'all' ? raw : null;
  } catch {
    return null;
  }
}

function saveFeedTab(tab: FeedTab) {
  localStorage.setItem(FEED_TAB_KEY, tab);
}

function getTrustCue(
  sourceKey: string | undefined,
  summary: ScorecardSummary | null | undefined,
): { label: string; tone: 'positive' | 'mixed' | 'caution' } | undefined {
  if (!sourceKey || !summary) {
    return undefined;
  }

  const bucket = summary.sourceBuckets.find((item) => item.bucket === sourceKey);
  if (!bucket || bucket.directionalHitRate == null || bucket.alertsWithUsableVerdicts === 0) {
    return undefined;
  }

  const hitRate = Math.round(bucket.directionalHitRate * 100);
  return {
    label: `Source hit rate ${hitRate}%`,
    tone: hitRate >= 65 ? 'positive' : hitRate >= 45 ? 'mixed' : 'caution',
  };
}

/** Group alerts by date for section headers */
function groupAlertsByDate(alerts: AlertSummary[]): { label: string; date: string; alerts: AlertSummary[] }[] {
  const groups = new Map<string, AlertSummary[]>();

  for (const alert of alerts) {
    const dateKey = new Date(alert.time).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(alert);
    } else {
      groups.set(dateKey, [alert]);
    }
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayKey = today.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const yesterdayKey = yesterday.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return Array.from(groups.entries()).map(([dateKey, dateAlerts]) => {
    let label: string;
    if (dateKey === todayKey) {
      label = 'Today';
    } else if (dateKey === yesterdayKey) {
      label = 'Yesterday';
    } else {
      const d = new Date(dateAlerts[0].time);
      label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return { label, date: dateKey, alerts: dateAlerts };
  });
}

const PULL_THRESHOLD = 80;

export function Feed() {
  const { data: sources = [] } = useQuery<string[]>({
    queryKey: ['event-sources'],
    queryFn: getEventSources,
    staleTime: 60_000,
  });
  const { data: scorecardSummary = null } = useQuery({
    queryKey: ['scorecard-summary'],
    queryFn: () => getScorecardSummary(),
    staleTime: 300_000,
  });

  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { items: watchlistItems, isLoading: isWatchlistLoading } = useWatchlist();
  const hasWatchlist = watchlistItems.length > 0;

  const [activeTab, setActiveTab] = useState<FeedTab>('all');
  const tabInitializedRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem(UNAUTH_BANNER_KEY) === '1'; } catch { return false; }
  });

  // Resolve default tab after auth + watchlist queries settle
  useEffect(() => {
    if (isAuthLoading || isWatchlistLoading) return;
    if (tabInitializedRef.current) return;
    tabInitializedRef.current = true;

    // Check for explicit tab override from query params (e.g. after onboarding)
    const tabParam = searchParams.get('tab');
    if (tabParam === 'watchlist' || tabParam === 'all') {
      setActiveTab(tabParam);
      if (isAuthenticated) saveFeedTab(tabParam);
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
      return;
    }

    // Only honor localStorage for authenticated users
    if (isAuthenticated) {
      const saved = loadFeedTab();
      if (saved) {
        setActiveTab(saved);
        return;
      }
      if (hasWatchlist) {
        setActiveTab('watchlist');
        return;
      }
    }
    // Unauthenticated or no watchlist → stay on 'all'
  }, [isAuthLoading, isWatchlistLoading, isAuthenticated, hasWatchlist, searchParams, setSearchParams]);

  const handleTabChange = (tab: FeedTab) => {
    setActiveTab(tab);
    setShowModeDropdown(false);
    if (isAuthenticated) {
      saveFeedTab(tab);
    }
  };

  const isWatchlistMode = activeTab === 'watchlist';

  // Parse filter state from URL
  const activeSeverities = useMemo(() => {
    const param = searchParams.get('severity');
    return param ? param.split(',') : [];
  }, [searchParams]);

  const activeSources = useMemo(() => {
    const param = searchParams.get('source');
    return param ? param.split(',') : [];
  }, [searchParams]);

  const [showFilters, setShowFilters] = useState(false);
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>(loadCustomPresets);
  const [presetName, setPresetName] = useState('');

  const allPresets = useMemo(() => [...BUILT_IN_PRESETS, ...customPresets], [customPresets]);

  const updateFilters = useCallback(
    (severities: string[], sources: string[]) => {
      const params = new URLSearchParams();
      if (severities.length > 0) params.set('severity', severities.join(','));
      if (sources.length > 0) params.set('source', sources.join(','));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const toggleSeverity = (s: string) => {
    const next = activeSeverities.includes(s)
      ? activeSeverities.filter((v) => v !== s)
      : [...activeSeverities, s];
    updateFilters(next, activeSources);
  };

  const toggleSource = (s: string) => {
    const next = activeSources.includes(s)
      ? activeSources.filter((v) => v !== s)
      : [...activeSources, s];
    updateFilters(activeSeverities, next);
  };

  const clearFilters = () => updateFilters([], []);

  const applyPreset = (preset: FilterPreset) => {
    updateFilters(preset.severities, preset.sources);
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const preset: FilterPreset = {
      name: presetName.trim(),
      severities: [...activeSeverities],
      sources: [...activeSources],
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetName('');
  };

  const deletePreset = (name: string) => {
    const updated = customPresets.filter((p) => p.name !== name);
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  const hasActiveFilters = activeSeverities.length > 0 || activeSources.length > 0;
  const activeFilterCount = activeSeverities.length + activeSources.length;

  const {
    alerts,
    error,
    isEmpty,
    isInitialLoading,
    isRefreshing,
    pendingCount,
    applyPendingAlerts,
    refetch,
  } = useAlerts(50, {
    watchlist: isWatchlistMode,
    watchlistTickers: isWatchlistMode ? watchlistItems.map((w) => w.ticker) : undefined,
  });

  // Apply client-side filters
  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (activeSeverities.length > 0) {
      result = result.filter((a) => activeSeverities.includes(a.severity));
    }
    if (activeSources.length > 0) {
      result = result.filter((a) => activeSources.includes(a.source));
    }
    return result;
  }, [alerts, activeSeverities, activeSources]);

  // Group alerts by date
  const dateGroups = useMemo(() => groupAlertsByDate(filteredAlerts), [filteredAlerts]);

  // Show onboarding CTA when watchlist mode with no watchlist items
  const showWatchlistOnboarding = isWatchlistMode && !hasWatchlist && !isWatchlistLoading;

  // Pull-to-refresh
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling) return;
    const dy = Math.max(0, e.touches[0].clientY - touchStartY.current);
    setPullDistance(Math.min(dy * 0.5, 120));
  }, [isPulling]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      void refetch();
    }
    setPullDistance(0);
    setIsPulling(false);
  }, [pullDistance, refetch]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem(UNAUTH_BANNER_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div
      ref={feedRef}
      className="space-y-3"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Unauth banner */}
      {!user && !bannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-accent-default/10 bg-accent-default/5 px-3 py-2">
          <span className="text-xs text-text-secondary">
            Viewing delayed public feed
          </span>
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

      {/* Filter bar */}
      <div className="flex items-center gap-2 py-1">
        {/* Feed mode toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className="flex items-center gap-1.5 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary"
          >
            {isWatchlistMode ? 'My Watchlist' : 'All Events'}
            <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
          </button>
          {showModeDropdown && (
            <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border border-border-default bg-bg-surface py-1 shadow-lg">
              <button
                type="button"
                onClick={() => handleTabChange('all')}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm',
                  !isWatchlistMode ? 'font-medium text-accent-default' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('watchlist')}
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

        <div className="flex-1" />

        {/* Filter button */}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-medium transition',
            hasActiveFilters
              ? 'border-accent-default/30 bg-accent-default/10 text-accent-default'
              : 'border-border-default bg-bg-surface text-text-secondary',
          )}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-default text-[10px] text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Active filters">
          {activeSeverities.map((s) => (
            <button
              key={`sev-${s}`}
              type="button"
              onClick={() => toggleSeverity(s)}
              className="inline-flex items-center gap-1 rounded-lg border border-accent-default/20 bg-accent-default/10 px-2 py-1 text-[11px] font-medium text-accent-default"
              role="listitem"
            >
              {s}
              <X className="h-3 w-3" />
            </button>
          ))}
          {activeSources.map((s) => (
            <button
              key={`src-${s}`}
              type="button"
              onClick={() => toggleSource(s)}
              className="inline-flex items-center gap-1 rounded-lg border border-accent-default/20 bg-accent-default/10 px-2 py-1 text-[11px] font-medium text-accent-default"
              role="listitem"
            >
              {s}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="px-1 text-[11px] text-text-tertiary hover:text-text-primary"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <section className="rounded-2xl border border-border-default bg-bg-surface p-4 space-y-4">
          {/* Presets */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Presets</h3>
            <div className="flex flex-wrap gap-2">
              {allPresets.map((preset) => (
                <div key={preset.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="inline-flex items-center rounded-xl border border-border-default bg-bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition hover:border-border-bright"
                  >
                    {preset.name}
                  </button>
                  {!BUILT_IN_PRESETS.some((b) => b.name === preset.name) && (
                    <button
                      type="button"
                      onClick={() => deletePreset(preset.name)}
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

          {/* Save current as preset */}
          {hasActiveFilters && (
            <div className="flex gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name..."
                className="flex-1 rounded-xl border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-default focus:outline-none"
              />
              <button
                type="button"
                onClick={savePreset}
                disabled={!presetName.trim()}
                className="inline-flex items-center rounded-xl bg-accent-default px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          {/* Severity multi-select */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Severity</h3>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeverity(s)}
                  className={cn(
                    'inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                    activeSeverities.includes(s)
                      ? 'border-accent-default bg-accent-default/20 text-accent-default'
                      : 'border-border-default bg-bg-surface text-text-primary hover:border-border-bright',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Source multi-select */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Source</h3>
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  className={cn(
                    'inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                    activeSources.includes(s)
                      ? 'border-accent-default bg-accent-default/20 text-accent-default'
                      : 'border-border-default bg-bg-surface text-text-primary hover:border-border-bright',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pull-to-refresh indicator */}
      <div
        className={cn(
          'flex items-center justify-center transition-opacity',
          pullDistance > 0 ? 'opacity-100' : 'opacity-0',
        )}
        style={{ height: pullDistance > 0 ? `${pullDistance * 0.3}px` : '0px' }}
      >
        <RefreshCw
          className={cn(
            'h-4 w-4 text-text-tertiary transition-transform',
            isRefreshing && 'animate-spin',
            pullDistance >= PULL_THRESHOLD && 'text-accent-default',
          )}
          style={{ transform: `rotate(${Math.min(pullDistance * 2, 360)}deg)` }}
        />
      </div>

      {/* New alerts pill */}
      {pendingCount > 0 ? <PillBanner count={pendingCount} onApply={applyPendingAlerts} /> : null}

      {/* Watchlist onboarding CTA */}
      {showWatchlistOnboarding ? (
        <section className="rounded-2xl border border-border-default bg-bg-surface p-6 text-center">
          <p className="text-3xl" aria-hidden="true">👀</p>
          <h2 className="mt-3 text-[15px] font-semibold text-text-primary">
            Your watchlist is empty
          </h2>
          <p className="mt-2 text-sm leading-5 text-text-secondary">
            Add tickers to your watchlist to see personalized alerts here.
          </p>
          <Link
            to="/onboarding"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-accent-default px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Set up your watchlist
          </Link>
        </section>
      ) : null}

      {/* Alert list with date sections */}
      {!showWatchlistOnboarding && (
        <section aria-live="polite">
          {isInitialLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} />)}
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
              title="No events match your filters"
              description="Try adjusting your filter criteria."
              ctaLabel="Clear filters"
              ctaHref="/"
            />
          ) : null}

          {!isInitialLoading && isEmpty ? (
            <EmptyState
              icon="📡"
              title={isWatchlistMode ? 'No watchlist events yet' : 'No market-moving events right now'}
              description={
                isWatchlistMode
                  ? 'No events detected for your watchlist tickers recently. They will appear here when something happens.'
                  : 'Event Radar monitors SEC filings, executive orders, breaking news, and more. High-impact events will appear here in real-time.'
              }
              ctaLabel="Refresh"
            />
          ) : null}

          {!isInitialLoading && !error && dateGroups.length > 0 && (
            <div className="space-y-1">
              {dateGroups.map((group) => (
                <div key={group.date}>
                  {/* Sticky date header */}
                  <div className="sticky top-0 z-10 -mx-4 px-4 py-2 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-border-default" />
                      <span className="text-[10px] text-text-tertiary">
                        {group.alerts.length} {group.alerts.length === 1 ? 'event' : 'events'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {group.alerts.map((alert) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        trustCue={getTrustCue(alert.sourceKey, scorecardSummary)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
