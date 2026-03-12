"use client";

import { Suspense, useEffect, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers3, Radar } from "lucide-react";
import {
  EventHistoryBrowser,
  type HistoryDashboardQuery,
  type HistoryEvent,
  type HistoryQueryChangeOptions,
} from "@/components/event-history-browser";
import { DetachablePanel } from "@/components/detachable-panel";
import { EventImpactChart } from "@/components/event-impact-chart";
import { HistoryEventDetail } from "@/components/history-event-detail";
import { SectorHeatmap } from "@/components/sector-heatmap";
import { useBroadcastSync } from "@/lib/broadcast-sync";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "er-dev-2026";

function parseCsv(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 13);

  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

function pickPrimaryTicker(ticker: string, fallback: string): string {
  return parseCsv(ticker)[0] ?? fallback;
}

function areEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export default function HistoryDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96 text-muted-foreground">Loading...</div>}>
      <HistoryDashboardContent />
    </Suspense>
  );
}

function HistoryDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => defaultDateRange(), []);
  const sync = useBroadcastSync();

  const query = useMemo<HistoryDashboardQuery>(() => ({
    dateFrom: searchParams.get("dateFrom") ?? defaults.dateFrom,
    dateTo: searchParams.get("dateTo") ?? defaults.dateTo,
    ticker: searchParams.get("ticker") ?? "",
    source: parseCsv(searchParams.get("source")),
    severity: parseCsv(searchParams.get("severity")) as HistoryDashboardQuery["severity"],
    type: parseCsv(searchParams.get("type")),
    sector: searchParams.get("sector") ?? "",
    page: Number(searchParams.get("page") ?? "1") || 1,
    pageSize: Number(searchParams.get("pageSize") ?? "50") || 50,
    sortBy: (searchParams.get("sortBy") as HistoryDashboardQuery["sortBy"]) ?? "timestamp",
    sortOrder: (searchParams.get("sortOrder") as HistoryDashboardQuery["sortOrder"]) ?? "desc",
  }), [defaults.dateFrom, defaults.dateTo, searchParams]);

  const activeTicker = useMemo(
    () => pickPrimaryTicker(query.ticker, sync.ticker || "AAPL"),
    [query.ticker, sync.ticker],
  );

  const localFilters = useMemo<Record<string, unknown>>(() => ({
    source: query.source,
    severity: query.severity,
    type: query.type,
    sector: query.sector,
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  }), [query.page, query.pageSize, query.severity, query.sector, query.sortBy, query.sortOrder, query.source, query.type]);

  function updateQuery(
    updates: Partial<HistoryDashboardQuery>,
    options: HistoryQueryChangeOptions = {},
  ) {
    const next = new URLSearchParams(searchParams.toString());

    const entries = Object.entries(updates) as Array<
      [keyof HistoryDashboardQuery, HistoryDashboardQuery[keyof HistoryDashboardQuery]]
    >;

    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          next.delete(key);
        } else {
          next.set(key, value.join(","));
        }
        continue;
      }

      if (value === "" || value == null) {
        next.delete(key);
        continue;
      }

      next.set(key, String(value));
    }

    if (options.clearSector) {
      next.delete("sector");
    }

    if (options.resetPage && !("page" in updates)) {
      next.set("page", "1");
    }

    startTransition(() => {
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname);
    });
  }

  useEffect(() => {
    if (sync.ticker !== activeTicker) {
      sync.broadcastTicker(activeTicker);
    }
  }, [activeTicker, sync]);

  useEffect(() => {
    if (sync.dateFrom !== query.dateFrom || sync.dateTo !== query.dateTo) {
      sync.broadcastDateRange(query.dateFrom, query.dateTo);
    }
  }, [query.dateFrom, query.dateTo, sync]);

  useEffect(() => {
    if (!areEqual(sync.filters, localFilters)) {
      sync.broadcastFilters(localFilters);
    }
  }, [localFilters, sync]);

  useEffect(() => {
    if (sync.ticker && sync.ticker !== activeTicker) {
      updateQuery(
        {
          ticker: sync.ticker,
          page: 1,
        },
        { clearSector: true, resetPage: false },
      );
    }
  }, [activeTicker, sync.ticker]);

  useEffect(() => {
    if (
      sync.dateFrom &&
      sync.dateTo &&
      (sync.dateFrom !== query.dateFrom || sync.dateTo !== query.dateTo)
    ) {
      updateQuery(
        {
          dateFrom: sync.dateFrom,
          dateTo: sync.dateTo,
          page: 1,
        },
        { resetPage: false },
      );
    }
  }, [query.dateFrom, query.dateTo, sync.dateFrom, sync.dateTo]);

  useEffect(() => {
    if (Object.keys(sync.filters).length === 0 || areEqual(sync.filters, localFilters)) {
      return;
    }

    updateQuery(
      {
        source: asStringArray(sync.filters.source),
        severity: asStringArray(sync.filters.severity) as HistoryDashboardQuery["severity"],
        type: asStringArray(sync.filters.type),
        sector: asString(sync.filters.sector),
        page: asNumber(sync.filters.page, 1),
        pageSize: asNumber(sync.filters.pageSize, 50),
        sortBy: asString(sync.filters.sortBy, "timestamp") as HistoryDashboardQuery["sortBy"],
        sortOrder: asString(sync.filters.sortOrder, "desc") as HistoryDashboardQuery["sortOrder"],
      },
      { resetPage: false },
    );
  }, [localFilters, sync.filters]);

  function handleEventSelect(event: HistoryEvent) {
    sync.broadcastEventSelected(event.id);
    if (event.ticker && event.ticker !== activeTicker) {
      updateQuery(
        {
          ticker: event.ticker,
          page: 1,
        },
        { clearSector: true, resetPage: false },
      );
    }
  }

  function buildPanelHref(type: "chart" | "events" | "detail") {
    const params = new URLSearchParams();
    params.set("ticker", activeTicker);
    params.set("dateFrom", query.dateFrom);
    params.set("dateTo", query.dateTo);

    if (query.source.length > 0) {
      params.set("source", query.source.join(","));
    }
    if (query.severity.length > 0) {
      params.set("severity", query.severity.join(","));
    }
    if (query.type.length > 0) {
      params.set("type", query.type.join(","));
    }
    if (query.sector) {
      params.set("sector", query.sector);
    }
    params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize));
    params.set("sortBy", query.sortBy);
    params.set("sortOrder", query.sortOrder);

    if (sync.selectedEventId) {
      params.set("eventId", sync.selectedEventId);
    }

    return `/dashboard/panel/${type}?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] px-6 py-7 text-white shadow-[0_30px_120px_-50px_rgba(34,211,238,0.45)]">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.08))]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.26em] text-cyan-100">
              <Radar className="h-3.5 w-3.5" />
              History Dashboard
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Historical event flow and sector stress in one view
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                Scan sector concentration, then inspect event impact and keep every open dashboard window in sync.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <Layers3 className="h-4 w-4 text-cyan-300" />
            {isPending ? "Updating URL state..." : `${sync.activeWindowCount} synced window${sync.activeWindowCount === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <SectorHeatmap
        apiKey={API_KEY}
        apiUrl={API_URL}
        dateFrom={query.dateFrom}
        dateTo={query.dateTo}
        severity={query.severity}
        selectedSector={query.sector}
        onSelectSector={(sector) => {
          if (!sector) {
            updateQuery(
              {
                sector: "",
                ticker: "",
                page: 1,
              },
              { resetPage: false },
            );
            return;
          }

          updateQuery(
            {
              sector: sector.sector,
              ticker: sector.tickers.join(","),
              page: 1,
            },
            { resetPage: false },
          );
        }}
      />

      <DetachablePanel
        title="Event Impact"
        description="Reaction markers over price history, synced with the shared date range and selected event."
        href={buildPanelHref("chart")}
      >
        <EventImpactChart
          apiKey={API_KEY}
          apiUrl={API_URL}
          ticker={activeTicker}
          dateFrom={query.dateFrom}
          dateTo={query.dateTo}
          severity={query.severity}
          selectedEventId={sync.selectedEventId}
          onTickerChange={(nextTicker) =>
            updateQuery(
              {
                ticker: nextTicker,
                page: 1,
              },
              { clearSector: true, resetPage: false },
            )
          }
          onEventSelect={(event) => sync.broadcastEventSelected(event.eventId)}
        />
      </DetachablePanel>

      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <DetachablePanel
          title="Event List"
          description="Full historical browser with filters and cross-window event selection."
          href={buildPanelHref("events")}
        >
          <EventHistoryBrowser
            apiKey={API_KEY}
            apiUrl={API_URL}
            query={query}
            selectedEventId={sync.selectedEventId}
            onEventSelect={handleEventSelect}
            onQueryChange={updateQuery}
          />
        </DetachablePanel>

        <DetachablePanel
          title="Event Detail"
          description="Detachable detail pane fed by the currently selected event marker or table row."
          href={buildPanelHref("detail")}
        >
          <HistoryEventDetail
            apiKey={API_KEY}
            apiUrl={API_URL}
            eventId={sync.selectedEventId ?? null}
          />
        </DetachablePanel>
      </div>
    </div>
  );
}
