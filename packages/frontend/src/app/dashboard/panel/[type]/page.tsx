"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, PanelsTopLeft } from "lucide-react";
import {
  EventHistoryBrowser,
  type HistoryDashboardQuery,
  type HistoryEvent,
  type HistoryQueryChangeOptions,
} from "@/components/event-history-browser";
import { EventImpactChart } from "@/components/event-impact-chart";
import { HistoryEventDetail } from "@/components/history-event-detail";
import { useBroadcastSync } from "@/lib/broadcast-sync";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
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

function areEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  const result = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

  return result.length > 0 ? result : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export default function DetachedDashboardPanelPage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => defaultDateRange(), []);
  const sync = useBroadcastSync();

  const panelType = params.type;
  const baseQuery = useMemo<HistoryDashboardQuery>(() => ({
    dateFrom: searchParams.get("dateFrom") ?? defaults.dateFrom,
    dateTo: searchParams.get("dateTo") ?? defaults.dateTo,
    ticker: searchParams.get("ticker") ?? "AAPL",
    source: parseCsv(searchParams.get("source")),
    severity: parseCsv(searchParams.get("severity")) as HistoryDashboardQuery["severity"],
    type: parseCsv(searchParams.get("type")),
    sector: searchParams.get("sector") ?? "",
    page: Number(searchParams.get("page") ?? "1") || 1,
    pageSize: Number(searchParams.get("pageSize") ?? "50") || 50,
    sortBy: (searchParams.get("sortBy") as HistoryDashboardQuery["sortBy"]) ?? "timestamp",
    sortOrder: (searchParams.get("sortOrder") as HistoryDashboardQuery["sortOrder"]) ?? "desc",
  }), [defaults.dateFrom, defaults.dateTo, searchParams]);

  const effectiveQuery = useMemo<HistoryDashboardQuery>(() => ({
    ...baseQuery,
    ticker: asString(sync.ticker, baseQuery.ticker),
    dateFrom: asString(sync.dateFrom, baseQuery.dateFrom),
    dateTo: asString(sync.dateTo, baseQuery.dateTo),
    source: asStringArray(sync.filters.source, baseQuery.source),
    severity: asStringArray(sync.filters.severity, baseQuery.severity) as HistoryDashboardQuery["severity"],
    type: asStringArray(sync.filters.type, baseQuery.type),
    sector: asString(sync.filters.sector, baseQuery.sector),
    page: asNumber(sync.filters.page, baseQuery.page),
    pageSize: asNumber(sync.filters.pageSize, baseQuery.pageSize),
    sortBy: asString(sync.filters.sortBy, baseQuery.sortBy) as HistoryDashboardQuery["sortBy"],
    sortOrder: asString(sync.filters.sortOrder, baseQuery.sortOrder) as HistoryDashboardQuery["sortOrder"],
  }), [baseQuery, sync.dateFrom, sync.dateTo, sync.filters, sync.ticker]);

  const selectedEventId = sync.selectedEventId ?? searchParams.get("eventId");
  const localFilters = useMemo<Record<string, unknown>>(() => ({
    source: baseQuery.source,
    severity: baseQuery.severity,
    type: baseQuery.type,
    sector: baseQuery.sector,
    page: baseQuery.page,
    pageSize: baseQuery.pageSize,
    sortBy: baseQuery.sortBy,
    sortOrder: baseQuery.sortOrder,
  }), [baseQuery.page, baseQuery.pageSize, baseQuery.severity, baseQuery.sector, baseQuery.sortBy, baseQuery.sortOrder, baseQuery.source, baseQuery.type]);

  function replaceParams(updates: Record<string, string | number | string[] | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
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

    startTransition(() => {
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname);
    });
  }

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
    if (sync.ticker !== baseQuery.ticker) {
      sync.broadcastTicker(baseQuery.ticker);
    }
  }, [baseQuery.ticker, sync]);

  useEffect(() => {
    if (sync.dateFrom !== baseQuery.dateFrom || sync.dateTo !== baseQuery.dateTo) {
      sync.broadcastDateRange(baseQuery.dateFrom, baseQuery.dateTo);
    }
  }, [baseQuery.dateFrom, baseQuery.dateTo, sync]);

  useEffect(() => {
    if (!areEqual(sync.filters, localFilters)) {
      sync.broadcastFilters(localFilters);
    }
  }, [localFilters, sync]);

  useEffect(() => {
    const eventIdFromUrl = searchParams.get("eventId");
    if (eventIdFromUrl && eventIdFromUrl !== sync.selectedEventId) {
      sync.broadcastEventSelected(eventIdFromUrl);
    }
  }, [searchParams, sync]);

  function handleEventSelect(event: HistoryEvent) {
    sync.broadcastEventSelected(event.id);
    replaceParams({ eventId: event.id, ticker: event.ticker ?? effectiveQuery.ticker });
  }

  if (!["chart", "events", "detail"].includes(panelType)) {
    return (
      <div className="rounded-3xl border border-red-400/30 bg-red-500/10 px-6 py-10 text-red-100">
        Unknown panel type: {panelType}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] px-6 py-7 text-white shadow-[0_30px_120px_-50px_rgba(34,211,238,0.45)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.26em] text-cyan-100">
            <PanelsTopLeft className="h-3.5 w-3.5" />
            Detached Panel
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight capitalize">{panelType} panel</h1>
          <p className="mt-2 text-sm text-slate-300">
            This window stays synchronized with the main dashboard via BroadcastChannel.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          <ArrowLeftRight className="h-4 w-4 text-cyan-300" />
          {isPending ? "Updating panel state..." : `${sync.activeWindowCount} synced window${sync.activeWindowCount === 1 ? "" : "s"}`}
        </div>
      </div>

      {panelType === "chart" ? (
        <EventImpactChart
          apiKey={API_KEY}
          apiUrl={API_URL}
          ticker={effectiveQuery.ticker}
          dateFrom={effectiveQuery.dateFrom}
          dateTo={effectiveQuery.dateTo}
          severity={effectiveQuery.severity}
          selectedEventId={selectedEventId}
          onTickerChange={(ticker) => replaceParams({ ticker })}
          onEventSelect={(event) => {
            sync.broadcastEventSelected(event.eventId);
            replaceParams({ eventId: event.eventId, ticker: event.ticker });
          }}
        />
      ) : null}

      {panelType === "events" ? (
        <EventHistoryBrowser
          apiKey={API_KEY}
          apiUrl={API_URL}
          query={effectiveQuery}
          selectedEventId={selectedEventId}
          onEventSelect={handleEventSelect}
          onQueryChange={updateQuery}
        />
      ) : null}

      {panelType === "detail" ? (
        <HistoryEventDetail
          apiKey={API_KEY}
          apiUrl={API_URL}
          eventId={selectedEventId}
        />
      ) : null}
    </div>
  );
}
