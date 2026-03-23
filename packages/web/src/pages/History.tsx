import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronDown, Filter, Loader2, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { AlertCard } from '../components/AlertCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { useHistory } from '../hooks/useHistory.js';
import { cn } from '../lib/utils.js';
import { formatNumber } from '../lib/format.js';

const severityColor: Record<string, string> = {
  CRITICAL: 'bg-severity-critical',
  HIGH: 'bg-severity-high',
  MEDIUM: 'bg-severity-medium',
  LOW: 'bg-severity-low',
};

export function History() {
  const navigate = useNavigate();
  const {
    filters,
    setFilter,
    resetFilters,
    clearFilters,
    isDefaultSeverity,
    alerts,
    total,
    isLoading,
    isFetching,
    hasMore,
    loadMore,
    sources,
    severities,
    stats,
  } = useHistory();

  // Compute default date range (same logic as useHistory) to detect user changes
  const defaultFromDate = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
  const defaultToDate = new Date().toISOString().slice(0, 10);
  const hasDateFilter = filters.from !== defaultFromDate || filters.to !== defaultToDate;

  const hasNonDefaultSeverity = filters.severity && !isDefaultSeverity;
  const hasActiveFilters = !!(hasNonDefaultSeverity || filters.source || filters.ticker || hasDateFilter);
  const activeFilterCount = (hasNonDefaultSeverity ? 1 : 0) + (filters.source ? 1 : 0) + (filters.ticker ? 1 : 0) + (hasDateFilter ? 1 : 0);
  const [showFilters, setShowFilters] = useState(false);

  const handleCardClick = useCallback(
    (alertId: string) => {
      navigate(`/event/${alertId}`);
    },
    [navigate],
  );

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">History</h1>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="history-filters-panel"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
              hasActiveFilters
                ? 'border-interactive-default/30 bg-interactive-default/10 text-interactive-default'
                : 'border-border-default bg-bg-surface text-text-secondary',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-interactive-default text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active filter chips (always visible when collapsed) */}
      {!showFilters && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {hasDateFilter && (
            <button
              type="button"
              onClick={() => { setFilter('from', defaultFromDate); setFilter('to', defaultToDate); }}
              className="inline-flex items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
            >
              {filters.from} → {filters.to}
              <X className="h-3 w-3" />
            </button>
          )}
          {filters.severity && !isDefaultSeverity && (
            <button
              type="button"
              onClick={() => setFilter('severity', '')}
              className="inline-flex items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
            >
              {filters.severity.includes(',') ? 'HIGH & CRITICAL' : filters.severity}
              <X className="h-3 w-3" />
            </button>
          )}
          {filters.source && (
            <button
              type="button"
              onClick={() => setFilter('source', '')}
              className="inline-flex items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
            >
              {filters.source}
              <X className="h-3 w-3" />
            </button>
          )}
          {filters.ticker && (
            <button
              type="button"
              onClick={() => setFilter('ticker', '')}
              className="inline-flex items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
            >
              {filters.ticker}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Expanded filter panel */}
      {showFilters && (
        <div id="history-filters-panel" role="region" aria-label="Event filters">
          {/* Date range */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Calendar className="h-3.5 w-3.5" />
              <span>From</span>
            </div>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)}
              className="rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-xs text-text-primary focus:border-interactive-default focus:outline-none"
            />
            <span className="text-xs text-text-tertiary">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)}
              className="rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-xs text-text-primary focus:border-interactive-default focus:outline-none"
            />
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-text-tertiary" />

            {/* Severity dropdown */}
            <div className="relative">
              <select
                value={filters.severity}
                onChange={(e) => setFilter('severity', e.target.value)}
                className="appearance-none rounded-lg border border-border-default bg-bg-surface py-1.5 pl-2.5 pr-7 text-xs text-text-primary focus:border-interactive-default focus:outline-none"
              >
                <option value="">All severities</option>
                <option value="HIGH,CRITICAL">HIGH & CRITICAL</option>
                {severities.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
            </div>

            {/* Source dropdown */}
            <div className="relative">
              <select
                value={filters.source}
                onChange={(e) => setFilter('source', e.target.value)}
                className="appearance-none rounded-lg border border-border-default bg-bg-surface py-1.5 pl-2.5 pr-7 text-xs text-text-primary focus:border-interactive-default focus:outline-none"
              >
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
            </div>

            {/* Ticker search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={filters.ticker}
                onChange={(e) => setFilter('ticker', e.target.value)}
                placeholder="Ticker..."
                className="w-24 rounded-lg border border-border-default bg-bg-surface py-1.5 pl-7 pr-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-interactive-default focus:outline-none"
              />
              {filters.ticker && (
                <button
                  type="button"
                  onClick={() => setFilter('ticker', '')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Active filter pills */}
            {filters.severity && !isDefaultSeverity && (
              <button
                type="button"
                onClick={() => setFilter('severity', '')}
                className="inline-flex items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
              >
                {filters.severity.includes(',') ? 'HIGH & CRITICAL' : filters.severity}
                <X className="h-3 w-3" />
              </button>
            )}
            {filters.source && (
              <button
                type="button"
                onClick={() => setFilter('source', '')}
                className="inline-flex items-center gap-1 rounded-lg border border-interactive-default/20 bg-interactive-default/10 px-2 py-1 text-xs font-medium text-interactive-default"
              >
                {filters.source}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Default severity note */}
      {isDefaultSeverity && (
        <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-xs text-text-secondary">
          <span>Showing important events only</span>
          <button
            type="button"
            onClick={() => clearFilters()}
            className="font-medium text-interactive-default hover:underline"
          >
            Show all &rarr;
          </button>
        </div>
      )}

      {/* Summary stats */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {/* Total */}
          <div className="rounded-xl border border-border-default bg-bg-surface p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Total</div>
            <div className="mt-1 text-lg font-bold text-text-primary">{formatNumber(total)}</div>
          </div>

          {/* Severity breakdown */}
          <div className="rounded-xl border border-border-default bg-bg-surface p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">By Severity</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {severities.map((s) => {
                const count = stats.bySeverity[s];
                if (!count) return null;
                return (
                  <span key={s} className="inline-flex items-center gap-1 text-xs text-text-secondary">
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', severityColor[s])} />
                    {count}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Top tickers */}
          <div className="col-span-2 rounded-xl border border-border-default bg-bg-surface p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Top Tickers</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {stats.topTickers.map(({ ticker, count }) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => setFilter('ticker', ticker)}
                  className="inline-flex items-center gap-1 rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs font-semibold text-text-primary transition hover:bg-bg-elevated/80"
                >
                  {ticker}
                  <span className="text-text-tertiary">{count}</span>
                </button>
              ))}
              {stats.topTickers.length === 0 && (
                <span className="text-xs text-text-tertiary">—</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-interactive-default" />
          <p className="mt-3 text-sm font-medium text-text-secondary animate-pulse">
            Loading event archive\u2026
          </p>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon="📜"
          title="No events found"
          description="Try adjusting your date range or filters to find historical events."
          ctaLabel="Reset filters"
          onCtaClick={resetFilters}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="cursor-pointer rounded-2xl transition-all hover:ring-1 hover:ring-interactive-default/30"
              onClick={() => handleCardClick(alert.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCardClick(alert.id);
              }}
            >
              <AlertCard alert={alert} />
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:border-interactive-default disabled:opacity-50"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>Load more</>
                )}
              </button>
            </div>
          )}

          {/* Fetching indicator when paginating */}
          {isFetching && !isLoading && alerts.length > 0 && !hasMore && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
