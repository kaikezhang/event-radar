import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ShieldCheck } from 'lucide-react';
import { useJudgeRecent, useJudgeStats } from '../hooks/queries.js';
import { Card } from './Card.js';
import { ErrorDisplay, LoadingSpinner } from './LoadingSpinner.js';
import { cn, timeAgo } from '../lib/utils.js';

const DONUT_COLORS = {
  PASS: '#22c55e',
  BLOCK: '#ef4444',
} as const;

export function JudgeCard({ className }: { className?: string }) {
  const recentQuery = useJudgeRecent(5);
  const statsQuery = useJudgeStats({ since: '24h' });

  if ((recentQuery.isLoading || statsQuery.isLoading) && !recentQuery.data && !statsQuery.data) {
    return (
      <Card title="LLM Judge" className={className}>
        <LoadingSpinner />
      </Card>
    );
  }

  const error = recentQuery.error ?? statsQuery.error;
  if (error && !recentQuery.data && !statsQuery.data) {
    return (
      <Card title="LLM Judge" className={className}>
        <ErrorDisplay message={error.message} />
      </Card>
    );
  }

  const recentEvents = recentQuery.data?.events ?? [];
  const totals = statsQuery.data?.total ?? { passed: 0, blocked: 0 };
  const donutData = [
    { name: 'PASS', value: totals.passed },
    { name: 'BLOCK', value: totals.blocked },
  ].filter((entry) => entry.value > 0);
  const sourceRows = Object.entries(statsQuery.data?.bySource ?? {})
    .map(([source, stats]) => {
      const total = stats.passed + stats.blocked;
      return {
        source,
        passed: stats.passed,
        blocked: stats.blocked,
        total,
        passRate: total > 0 ? Number(((stats.passed / total) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-radar-blue" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-radar-text-muted">
              LLM Judge
            </h3>
          </div>
          <p className="mt-2 text-sm text-radar-text-muted">
            PASS/BLOCK decisions across the last 24 hours, plus the latest five judgments.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right">
          <SummaryStat label="Pass" value={String(totals.passed)} accent="text-radar-green" />
          <SummaryStat label="Block" value={String(totals.blocked)} accent="text-radar-red" />
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-lg border border-radar-border bg-radar-bg/70 p-4">
          {donutData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-center text-sm text-radar-text-muted">
              No recent judge decisions
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    stroke="#0f172a"
                    strokeWidth={4}
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={DONUT_COLORS[entry.name as keyof typeof DONUT_COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '10px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['PASS', 'BLOCK'] as const).map((decision) => (
              <div key={decision} className="rounded-md border border-radar-border bg-radar-surface/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-radar-text-muted">{decision}</div>
                <div
                  className={cn(
                    'mt-1 font-mono text-lg font-semibold',
                    decision === 'PASS' ? 'text-radar-green' : 'text-radar-red',
                  )}
                >
                  {decision === 'PASS' ? totals.passed : totals.blocked}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-radar-border bg-radar-bg/70 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-radar-text-muted">
              Source Pass Rate
            </div>
            {sourceRows.length === 0 ? (
              <div className="py-6 text-center text-sm text-radar-text-muted">
                No source-level judge stats yet
              </div>
            ) : (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sourceRows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 16 }}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis type="category" dataKey="source" width={92} tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, 'Pass Rate']}
                        contentStyle={{
                          background: '#111827',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="passRate" radius={[0, 6, 6, 0]} fill="#38bdf8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2">
                  {sourceRows.map((row) => (
                    <div key={row.source} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-radar-text-muted">{row.source}</span>
                      <span className="font-mono text-radar-text">
                        {row.passed}/{row.total} passed
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-radar-border bg-radar-bg/70 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-radar-text-muted">
              Recent Decisions
            </div>
            {recentEvents.length === 0 ? (
              <div className="py-6 text-center text-sm text-radar-text-muted">
                No recent judge decisions
              </div>
            ) : (
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-radar-border bg-radar-surface/60 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-radar-text">{event.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-radar-text-muted">
                          <span className="font-mono">{event.source}</span>
                          {event.ticker && <span className="font-mono text-radar-amber">{event.ticker}</span>}
                          {event.confidence != null && (
                            <span className="font-mono text-radar-text">{Math.round(event.confidence * 100)}%</span>
                          )}
                        </div>
                      </div>
                      <DecisionBadge decision={event.decision} />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-radar-text-muted">
                      {event.reason ?? 'No judge rationale recorded'}
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-radar-text-muted">
                      {timeAgo(event.at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-radar-border bg-radar-bg/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-radar-text-muted">{label}</div>
      <div className={cn('mt-1 font-mono text-lg font-semibold', accent)}>{value}</div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: 'PASS' | 'BLOCK' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold',
        decision === 'PASS'
          ? 'border-radar-green/30 bg-radar-green/10 text-radar-green'
          : 'border-radar-red/30 bg-radar-red/10 text-radar-red',
      )}
    >
      {decision}
    </span>
  );
}
