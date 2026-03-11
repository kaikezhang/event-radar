"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers3, Radar } from "lucide-react";
import type { HistoryDashboardQuery, HistoryQueryChangeOptions } from "@/components/event-history-browser";
import { EventHistoryBrowser } from "@/components/event-history-browser";
import { SectorHeatmap } from "@/components/sector-heatmap";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "dev-api-key-12345";

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

export default function HistoryDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => defaultDateRange(), []);

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
                Scan sector concentration, then drop directly into the event tape with the same time window and filters.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <Layers3 className="h-4 w-4 text-cyan-300" />
            {isPending ? "Updating URL state..." : "URL-synced filters enabled"}
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

      <EventHistoryBrowser
        apiKey={API_KEY}
        apiUrl={API_URL}
        query={query}
        onQueryChange={updateQuery}
      />
    </div>
  );
}
