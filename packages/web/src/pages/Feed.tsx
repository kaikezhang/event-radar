import { useState, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../components/EmptyState.js';
import { AlertCard } from '../components/AlertCard.js';
import { PillBanner } from '../components/PillBanner.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { useAlerts } from '../hooks/useAlerts.js';
import { getEventSources, getScorecardSummary } from '../lib/api.js';
import type { FilterPreset, ScorecardSummary } from '../types/index.js';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const PRESETS_KEY = 'event-radar-filter-presets';

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

  const [searchParams, setSearchParams] = useSearchParams();

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

  const {
    alerts,
    connectionStatus,
    error,
    isEmpty,
    isInitialLoading,
    isRefreshing,
    pendingCount,
    applyPendingAlerts,
    refetch,
  } = useAlerts(50);
  const connectionMeta = {
    connected: {
      icon: '🟢',
      label: 'Connected',
    },
    reconnecting: {
      icon: '🟡',
      label: 'Reconnecting',
    },
    disconnected: {
      icon: '🔴',
      label: 'Disconnected',
    },
  }[connectionStatus];

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7 text-text-primary">
              ⚡ Event Radar
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              AI-powered market intelligence
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-text-secondary">
              <span aria-hidden="true">{connectionMeta.icon}</span>
              <span>{connectionMeta.label}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                hasActiveFilters
                  ? 'border-accent-default bg-accent-default/12 text-accent-default'
                  : 'border-white/10 bg-white/6 text-text-secondary hover:bg-white/8'
              }`}
              aria-label="Toggle filters"
            >
              Filters{hasActiveFilters ? ` (${activeSeverities.length + activeSources.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => { void refetch(); }}
              className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 px-1" role="list" aria-label="Active filters">
          {activeSeverities.map((s) => (
            <button
              key={`sev-${s}`}
              type="button"
              onClick={() => toggleSeverity(s)}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent-default/30 bg-accent-default/12 px-3 py-1 text-xs font-medium text-accent-default"
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
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent-default/30 bg-accent-default/12 px-3 py-1 text-xs font-medium text-accent-default"
              role="listitem"
            >
              {s}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5 space-y-4">
          {/* Presets */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Presets</h3>
            <div className="flex flex-wrap gap-2">
              {allPresets.map((preset) => (
                <div key={preset.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-white/8"
                  >
                    {preset.name}
                  </button>
                  {!BUILT_IN_PRESETS.some((b) => b.name === preset.name) && (
                    <button
                      type="button"
                      onClick={() => deletePreset(preset.name)}
                      className="rounded-full p-1 text-text-secondary hover:text-red-400"
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
                className="min-h-9 flex-1 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-default focus:outline-none"
              />
              <button
                type="button"
                onClick={savePreset}
                disabled={!presetName.trim()}
                className="inline-flex min-h-9 items-center rounded-full bg-accent-default px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          {/* Severity multi-select */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Severity</h3>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeverity(s)}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    activeSeverities.includes(s)
                      ? 'border-accent-default bg-accent-default/20 text-accent-default'
                      : 'border-white/10 bg-white/6 text-text-primary hover:bg-white/8'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Source multi-select */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Source</h3>
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    activeSources.includes(s)
                      ? 'border-accent-default bg-accent-default/20 text-accent-default'
                      : 'border-white/10 bg-white/6 text-text-primary hover:bg-white/8'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* New alerts pill */}
      {pendingCount > 0 ? <PillBanner count={pendingCount} onApply={applyPendingAlerts} /> : null}

      {/* Alert list */}
      <section className="space-y-3" aria-live="polite">
        {isInitialLoading ? (
          Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} />)
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
            title="No market-moving events right now"
            description="Event Radar monitors SEC filings, executive orders, breaking news, and more. High-impact events will appear here in real-time."
            ctaLabel="Refresh"
          />
        ) : null}

        {!isInitialLoading && !error
          ? filteredAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                trustCue={getTrustCue(alert.sourceKey, scorecardSummary)}
              />
            ))
          : null}
      </section>
    </div>
  );
}
