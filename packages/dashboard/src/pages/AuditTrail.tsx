import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useAudit } from '../hooks/queries.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { LoadingSpinner, ErrorDisplay } from '../components/LoadingSpinner.js';
import { cn, timeAgo } from '../lib/utils.js';
import type { AuditEvent, AuditQueryParams } from '../types/api.js';

const OUTCOMES = ['', 'delivered', 'filtered', 'deduped', 'grace_period', 'error'] as const;
const SOURCES = ['', 'breaking-news', 'stocktwits', 'whitehouse', 'sec-filings', 'reddit', 'twitter'] as const;

export function AuditTrail() {
  const [filters, setFilters] = useState<AuditQueryParams>({ limit: 50 });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, error } = useAudit(filters);

  const updateFilter = (key: keyof AuditQueryParams, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-radar-border bg-radar-surface px-4 py-3">
        <SelectFilter
          label="Outcome"
          value={filters.outcome ?? ''}
          options={OUTCOMES}
          onChange={(v) => updateFilter('outcome', v)}
        />
        <SelectFilter
          label="Source"
          value={filters.source ?? ''}
          options={SOURCES}
          onChange={(v) => updateFilter('source', v)}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-radar-text-muted" />
          <input
            type="text"
            placeholder="Search title..."
            className="h-8 rounded-md border border-radar-border bg-radar-bg pl-8 pr-3 text-xs text-radar-text placeholder:text-radar-text-muted focus:border-radar-green/50 focus:outline-none"
            value={filters.search ?? ''}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Ticker..."
            className="h-8 w-24 rounded-md border border-radar-border bg-radar-bg px-3 text-xs font-mono uppercase text-radar-text placeholder:text-radar-text-muted focus:border-radar-green/50 focus:outline-none"
            value={filters.ticker ?? ''}
            onChange={(e) => updateFilter('ticker', e.target.value)}
          />
        </div>
        {data && (
          <span className="ml-auto font-mono text-xs text-radar-text-muted">
            {data.count} event{data.count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Event Table */}
      {isLoading && !data ? (
        <LoadingSpinner />
      ) : error && !data ? (
        <ErrorDisplay message={error.message} />
      ) : !data ? null : (
        <div className="overflow-x-auto rounded-lg border border-radar-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-radar-border bg-radar-surface text-radar-text-muted">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Title</th>
                <th className="px-3 py-2.5 font-medium">Severity</th>
                <th className="px-3 py-2.5 font-medium">Ticker</th>
                <th className="px-3 py-2.5 font-medium">Outcome</th>
                <th className="px-3 py-2.5 font-medium">Stopped At</th>
                <th className="px-3 py-2.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                />
              ))}
              {data.events.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-radar-text-muted">
                    No events found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const severityColor: Record<string, string> = {
    critical: 'text-radar-red',
    high: 'text-radar-amber',
    medium: 'text-radar-blue',
    low: 'text-radar-text-muted',
  };

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-b border-radar-border transition-colors hover:bg-white/[0.02]',
          expanded && 'bg-white/[0.02]',
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 text-radar-text-muted">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-radar-text-muted">
          {timeAgo(event.at)}
        </td>
        <td className="px-3 py-2.5">
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono">{event.source}</span>
        </td>
        <td className="max-w-xs truncate px-3 py-2.5">{event.title}</td>
        <td className={cn('px-3 py-2.5 font-mono', severityColor[event.severity ?? ''] ?? 'text-radar-text-muted')}>
          {event.severity ?? '—'}
        </td>
        <td className="px-3 py-2.5 font-mono font-medium text-radar-amber">
          {event.ticker ?? '—'}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={event.outcome} />
        </td>
        <td className="px-3 py-2.5 font-mono text-radar-text-muted">{event.stopped_at}</td>
        <td className="max-w-[200px] truncate px-3 py-2.5 text-radar-text-muted">
          {event.reason ?? '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-radar-border bg-white/[0.01]">
          <td colSpan={9} className="px-6 py-4">
            <ExpandedDetails event={event} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetails({ event }: { event: AuditEvent }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs md:grid-cols-4">
      <DetailItem label="Event ID" value={event.event_id} mono />
      <DetailItem label="Category" value={event.reason_category ?? '—'} />
      <DetailItem label="Duration" value={event.duration_ms != null ? `${event.duration_ms}ms` : '—'} mono />
      <DetailItem label="Timestamp" value={new Date(event.at).toLocaleString()} />
      <DetailItem
        label="Delivery Channels"
        value={Array.isArray(event.delivery_channels) ? event.delivery_channels.join(', ') : '—'}
      />
      <DetailItem
        label="Historical Match"
        value={event.historical_match ? `Yes (${event.historical_confidence ?? '?'})` : 'No'}
        accent={event.historical_match ?? false}
      />
    </div>
  );
}

function DetailItem({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <span className="text-radar-text-muted">{label}: </span>
      <span className={cn(mono && 'font-mono', accent && 'text-radar-green')}>{value}</span>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-radar-text-muted">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-radar-border bg-radar-bg px-2 text-xs text-radar-text focus:border-radar-green/50 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt || 'All'}
          </option>
        ))}
      </select>
    </div>
  );
}
