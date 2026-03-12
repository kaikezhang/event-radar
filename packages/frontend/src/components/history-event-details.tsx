"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Waves, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HistoryEvent } from "@/components/event-history-browser";

export interface ImpactEventRecord {
  eventId: string;
  timestamp: string;
  ticker: string;
  headline: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  direction: string;
  priceAtEvent: number | null;
  priceChange1h: number;
  priceChange1d: number;
  priceChange1w: number;
}

interface HistoryEventDetailsProps {
  event: HistoryEvent | null;
  impact: ImpactEventRecord | null;
  activeWindowCount: number;
  headerAction?: React.ReactNode;
}

const severityTone = {
  CRITICAL: "border-red-400/35 bg-red-500/12 text-red-100",
  HIGH: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  MEDIUM: "border-amber-400/35 bg-amber-500/12 text-amber-100",
  LOW: "border-emerald-400/35 bg-emerald-500/12 text-emerald-100",
} as const;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSignedPercent(value: number): string {
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

function DeltaChip({ label, value }: { label: string; value: number }) {
  const positive = value > 0;
  const negative = value < 0;

  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        positive && "border-emerald-400/30 bg-emerald-500/10",
        negative && "border-red-400/30 bg-red-500/10",
        !positive && !negative && "border-slate-300/12 bg-slate-400/10",
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-sm font-medium text-white">
        {positive ? (
          <ArrowUpRight className="h-4 w-4 text-emerald-300" />
        ) : negative ? (
          <ArrowDownRight className="h-4 w-4 text-red-300" />
        ) : (
          <Minus className="h-4 w-4 text-slate-300" />
        )}
        <span>{formatSignedPercent(value)}</span>
      </div>
    </div>
  );
}

export function HistoryEventDetails({
  event,
  impact,
  activeWindowCount,
  headerAction,
}: HistoryEventDetailsProps) {
  const headline = impact?.headline ?? event?.headline ?? "Select an event";
  const severity = impact?.severity ?? event?.severity ?? null;
  const ticker = impact?.ticker ?? event?.ticker ?? "-";
  const direction = impact?.direction ?? event?.direction ?? "neutral";
  const summary = event?.summary ?? "Choose a marker on the impact chart or a row in the history browser to inspect it here.";
  const timestamp = impact?.timestamp ?? event?.timestamp ?? null;

  return (
    <Card className="h-full border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.97))] text-white shadow-[0_24px_90px_-48px_rgba(15,23,42,0.95)]">
      <CardHeader className="border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Waves className="h-4 w-4 text-cyan-300" />
              Event Details
            </CardTitle>
            <CardDescription className="text-slate-300">
              Synced across {activeWindowCount} active window{activeWindowCount === 1 ? "" : "s"}.
            </CardDescription>
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-cyan-300/35 bg-cyan-400/10 text-cyan-50">
              {ticker}
            </Badge>
            {severity ? (
              <Badge variant="outline" className={cn("border", severityTone[severity])}>
                {severity}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-white/12 bg-white/5 text-slate-200">
              {String(direction).toUpperCase()}
            </Badge>
            {timestamp ? (
              <Badge variant="outline" className="border-white/12 bg-white/5 text-slate-300">
                {formatTimestamp(timestamp)}
              </Badge>
            ) : null}
          </div>

          <div>
            <p className="text-lg font-semibold leading-tight text-white">{headline}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{summary}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {impact ? (
            <>
              <DeltaChip label="T+1H" value={impact.priceChange1h} />
              <DeltaChip label="T+1D" value={impact.priceChange1d} />
              <DeltaChip label="T+1W" value={impact.priceChange1w} />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/4 px-4 py-5 text-sm text-slate-300 sm:col-span-3">
              Price impact metrics appear here once the selected event has tracked outcomes.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <Zap className="h-4 w-4 text-amber-300" />
            Event price snapshot
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {impact?.priceAtEvent != null ? `$${impact.priceAtEvent.toFixed(2)}` : "Unavailable"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {impact
              ? "Captured from the tracked event outcome row."
              : "This event does not have a linked backtest outcome yet."}
          </p>
        </div>

        {event?.metadata ? (
          <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
