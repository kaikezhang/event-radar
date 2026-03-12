"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Minus,
  Radar,
} from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePriceData } from "@/hooks/use-price-data";
import { cn } from "@/lib/utils";

export interface EventImpactPoint {
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

interface EventImpactChartProps {
  apiUrl: string;
  apiKey: string;
  ticker: string;
  dateFrom: string;
  dateTo: string;
  severity?: Array<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">;
  selectedEventId?: string | null;
  onTickerChange?: (ticker: string) => void;
  onEventSelect?: (event: EventImpactPoint) => void;
  onDataLoaded?: (events: EventImpactPoint[]) => void;
  headerAction?: ReactNode;
}

function normalizeTicker(value: string): string {
  const trimmed = value.trim().toUpperCase();
  return trimmed || "AAPL";
}

function toApiDate(value: string, boundary: "start" | "end"): string | null {
  if (!value) {
    return null;
  }

  return boundary === "start"
    ? new Date(`${value}T00:00:00.000Z`).toISOString()
    : new Date(`${value}T23:59:59.999Z`).toISOString();
}

function toChartDate(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function severitySize(severity: EventImpactPoint["severity"]): number {
  switch (severity) {
    case "CRITICAL":
      return 2.1;
    case "HIGH":
      return 1.7;
    case "MEDIUM":
      return 1.35;
    default:
      return 1.05;
  }
}

function directionColor(direction: string): string {
  const normalized = direction.toLowerCase();

  if (normalized.includes("bull") || normalized === "up" || normalized === "positive") {
    return "#34d399";
  }

  if (normalized.includes("bear") || normalized === "down" || normalized === "negative") {
    return "#fb7185";
  }

  return "#94a3b8";
}

function directionShape(direction: string): "arrowUp" | "arrowDown" | "circle" {
  const normalized = direction.toLowerCase();

  if (normalized.includes("bull") || normalized === "up" || normalized === "positive") {
    return "arrowUp";
  }

  if (normalized.includes("bear") || normalized === "down" || normalized === "negative") {
    return "arrowDown";
  }

  return "circle";
}

function directionPosition(direction: string): "belowBar" | "aboveBar" | "inBar" {
  const normalized = direction.toLowerCase();

  if (normalized.includes("bull") || normalized === "up" || normalized === "positive") {
    return "belowBar";
  }

  if (normalized.includes("bear") || normalized === "down" || normalized === "negative") {
    return "aboveBar";
  }

  return "inBar";
}

function directionLabel(direction: string): string {
  const normalized = direction.toLowerCase();

  if (normalized.includes("bull") || normalized === "up" || normalized === "positive") {
    return "Bullish";
  }

  if (normalized.includes("bear") || normalized === "down" || normalized === "negative") {
    return "Bearish";
  }

  return "Neutral";
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function mapRange(dateFrom: string, dateTo: string): "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" {
  const start = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
  const end = new Date(`${dateTo}T23:59:59.999Z`).getTime();
  const distanceDays = Math.max(1, Math.ceil((end - start) / 86_400_000));

  if (distanceDays <= 1) return "1d";
  if (distanceDays <= 5) return "5d";
  if (distanceDays <= 31) return "1mo";
  if (distanceDays <= 93) return "3mo";
  if (distanceDays <= 186) return "6mo";
  return "1y";
}

export function EventImpactChart({
  apiUrl,
  apiKey,
  ticker,
  dateFrom,
  dateTo,
  severity = [],
  selectedEventId,
  onTickerChange,
  onEventSelect,
  onDataLoaded,
  headerAction,
}: EventImpactChartProps) {
  const [tickerInput, setTickerInput] = useState(normalizeTicker(ticker));
  const [impactEvents, setImpactEvents] = useState<EventImpactPoint[]>([]);
  const [impactLoading, setImpactLoading] = useState(true);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<EventImpactPoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState({ x: 0, y: 0 });
  const [chartContainer, setChartContainer] = useState<HTMLDivElement | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [chartSeries, setChartSeries] = useState<ISeriesApi<"Candlestick"> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chartMarkers, setChartMarkers] = useState<any>(null);
  const activeTicker = normalizeTicker(ticker);

  useEffect(() => {
    setTickerInput(activeTicker);
  }, [activeTicker]);

  useEffect(() => {
    const nextTicker = normalizeTicker(tickerInput);

    if (nextTicker === activeTicker) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onTickerChange?.(nextTicker);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTicker, onTickerChange, tickerInput]);

  useEffect(() => {
    if (!chartContainer) {
      return;
    }

    const chart = createChart(chartContainer, {
      autoSize: true,
      height: 360,
      layout: {
        background: {
          type: ColorType.Solid,
          color: "transparent",
        },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: {
          color: "rgba(148, 163, 184, 0.10)",
        },
        horzLines: {
          color: "rgba(148, 163, 184, 0.10)",
        },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.16)",
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.16)",
      },
      crosshair: {
        vertLine: {
          color: "rgba(125, 211, 252, 0.35)",
        },
        horzLine: {
          color: "rgba(125, 211, 252, 0.20)",
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
    });
    const markers = createSeriesMarkers(series, []);

    setChartApi(chart);
    setChartSeries(series);
    setChartMarkers(markers);

    return () => {
      chart.remove();
      setChartApi(null);
      setChartSeries(null);
      setChartMarkers(null);
    };
  }, [chartContainer]);

  useEffect(() => {
    let cancelled = false;

    async function loadImpact() {
      setImpactLoading(true);
      setImpactError(null);

      const params = new URLSearchParams();
      params.set("ticker", activeTicker);

      const start = toApiDate(dateFrom, "start");
      const end = toApiDate(dateTo, "end");
      if (start) {
        params.set("dateFrom", start);
      }
      if (end) {
        params.set("dateTo", end);
      }
      if (severity.length === 1) {
        params.set("severity", severity[0]);
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/events/impact?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to load event impact data");
        }

        const payload = await response.json() as { events: EventImpactPoint[] };
        const nextEvents = severity.length > 1
          ? payload.events.filter((event) => event.severity && severity.includes(event.severity))
          : payload.events;

        if (!cancelled) {
          setImpactEvents(nextEvents);
          onDataLoaded?.(nextEvents);
        }
      } catch (error) {
        if (!cancelled) {
          setImpactError(error instanceof Error ? error.message : "Failed to load event impact data");
          setImpactEvents([]);
          onDataLoaded?.([]);
        }
      } finally {
        if (!cancelled) {
          setImpactLoading(false);
        }
      }
    }

    void loadImpact();

    return () => {
      cancelled = true;
    };
  }, [activeTicker, apiKey, apiUrl, dateFrom, dateTo, onDataLoaded, severity]);

  const { priceData, isLoading: priceLoading, error: priceError, refetch } = usePriceData({
    ticker: activeTicker,
    interval: "1d",
    range: mapRange(dateFrom, dateTo),
  });

  const chartData = priceData
    .filter((point) => {
      const isoDate = new Date(point.time * 1000).toISOString().slice(0, 10);
      return isoDate >= dateFrom && isoDate <= dateTo;
    })
    .map((point) => ({
      time: toChartDate(new Date(point.time * 1000).toISOString()) as Time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    })) as CandlestickData<Time>[];

  const filteredEvents = impactEvents.filter((event) => {
    const isoDate = toChartDate(event.timestamp);
    return isoDate >= dateFrom && isoDate <= dateTo;
  });

  useEffect(() => {
    if (!chartSeries || !chartMarkers) {
      return;
    }

    const markers = filteredEvents.map((event) => ({
      time: toChartDate(event.timestamp) as Time,
      position: directionPosition(event.direction),
      shape: directionShape(event.direction),
      color: directionColor(event.direction),
      text: event.severity ?? "Event",
      size: severitySize(event.severity),
      id: event.eventId,
    }));

    chartSeries.setData(chartData);
    chartMarkers.setMarkers(markers);
    chartApi?.timeScale().fitContent();
  }, [chartApi, chartData, chartMarkers, chartSeries, filteredEvents]);

  useEffect(() => {
    if (!chartApi) {
      return;
    }

    function handleMove(param: MouseEventParams<Time>) {
      if (!param.point || !param.time) {
        setHoveredEvent(null);
        return;
      }

      const event = filteredEvents.find(
        (entry) => toChartDate(entry.timestamp) === String(param.time),
      );

      setHoveredEvent(event ?? null);
      setHoverPoint({ x: param.point.x, y: param.point.y });
    }

    function handleClick(param: MouseEventParams<Time>) {
      if (!param.time) {
        return;
      }

      const event = filteredEvents.find(
        (entry) => toChartDate(entry.timestamp) === String(param.time),
      );

      if (event) {
        onEventSelect?.(event);
      }
    }

    chartApi.subscribeCrosshairMove(handleMove);
    chartApi.subscribeClick(handleClick);

    return () => {
      chartApi.unsubscribeCrosshairMove(handleMove);
      chartApi.unsubscribeClick(handleClick);
    };
  }, [chartApi, filteredEvents, onEventSelect]);

  const activeEvent =
    filteredEvents.find((event) => event.eventId === selectedEventId)
    ?? hoveredEvent;

  return (
    <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.97))] text-white shadow-[0_24px_90px_-48px_rgba(34,211,238,0.35)]">
      <CardHeader className="border-b border-white/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Radar className="h-4 w-4 text-cyan-300" />
              Event Impact Chart
            </CardTitle>
            <CardDescription className="text-slate-300">
              Price context plus severity-scaled event markers for the selected ticker window.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-cyan-300/35 bg-cyan-400/10 text-cyan-50">
              <Activity className="mr-1 h-3.5 w-3.5" />
              {filteredEvents.length} tracked events
            </Badge>
            {headerAction}
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
          <div className="sm:w-48">
            <Input
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
              placeholder="AAPL"
              className="border-white/10 bg-black/20 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
              {dateFrom} → {dateTo}
            </Badge>
            {severity.length > 0 ? (
              <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
                {severity.join(", ")}
              </Badge>
            ) : null}
            {(impactLoading || priceLoading) ? (
              <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
                Updating
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {impactError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {impactError}
          </div>
        ) : null}

        {priceError ? (
          <div className="flex items-center justify-between rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span>{priceError}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry price data
            </Button>
          </div>
        ) : null}

        {chartData.length > 0 ? (
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.65),rgba(15,23,42,0.22))] p-2">
            <div ref={setChartContainer} className="h-[22rem] w-full" />
            {activeEvent ? (
              <div
                className="pointer-events-none absolute z-10 min-w-56 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-2xl backdrop-blur"
                style={{
                  left: Math.min(Math.max(hoverPoint.x + 16, 16), 420),
                  top: Math.min(Math.max(hoverPoint.y + 16, 16), 250),
                }}
              >
                <p className="text-sm font-medium text-white">{activeEvent.headline}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                  <span>{activeEvent.severity ?? "Unknown"}</span>
                  <span>{directionLabel(activeEvent.direction)}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>T+1H</span>
                    <span>{formatSignedPercent(activeEvent.priceChange1h)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>T+1D</span>
                    <span>{formatSignedPercent(activeEvent.priceChange1d)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>T+1W</span>
                    <span>{formatSignedPercent(activeEvent.priceChange1w)}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredEvents.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 text-center">
                <p className="text-lg font-medium">No impact events in this window</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Try widening the date range or switching to a ticker with completed outcome tracking.
                </p>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <button
                  key={event.eventId}
                  type="button"
                  onClick={() => onEventSelect?.(event)}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors",
                    selectedEventId === event.eventId
                      ? "border-cyan-300/35 bg-cyan-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{event.severity ?? "Unknown"}</Badge>
                      <span className="text-xs uppercase tracking-[0.24em] text-slate-300">
                        {directionLabel(event.direction)}
                      </span>
                    </div>
                    <p className="font-medium text-white">{event.headline}</p>
                    <p className="text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="grid gap-1 text-right text-sm">
                    <span>{formatSignedPercent(event.priceChange1h)}</span>
                    <span>{formatSignedPercent(event.priceChange1d)}</span>
                    <span>{formatSignedPercent(event.priceChange1w)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {activeEvent ? (
          <div className="grid gap-3 md:grid-cols-3">
            {([
              ["T+1H", activeEvent.priceChange1h, "border-emerald-400/20 bg-emerald-500/10 text-emerald-200/80 text-emerald-300"] as const,
              ["T+1D", activeEvent.priceChange1d, "border-cyan-400/20 bg-cyan-500/10 text-cyan-100/80 text-cyan-300"] as const,
              ["T+1W", activeEvent.priceChange1w, "border-violet-400/20 bg-violet-500/10 text-violet-100/80 text-violet-300"] as const,
            ] as const).map(([label, value, tones]) => {
              const parts = tones.split(" ");
              return (
                <div key={label} className={cn("rounded-2xl px-4 py-3", parts[0], parts[1])}>
                  <p className={cn("text-[11px] uppercase tracking-[0.24em]", parts[2])}>{label}</p>
                  <div className="mt-2 flex items-center gap-2 text-white">
                    <ArrowUpRight className={cn("h-4 w-4", value < 0 && "rotate-180 text-red-300", value >= 0 && parts[3])} />
                    <span className="text-lg font-semibold">{formatSignedPercent(value)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/80">Bullish</p>
              <p className="mt-2 text-sm text-emerald-50/80">
                Green markers signal positive or bullish follow-through.
              </p>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-rose-100/80">Bearish</p>
              <p className="mt-2 text-sm text-rose-50/80">
                Red markers signal negative or bearish follow-through.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-400/20 bg-slate-500/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-100/80">Neutral</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-50/80">
                <Minus className="h-4 w-4" />
                Grey markers signal muted or mixed reaction.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
