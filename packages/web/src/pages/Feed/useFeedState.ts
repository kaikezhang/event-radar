import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AlertSummary, FilterPreset, ScorecardSummary, WatchlistItem } from '../../types/index.js';
import { useAlerts } from '../../hooks/useAlerts.js';

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const PRESETS_KEY = 'event-radar-filter-presets';
const FEED_TAB_KEY = 'event-radar-feed-tab';
const UNAUTH_BANNER_KEY = 'event-radar-unauth-banner-dismissed';

export type FeedTab = 'watchlist' | 'all';
export type SortMode = 'latest' | 'severity';

export interface DateGroup {
  label: string;
  date: string;
  alerts: AlertSummary[];
}

export const BUILT_IN_PRESETS: FilterPreset[] = [
  { name: 'Full Firehose', severities: [], sources: [] },
  { name: 'High Conviction', severities: ['HIGH', 'CRITICAL'], sources: [] },
];

export const POPULAR_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN'];
export const PULL_THRESHOLD = 80;

export function loadCustomPresets(): FilterPreset[] {
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

export function loadFeedTab(): FeedTab | null {
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

export function getTrustCue(
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

export function groupAlertsByDate(alerts: AlertSummary[]): DateGroup[] {
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
      const date = new Date(dateAlerts[0].time);
      label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return { label, date: dateKey, alerts: dateAlerts };
  });
}

interface UseFeedStateOptions {
  addAsync: (ticker: string) => Promise<unknown>;
  hasWatchlist: boolean;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isDesktop: boolean;
  isOnWatchlist: (ticker: string) => boolean;
  isWatchlistLoading: boolean;
  watchlistItems: WatchlistItem[];
}

export function useFeedState({
  addAsync,
  hasWatchlist,
  isAuthenticated,
  isAuthLoading,
  isDesktop,
  isOnWatchlist,
  isWatchlistLoading,
  watchlistItems,
}: UseFeedStateOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<FeedTab>('watchlist');
  const tabInitializedRef = useRef(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showAddFilterDropdown, setShowAddFilterDropdown] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem(UNAUTH_BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>(loadCustomPresets);
  const [presetName, setPresetName] = useState('');
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const touchStartY = useRef(0);
  const prevAlertIdsRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const addFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthLoading || isWatchlistLoading) {
      return;
    }
    if (tabInitializedRef.current) {
      return;
    }

    tabInitializedRef.current = true;

    const tabParam = searchParams.get('tab');
    if (tabParam === 'watchlist' || tabParam === 'all') {
      setActiveTab(tabParam);
      if (isAuthenticated) {
        saveFeedTab(tabParam);
      }
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('tab');
      setSearchParams(nextSearchParams, { replace: true });
      return;
    }

    if (isAuthenticated) {
      const saved = loadFeedTab();
      if (saved) {
        setActiveTab(saved);
        return;
      }
      if (hasWatchlist) {
        setActiveTab('watchlist');
      }
    }
  }, [
    hasWatchlist,
    isAuthenticated,
    isAuthLoading,
    isWatchlistLoading,
    searchParams,
    setSearchParams,
  ]);

  const activeSeverities = useMemo(() => {
    const param = searchParams.get('severity');
    if (param !== null) {
      return param.length > 0 ? param.split(',') : [];
    }
    return ['HIGH', 'CRITICAL'];
  }, [searchParams]);

  const activeSources = useMemo(() => {
    const param = searchParams.get('source');
    return param ? param.split(',') : [];
  }, [searchParams]);
  const pushOnly = searchParams.get('push') === 'only';

  const allPresets = useMemo(() => [...BUILT_IN_PRESETS, ...customPresets], [customPresets]);
  const isWatchlistMode = activeTab === 'watchlist';
  const isDefaultSeverity = !searchParams.has('severity');
  const hasActiveFilters = ((!isDefaultSeverity && activeSeverities.length > 0) || activeSources.length > 0) || pushOnly;
  const activeFilterCount = (isDefaultSeverity ? 0 : activeSeverities.length) + activeSources.length + (pushOnly ? 1 : 0);

  const {
    alerts,
    error,
    isEmpty,
    isInitialLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    pendingCount,
    applyPendingAlerts,
    refetch,
    loadMore,
  } = useAlerts(10, {
    watchlist: isWatchlistMode,
    watchlistTickers: isWatchlistMode ? watchlistItems.map((item) => item.ticker) : undefined,
  });

  const updateFilters = useCallback(
    (severities: string[], sources: string[], nextPushOnly: boolean) => {
      const params = new URLSearchParams();
      if (severities.length > 0) {
        params.set('severity', severities.join(','));
      }
      if (sources.length > 0) {
        params.set('source', sources.join(','));
      }
      if (nextPushOnly) {
        params.set('push', 'only');
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const toggleSeverity = useCallback((severity: string) => {
    const next = activeSeverities.includes(severity)
      ? activeSeverities.filter((value) => value !== severity)
      : [...activeSeverities, severity];
    updateFilters(next, activeSources, pushOnly);
  }, [activeSeverities, activeSources, pushOnly, updateFilters]);

  const toggleSource = useCallback((source: string) => {
    const next = activeSources.includes(source)
      ? activeSources.filter((value) => value !== source)
      : [...activeSources, source];
    updateFilters(activeSeverities, next, pushOnly);
  }, [activeSeverities, activeSources, pushOnly, updateFilters]);

  const togglePushOnly = useCallback(() => {
    updateFilters(activeSeverities, activeSources, !pushOnly);
  }, [activeSeverities, activeSources, pushOnly, updateFilters]);

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('severity', '');
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const applyPreset = useCallback((preset: FilterPreset) => {
    updateFilters(preset.severities, preset.sources, pushOnly);
  }, [pushOnly, updateFilters]);

  const savePreset = useCallback(() => {
    if (!presetName.trim()) {
      return;
    }

    const preset: FilterPreset = {
      name: presetName.trim(),
      severities: [...activeSeverities],
      sources: [...activeSources],
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetName('');
  }, [activeSeverities, activeSources, customPresets, presetName]);

  const deletePreset = useCallback((name: string) => {
    const updated = customPresets.filter((preset) => preset.name !== name);
    setCustomPresets(updated);
    saveCustomPresets(updated);
  }, [customPresets]);

  const handleDismiss = useCallback((alertId: string) => {
    setDismissedIds((current) => new Set(current).add(alertId));
  }, []);

  const handleQuickWatchlist = useCallback(async (alert: AlertSummary) => {
    const ticker = alert.tickers[0];
    if (!ticker) {
      return;
    }
    if (isOnWatchlist(ticker)) {
      setToastMessage(`${ticker} already on watchlist`);
      setToastVisible(true);
      return;
    }

    try {
      await addAsync(ticker);
      setToastMessage(`Added ${ticker} to watchlist \u2713`);
      setToastVisible(true);
    } catch {
      setToastMessage(`Failed to add ${ticker}`);
      setToastVisible(true);
    }
  }, [addAsync, isOnWatchlist]);

  useEffect(() => {
    if (alerts.length === 0) {
      return;
    }

    const currentIds = new Set(alerts.map((alert) => alert.id));
    const nextNewAlertIds = new Set<string>();
    for (const id of currentIds) {
      if (!prevAlertIdsRef.current.has(id)) {
        nextNewAlertIds.add(id);
      }
    }

    if (nextNewAlertIds.size > 0 && prevAlertIdsRef.current.size > 0) {
      setNewAlertIds(nextNewAlertIds);
      prevAlertIdsRef.current = currentIds;
      const timer = setTimeout(() => setNewAlertIds(new Set()), 1600);
      return () => clearTimeout(timer);
    }

    prevAlertIdsRef.current = currentIds;
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (dismissedIds.size > 0) {
      result = result.filter((alert) => !dismissedIds.has(alert.id));
    }
    if (activeSeverities.length > 0) {
      result = result.filter((alert) => activeSeverities.includes(alert.severity));
    }
    if (activeSources.length > 0) {
      result = result.filter((alert) => activeSources.includes(alert.source));
    }
    if (pushOnly) {
      result = result.filter((alert) => alert.pushed);
    }
    if (sortMode === 'severity') {
      result = [...result].sort((a, b) => {
        const severityDiff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
        if (severityDiff !== 0) {
          return severityDiff;
        }
        return new Date(b.time).getTime() - new Date(a.time).getTime();
      });
    }
    return result;
  }, [activeSeverities, activeSources, alerts, dismissedIds, pushOnly, sortMode]);

  useEffect(() => {
    if (selectedEventId && filteredAlerts.length > 0 && !filteredAlerts.some((alert) => alert.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [filteredAlerts, selectedEventId]);

  const dateGroups = useMemo(() => groupAlertsByDate(filteredAlerts), [filteredAlerts]);
  const showWatchlistOnboarding = isWatchlistMode && !hasWatchlist && !isWatchlistLoading;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          void loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY <= 0) {
      touchStartY.current = event.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isPulling) {
      return;
    }
    const dy = Math.max(0, event.touches[0].clientY - touchStartY.current);
    setPullDistance(Math.min(dy * 0.5, 120));
  }, [isPulling]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      void refetch();
    }
    setPullDistance(0);
    setIsPulling(false);
  }, [pullDistance, refetch]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(UNAUTH_BANNER_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const handleTabChange = useCallback((tab: FeedTab) => {
    setActiveTab(tab);
    setShowModeDropdown(false);
    if (isAuthenticated) {
      saveFeedTab(tab);
    }
  }, [isAuthenticated]);

  const handleCardClick = useCallback((event: React.MouseEvent, alertId: string) => {
    if (!isDesktop) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('a, button, [role="button"]')) {
      return;
    }

    event.preventDefault();
    setSelectedEventId(alertId);
  }, [isDesktop]);

  useEffect(() => {
    if (!showAddFilterDropdown) {
      return;
    }

    const handler = (event: MouseEvent) => {
      if (addFilterRef.current && !addFilterRef.current.contains(event.target as Node)) {
        setShowAddFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddFilterDropdown]);

  // Desktop keyboard navigation: j/k to move, Enter to select, Escape to deselect
  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const ids = filteredAlerts.map((alert) => alert.id);
        if (ids.length === 0) {
          return;
        }

        const currentIndex = selectedEventId ? ids.indexOf(selectedEventId) : -1;
        let nextIndex: number;
        if (event.key === 'j') {
          nextIndex = currentIndex < ids.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }

        setSelectedEventId(ids[nextIndex]);

        // Scroll the selected card into view
        const card = document.querySelector(`[data-alert-id="${ids[nextIndex]}"]`);
        card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      if (event.key === 'Enter' && selectedEventId) {
        event.preventDefault();
        // Already selected — the right panel shows it automatically
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedEventId(null);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filteredAlerts, isDesktop, selectedEventId, setSelectedEventId]);

  return {
    activeFilterCount,
    activeSeverities,
    activeSources,
    activeTab,
    addFilterRef,
    allPresets,
    bannerDismissed,
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
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    hasActiveFilters,
    isEmpty,
    isInitialLoading,
    isLoadingMore,
    isRefreshing,
    isWatchlistMode,
    newAlertIds,
    pendingCount,
    presetName,
    pushOnly,
    pullDistance,
    savePreset,
    selectedEventId,
    sentinelRef,
    setPresetName,
    setSelectedEventId,
    setShowAddFilterDropdown,
    setShowFilters,
    setShowModeDropdown,
    setSortMode,
    setToastVisible,
    showAddFilterDropdown,
    showFilters,
    showModeDropdown,
    showWatchlistOnboarding,
    sortMode,
    toastMessage,
    toastVisible,
    toggleSeverity,
    toggleSource,
    togglePushOnly,
    applyPreset,
    applyPendingAlerts,
  };
}
