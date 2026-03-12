"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortField = "timestamp" | "ticker" | "source" | "type" | "severity" | "headline";
type SortOrder = "asc" | "desc";
export type SeverityFilter = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface HistoryEvent {
  id: string;
  timestamp: string;
  ticker: string | null;
  source: string;
  type: string;
  severity: SeverityFilter | null;
  direction: string | null;
  headline: string;
  summary: string | null;
  sector: string;
  metadata: Record<string, unknown> | null;
}

interface HistoryResponse {
  data: HistoryEvent[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface HistoryDashboardQuery {
  dateFrom: string;
  dateTo: string;
  ticker: string;
  source: string[];
  severity: SeverityFilter[];
  type: string[];
  sector: string;
  page: number;
  pageSize: number;
  sortBy: SortField;
  sortOrder: SortOrder;
}

export interface HistoryQueryChangeOptions {
  clearSector?: boolean;
  resetPage?: boolean;
}

interface EventHistoryBrowserProps {
  apiKey: string;
  apiUrl: string;
  query: HistoryDashboardQuery;
  onQueryChange: (
    updates: Partial<HistoryDashboardQuery>,
    options?: HistoryQueryChangeOptions,
  ) => void;
  selectedEventId?: string | null;
  onEventSelect?: (event: HistoryEvent) => void;
  onEventsLoaded?: (events: HistoryEvent[]) => void;
  headerAction?: ReactNode;
}

const SEVERITY_OPTIONS: SeverityFilter[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const severityTone: Record<SeverityFilter, string> = {
  CRITICAL: "bg-red-500/15 text-red-300 ring-red-500/30",
  HIGH: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  LOW: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

function formatApiDate(date: string, boundary: "start" | "end"): string | null {
  if (!date) {
    return null;
  }

  return boundary === "start"
    ? new Date(`${date}T00:00:00.000Z`).toISOString()
    : new Date(`${date}T23:59:59.999Z`).toISOString();
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildDirection(direction: string | null) {
  switch (direction) {
    case "UP":
    case "BULLISH":
    case "bullish":
      return (
        <span className="inline-flex items-center gap-1 text-emerald-300">
          <ArrowUp className="h-3.5 w-3.5" />
          Up
        </span>
      );
    case "DOWN":
    case "BEARISH":
    case "bearish":
      return (
        <span className="inline-flex items-center gap-1 text-red-300">
          <ArrowDown className="h-3.5 w-3.5" />
          Down
        </span>
      );
    default:
      return <span className="text-muted-foreground">Neutral</span>;
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-12 animate-pulse rounded-lg bg-muted/60"
        />
      ))}
    </div>
  );
}

export function EventHistoryBrowser({
  apiKey,
  apiUrl,
  query,
  onQueryChange,
  selectedEventId,
  onEventSelect,
  onEventsLoaded,
  headerAction,
}: EventHistoryBrowserProps) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [pagination, setPagination] = useState<HistoryResponse["pagination"]>({
    page: 1,
    pageSize: query.pageSize,
    totalCount: 0,
    totalPages: 0,
  });
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [tickerInput, setTickerInput] = useState(query.ticker);

  useEffect(() => {
    setTickerInput(query.ticker);
  }, [query.ticker]);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        const [sourcesResponse, typesResponse] = await Promise.all([
          fetch(`${apiUrl}/api/v1/events/history/sources`),
          fetch(`${apiUrl}/api/v1/events/history/types`),
        ]);

        if (!sourcesResponse.ok || !typesResponse.ok) {
          throw new Error("Failed to load history filters");
        }

        const sourcesPayload = (await sourcesResponse.json()) as { sources: string[] };
        const typesPayload = (await typesResponse.json()) as { types: string[] };

        if (!cancelled) {
          setSourceOptions(sourcesPayload.sources);
          setTypeOptions(typesPayload.types);
        }
      } catch (metadataError) {
        if (!cancelled) {
          setError(
            metadataError instanceof Error
              ? metadataError.message
              : "Failed to load history filters",
          );
        }
      }
    }

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [apiKey, apiUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tickerInput !== query.ticker) {
        onQueryChange(
          {
            ticker: tickerInput.toUpperCase(),
          },
          { clearSector: true, resetPage: true },
        );
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [tickerInput, query.ticker, onQueryChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(query.page));
      params.set("pageSize", String(query.pageSize));
      params.set("sortBy", query.sortBy);
      params.set("sortOrder", query.sortOrder);

      if (query.ticker) {
        params.set("ticker", query.ticker);
      }
      if (query.source.length > 0) {
        params.set("source", query.source.join(","));
      }
      if (query.severity.length > 0) {
        params.set("severity", query.severity.join(","));
      }
      if (query.type.length > 0) {
        params.set("type", query.type.join(","));
      }

      const dateFrom = formatApiDate(query.dateFrom, "start");
      const dateTo = formatApiDate(query.dateTo, "end");
      if (dateFrom) {
        params.set("dateFrom", dateFrom);
      }
      if (dateTo) {
        params.set("dateTo", dateTo);
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/events/history?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to load historical events");
        }

        const payload = (await response.json()) as HistoryResponse;

        if (!cancelled) {
          setEvents(payload.data);
          setPagination(payload.pagination);
          onEventsLoaded?.(payload.data);
        }
      } catch (historyError) {
        if (!cancelled) {
          setError(
            historyError instanceof Error
              ? historyError.message
              : "Failed to load historical events",
          );
          setEvents([]);
          setPagination({
            page: query.page,
            pageSize: query.pageSize,
            totalCount: 0,
            totalPages: 0,
          });
          onEventsLoaded?.([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [apiKey, apiUrl, onEventsLoaded, query]);

  function toggleSeverity(value: SeverityFilter) {
    const nextSeverity = query.severity.includes(value)
      ? query.severity.filter((entry) => entry !== value)
      : [...query.severity, value];

    onQueryChange(
      { severity: nextSeverity },
      { clearSector: true, resetPage: true },
    );
  }

  function toggleRow(id: string) {
    setExpandedRows((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleSort(field: SortField) {
    if (query.sortBy === field) {
      onQueryChange({
        sortOrder: query.sortOrder === "asc" ? "desc" : "asc",
      });
      return;
    }

    onQueryChange({
      sortBy: field,
      sortOrder: "desc",
    });
  }

  function renderSortIcon(field: SortField) {
    if (query.sortBy !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    }

    return query.sortOrder === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5" />
    );
  }

  return (
    <Card className="border border-white/10 bg-card/90 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.85)] backdrop-blur">
      <CardHeader className="border-b border-white/8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-cyan-300" />
              Event History Browser
            </CardTitle>
            <CardDescription>
              Search, slice, and review historical events with shareable URL filters.
            </CardDescription>
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.1fr_1.1fr_1fr]">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Date From
            </span>
            <Input
              type="date"
              value={query.dateFrom}
              onChange={(event) =>
                onQueryChange(
                  { dateFrom: event.target.value },
                  { resetPage: true },
                )
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Date To
            </span>
            <Input
              type="date"
              value={query.dateTo}
              onChange={(event) =>
                onQueryChange(
                  { dateTo: event.target.value },
                  { resetPage: true },
                )
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Tickers
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value)}
                placeholder="AAPL,NVDA,TSLA"
                className="pl-9"
              />
            </div>
          </label>
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Active Slice
            </span>
            <div className="flex min-h-8 items-center gap-2 rounded-lg border border-dashed border-white/10 bg-muted/25 px-3 text-sm">
              {query.sector ? (
                <Badge variant="outline" className="border-cyan-400/40 text-cyan-200">
                  Sector: {query.sector}
                </Badge>
              ) : (
                <span className="text-muted-foreground">No sector pinned</span>
              )}
              {(query.ticker || query.source.length || query.type.length || query.severity.length) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onQueryChange(
                      {
                        ticker: "",
                        source: [],
                        severity: [],
                        type: [],
                        sector: "",
                        page: 1,
                      },
                      { clearSector: true, resetPage: false },
                    )
                  }
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Sources
            </span>
            <select
              multiple
              value={query.source}
              onChange={(event) =>
                onQueryChange(
                  {
                    source: Array.from(event.target.selectedOptions, (option) => option.value),
                  },
                  { clearSector: true, resetPage: true },
                )
              }
              className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {sourceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Event Types
            </span>
            <select
              multiple
              value={query.type}
              onChange={(event) =>
                onQueryChange(
                  {
                    type: Array.from(event.target.selectedOptions, (option) => option.value),
                  },
                  { clearSector: true, resetPage: true },
                )
              }
              className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Severity
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {SEVERITY_OPTIONS.map((severityValue) => (
                <label
                  key={severityValue}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                    query.severity.includes(severityValue)
                      ? "border-white/20 bg-white/6"
                      : "border-white/8 bg-muted/20 text-muted-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={query.severity.includes(severityValue)}
                    onChange={() => toggleSeverity(severityValue)}
                    className="h-4 w-4 rounded border-input bg-background"
                  />
                  <span>{severityValue}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-white/10">
          {isLoading ? (
            <div className="p-4">
              <LoadingSkeleton />
            </div>
          ) : events.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <p className="text-lg font-medium">No events in this range</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Adjust the date range or relax one of the filters to widen the search.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/35">
                <TableRow className="hover:bg-muted/35">
                  {[
                    ["timestamp", "Timestamp"],
                    ["ticker", "Ticker"],
                    ["source", "Source"],
                    ["type", "Type"],
                    ["severity", "Severity"],
                    ["headline", "Headline"],
                  ].map(([field, label]) => (
                    <TableHead key={field}>
                      <button
                        type="button"
                        onClick={() => toggleSort(field as SortField)}
                        className="inline-flex items-center gap-1 text-left"
                      >
                        <span>{label}</span>
                        {renderSortIcon(field as SortField)}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead>Direction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const isSelected = selectedEventId === event.id;

                  return (
                    <Fragment key={event.id}>
                      <TableRow
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/35",
                          isSelected && "bg-cyan-500/10 hover:bg-cyan-500/10",
                        )}
                        onClick={() => {
                          onEventSelect?.(event);
                          toggleRow(event.id);
                        }}
                      >
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatTimestamp(event.timestamp)}
                        </TableCell>
                        <TableCell className="font-medium">{event.ticker ?? "N/A"}</TableCell>
                        <TableCell>{event.source}</TableCell>
                        <TableCell>{event.type}</TableCell>
                        <TableCell>
                          {event.severity ? (
                            <Badge
                              variant="outline"
                              className={cn("ring-1", severityTone[event.severity])}
                            >
                              {event.severity}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[28rem]">
                          <div className="flex items-start justify-between gap-3">
                            <span className="line-clamp-2">{event.headline}</span>
                            {expandedRows[event.id] ? (
                              <ChevronUp className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{buildDirection(event.direction)}</TableCell>
                      </TableRow>
                      {expandedRows[event.id] && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7}>
                            <div className="space-y-3 rounded-xl border border-white/8 bg-background/70 p-4">
                              <div className="flex flex-wrap gap-2">
                                {event.sector ? (
                                  <Badge variant="outline">{event.sector}</Badge>
                                ) : null}
                                {event.ticker ? (
                                  <Badge variant="outline">{event.ticker}</Badge>
                                ) : null}
                                <Badge variant="outline">{event.source}</Badge>
                                <Badge variant="outline">{event.type}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {event.summary ?? "No additional summary available."}
                              </p>
                              <pre className="overflow-auto rounded-xl border border-white/8 bg-muted/25 p-3 text-xs text-muted-foreground">
                                {JSON.stringify(event.metadata ?? {}, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages || 1}
            {" · "}
            {pagination.totalCount} total events
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onQueryChange({ page: Math.max(1, query.page - 1) })}
              disabled={pagination.page <= 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Badge variant="outline" className="min-w-14 justify-center">
              {pagination.page}
            </Badge>
            <Button
              variant="outline"
              onClick={() => onQueryChange({ page: query.page + 1 })}
              disabled={
                isLoading ||
                pagination.totalPages === 0 ||
                pagination.page >= pagination.totalPages
              }
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
