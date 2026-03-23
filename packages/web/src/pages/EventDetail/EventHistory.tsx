import { formatRelativeTime } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';
import type { EventDetailData } from '../../types/index.js';
import { formatSignedPercent } from './utils.js';

export function EventHistory({
  historicalPattern,
  visibleSimilarEvents,
  showAllSimilar,
  onToggleShowAll,
}: {
  historicalPattern: EventDetailData['historicalPattern'];
  visibleSimilarEvents: EventDetailData['historicalPattern']['similarEvents'];
  showAllSimilar: boolean;
  onToggleShowAll: () => void;
}) {
  if (historicalPattern.matchCount <= 0) return null;

  const similarEvents = historicalPattern.similarEvents;

  return (
    <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
          Pattern match
        </p>
        <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">
          Historical Similar Events
        </h2>
        {historicalPattern.patternSummary && (
          <p className="mt-1 text-sm leading-6 text-text-secondary">{historicalPattern.patternSummary}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
        {historicalPattern.avgMoveT20 != null && (
          <StatCard label="Avg 20-day Move" value={formatSignedPercent(historicalPattern.avgMoveT20)} />
        )}
        {historicalPattern.winRate != null && (
          <StatCard label="Win Rate" value={`${historicalPattern.winRate}%`} />
        )}
        {historicalPattern.avgMoveT5 != null && (
          <StatCard label="Avg 5-day Move" value={formatSignedPercent(historicalPattern.avgMoveT5)} />
        )}
        <StatCard label="Similar events" value={String(historicalPattern.matchCount)} />
      </div>

      <ConfidenceBar matchCount={historicalPattern.matchCount} />

      {(historicalPattern.bestCase || historicalPattern.worstCase) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {historicalPattern.bestCase && (
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Best</p>
              <p className="mt-2 text-sm font-semibold text-emerald-300">
                {historicalPattern.bestCase.ticker} {formatSignedPercent(historicalPattern.bestCase.move)}
              </p>
            </div>
          )}
          {historicalPattern.worstCase && (
            <div className="rounded-2xl border border-red-400/15 bg-red-400/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Worst</p>
              <p className="mt-2 text-sm font-semibold text-severity-critical">
                {historicalPattern.worstCase.ticker} {formatSignedPercent(historicalPattern.worstCase.move)}
              </p>
            </div>
          )}
        </div>
      )}

      {similarEvents.length > 0 && (
        <div className="mt-4 space-y-3">
          {visibleSimilarEvents.map((event, index) => (
            <div key={index} className="flex items-center justify-between rounded-2xl border border-overlay-medium bg-bg-elevated/70 p-4">
              <div>
                <p className="text-sm font-medium text-text-primary">{event.title}</p>
                <p className="mt-1 font-mono text-xs text-text-secondary">
                  {event.date ? formatRelativeTime(event.date) : ''}
                  {event.move ? ` · ${event.move}` : ''}
                </p>
              </div>
            </div>
          ))}
          {similarEvents.length > 3 && (
            <button
              type="button"
              onClick={onToggleShowAll}
              className="mt-2 inline-flex min-h-11 items-center rounded-full border border-overlay-medium px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-overlay-medium focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              {showAllSimilar ? 'Show fewer' : `Show all ${similarEvents.length} →`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ConfidenceBar({ matchCount }: { matchCount: number }) {
  const { label, level, fill } = getConfidenceLevel(matchCount);
  const barColor =
    level === 'high' ? 'bg-emerald-500' :
    level === 'moderate' ? 'bg-yellow-500' :
    'bg-zinc-500';

  return (
    <div className="mt-4 flex items-center gap-3">
      <span className="text-xs font-medium text-text-secondary">Confidence:</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay-medium">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${fill}%` }} />
      </div>
      <span
        className={cn(
          'text-xs font-medium',
          level === 'high' ? 'text-emerald-400' :
          level === 'moderate' ? 'text-yellow-400' :
          'text-zinc-400',
        )}
      >
        {label} (n={matchCount})
      </span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_var(--shadow-color)]">
      <div className="font-mono text-2xl font-semibold text-text-primary">{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
    </div>
  );
}

function getConfidenceLevel(matchCount: number): {
  label: string;
  level: 'insufficient' | 'moderate' | 'high';
  fill: number;
} {
  if (matchCount < 10) return { label: 'Insufficient', level: 'insufficient', fill: 15 };
  if (matchCount < 30) return { label: 'Moderate', level: 'moderate', fill: 50 };
  return { label: 'High', level: 'high', fill: 85 };
}
