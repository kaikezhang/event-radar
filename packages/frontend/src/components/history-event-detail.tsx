"use client";

import { useEffect } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Radar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEventDetail } from "@/hooks/use-event-detail";
import { cn } from "@/lib/utils";

interface HistoryEventDetailProps {
  apiUrl: string;
  apiKey: string;
  eventId: string | null;
}

function buildDirection(direction: unknown) {
  const normalized = typeof direction === "string" ? direction.toLowerCase() : "";

  if (["bullish", "up", "positive"].includes(normalized)) {
    return {
      label: "Bullish",
      className: "text-emerald-300",
      icon: <ArrowUpRight className="h-4 w-4" />,
    };
  }

  if (["bearish", "down", "negative"].includes(normalized)) {
    return {
      label: "Bearish",
      className: "text-red-300",
      icon: <ArrowDownRight className="h-4 w-4" />,
    };
  }

  return {
    label: "Neutral",
    className: "text-slate-300",
    icon: <Minus className="h-4 w-4" />,
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function HistoryEventDetail({ apiUrl, apiKey, eventId }: HistoryEventDetailProps) {
  const { event, isLoading, error, fetchEvent, clearEvent } = useEventDetail({ apiUrl, apiKey });

  useEffect(() => {
    if (!eventId) {
      clearEvent();
      return;
    }

    void fetchEvent(eventId);
  }, [clearEvent, eventId, fetchEvent]);

  const metadata = event?.metadata ?? null;
  const direction = buildDirection(metadata?.direction);
  const ticker = typeof metadata?.ticker === "string" ? metadata.ticker : null;
  const eventType = typeof event?.rawPayload?.type === "string" ? event.rawPayload.type : null;

  return (
    <Card className="border border-white/10 bg-card/90 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.85)] backdrop-blur">
      <CardHeader className="border-b border-white/8">
        <CardTitle className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-cyan-300" />
          Event Detail
        </CardTitle>
        <CardDescription>
          Synced detail pane for the currently selected event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {!eventId ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
            Select an event marker or history row to inspect the full payload here.
          </div>
        ) : null}

        {eventId && isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-xl bg-muted/50"
              />
            ))}
          </div>
        ) : null}

        {eventId && error ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {event ? (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {event.severity ? <Badge variant="outline">{event.severity}</Badge> : null}
                {ticker ? <Badge variant="outline">{ticker}</Badge> : null}
                {eventType ? <Badge variant="outline">{eventType}</Badge> : null}
                <span className={cn("inline-flex items-center gap-1 text-sm", direction.className)}>
                  {direction.icon}
                  {direction.label}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight">{event.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {event.summary ?? "No additional summary available for this event."}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Source</p>
                <p className="mt-2 text-sm font-medium">{event.source}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Timestamp</p>
                <p className="mt-2 text-sm font-medium">{formatTimestamp(event.receivedAt)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-slate-950/65 p-4">
              <p className="mb-3 text-xs uppercase tracking-[0.24em] text-slate-400">Metadata</p>
              <pre className="overflow-auto text-xs text-slate-200">
                {JSON.stringify(event.metadata ?? event.rawPayload ?? {}, null, 2)}
              </pre>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
