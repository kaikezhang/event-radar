"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Blocks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ALL_SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Industrials",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
  "Communication Services",
  "Other",
];

interface SectorTile {
  sector: string;
  count: number;
  criticalCount: number;
  highCount: number;
  tickers: string[];
}

interface SectorAggregateResponse {
  sectors: SectorTile[];
}

interface SectorHeatmapProps {
  apiKey: string;
  apiUrl: string;
  dateFrom: string;
  dateTo: string;
  severity: string[];
  selectedSector: string;
  onSelectSector: (sector: SectorTile | null) => void;
}

function buildApiDate(date: string, boundary: "start" | "end"): string | null {
  if (!date) {
    return null;
  }

  return boundary === "start"
    ? new Date(`${date}T00:00:00.000Z`).toISOString()
    : new Date(`${date}T23:59:59.999Z`).toISOString();
}

function tileTone(tile: SectorTile): string {
  if (tile.count === 0) {
    return "linear-gradient(160deg, rgba(148,163,184,0.12), rgba(71,85,105,0.18))";
  }

  const hotShare = (tile.criticalCount * 2 + tile.highCount) / Math.max(tile.count * 2, 1);
  if (hotShare >= 0.75) {
    return "linear-gradient(145deg, rgba(248,113,113,0.24), rgba(127,29,29,0.72))";
  }
  if (hotShare >= 0.45) {
    return "linear-gradient(145deg, rgba(251,191,36,0.20), rgba(154,52,18,0.64))";
  }

  return "linear-gradient(145deg, rgba(16,185,129,0.18), rgba(6,95,70,0.62))";
}

function tileSpan(tile: SectorTile, maxCount: number): number {
  if (tile.count === 0 || maxCount === 0) {
    return 2;
  }

  const normalized = tile.count / maxCount;
  if (normalized > 0.8) return 6;
  if (normalized > 0.6) return 5;
  if (normalized > 0.35) return 4;
  if (normalized > 0.15) return 3;
  return 2;
}

export function SectorHeatmap({
  apiKey,
  apiUrl,
  dateFrom,
  dateTo,
  severity,
  selectedSector,
  onSelectSector,
}: SectorHeatmapProps) {
  const [payload, setPayload] = useState<SectorAggregateResponse>({ sectors: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSectors() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      const from = buildApiDate(dateFrom, "start");
      const to = buildApiDate(dateTo, "end");

      if (from) {
        params.set("dateFrom", from);
      }
      if (to) {
        params.set("dateTo", to);
      }
      if (severity.length > 0) {
        params.set("severity", severity.join(","));
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/events/sectors?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to load sector heatmap");
        }

        const nextPayload = (await response.json()) as SectorAggregateResponse;
        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load sector heatmap",
          );
          setPayload({ sectors: [] });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSectors();

    return () => {
      cancelled = true;
    };
  }, [apiKey, apiUrl, dateFrom, dateTo, severity]);

  const sectors = useMemo(() => {
    const bySector = new Map(payload.sectors.map((sector) => [sector.sector, sector]));
    return ALL_SECTORS.map((sector) => bySector.get(sector) ?? {
      sector,
      count: 0,
      criticalCount: 0,
      highCount: 0,
      tickers: [],
    });
  }, [payload.sectors]);

  const maxCount = useMemo(
    () => sectors.reduce((highest, sector) => Math.max(highest, sector.count), 0),
    [sectors],
  );

  return (
    <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.95))] text-white shadow-[0_25px_100px_-45px_rgba(34,211,238,0.35)]">
      <CardHeader className="border-b border-white/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Blocks className="h-4 w-4 text-cyan-300" />
              Sector Heatmap
            </CardTitle>
            <CardDescription className="text-slate-300">
              Event density by GICS sector. Click a sector to pin its tickers into the browser below.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-cyan-400/40 bg-cyan-400/10 text-cyan-100">
            <Activity className="mr-1 h-3.5 w-3.5" />
            {payload.sectors.reduce((sum, sector) => sum + sector.count, 0)} events
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/8"
              />
            ))}
          </div>
        ) : (
          <div className="grid auto-rows-[112px] grid-cols-2 gap-3 md:grid-cols-6">
            {sectors.map((sector) => {
              const active = selectedSector === sector.sector && sector.count > 0;
              return (
                <button
                  key={sector.sector}
                  type="button"
                  title={`${sector.sector}: ${sector.count} events | ${sector.tickers.slice(0, 5).join(", ") || "No tickers"}`}
                  onClick={() =>
                    onSelectSector(
                      active || sector.count === 0
                        ? null
                        : sector,
                    )
                  }
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5",
                    active
                      ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.55)]"
                      : "border-white/10",
                    sector.count === 0 && "opacity-65",
                  )}
                  style={{
                    background: tileTone(sector),
                    gridColumn: `span ${tileSpan(sector, maxCount)} / span ${tileSpan(sector, maxCount)}`,
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <p className="text-sm font-medium text-white/95">{sector.sector}</p>
                      <p className="mt-1 text-xs text-white/65">
                        {sector.tickers.slice(0, 3).join(", ") || "No active tickers"}
                      </p>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-semibold tracking-tight text-white">
                          {sector.count}
                        </p>
                        <p className="text-xs text-white/65">
                          {sector.criticalCount} critical · {sector.highCount} high
                        </p>
                      </div>
                      {active && (
                        <Badge
                          variant="outline"
                          className="border-cyan-200/50 bg-cyan-200/10 text-cyan-50"
                        >
                          Pinned
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
