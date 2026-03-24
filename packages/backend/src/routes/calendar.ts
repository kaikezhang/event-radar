import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { eventOutcomes, events } from '../db/schema.js';
import { getScheduledReleases, loadCalendarConfig } from '../scanners/econ-calendar-scanner.js';
import { requireApiKey } from './auth-middleware.js';

const CalendarQuerySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
    tickers: { type: 'string' },
  },
} as const;

const EARNINGS_MATCH_PATTERNS = [
  '%earnings%',
  '%quarterly results%',
  '%revenue%',
  '%eps%',
] as const;

const CALENDAR_DB_SOURCES = [
  'sec-edgar',
  'earnings',
  'fda',
  'congress',
] as const;

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

interface CalendarQuery {
  from?: string;
  to?: string;
  tickers?: string;
}

interface CalendarRouteOptions {
  apiKey?: string;
}

interface CalendarEventItem {
  eventId: string;
  ticker: string | null;
  source: string;
  severity: string | null;
  title: string;
  reportDate: string;
  timeLabel: string | null;
  outcomeT5: number | null;
  historicalAvgMove: number | null;
}

interface CalendarDateGroup {
  date: string;
  events: CalendarEventItem[];
}

interface EarningsCandidateRow {
  eventId: string;
  ticker: string | null;
  source: string;
  severity: string | null;
  title: string;
  reportDate: string;
  timeLabel: string | null;
  outcomeT5: string | number | null;
}

interface HistoricalOutcomeRow {
  eventId: string;
  ticker: string | null;
  changeT5: string | number | null;
}

function normalizeDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function normalizePercent(value: string | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  // Outcome tracker stores values as fractional decimals (0.08 = 8%).
  // Always convert from fractional to percentage.
  const normalized = parsed * 100;
  return Number(normalized.toFixed(1));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(1));
}

function parseTickers(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
}

function buildKeywordMatch(): ReturnType<typeof sql> {
  return sql`(
    lower(${events.title}) LIKE ${EARNINGS_MATCH_PATTERNS[0]}
    OR lower(coalesce(${events.summary}, '')) LIKE ${EARNINGS_MATCH_PATTERNS[0]}
    OR lower(${events.title}) LIKE ${EARNINGS_MATCH_PATTERNS[1]}
    OR lower(coalesce(${events.summary}, '')) LIKE ${EARNINGS_MATCH_PATTERNS[1]}
    OR lower(${events.title}) LIKE ${EARNINGS_MATCH_PATTERNS[2]}
    OR lower(coalesce(${events.summary}, '')) LIKE ${EARNINGS_MATCH_PATTERNS[2]}
    OR lower(${events.title}) LIKE ${EARNINGS_MATCH_PATTERNS[3]}
    OR lower(coalesce(${events.summary}, '')) LIKE ${EARNINGS_MATCH_PATTERNS[3]}
  )`;
}

function buildEarningsMatchCondition(): ReturnType<typeof sql> {
  const keywordMatch = buildKeywordMatch();

  return sql`(
    ${inArray(events.source, [...CALENDAR_DB_SOURCES])}
    AND
    (
      (
        lower(${events.source}) = 'sec-edgar'
        AND (
          lower(coalesce(${events.eventType}, '')) LIKE '%2.02%'
          OR lower(coalesce(${events.metadata}->>'eventType', '')) LIKE '%2.02%'
          OR ${keywordMatch}
        )
      )
      OR lower(coalesce(${events.eventType}, '')) LIKE '%earnings%'
      OR ${keywordMatch}
    )
  )`;
}

function buildReportDateExpr() {
  return sql<string>`substr(
    coalesce(
      nullif(${events.metadata}->>'report_date', ''),
      nullif(${events.metadata}->>'reportDate', ''),
      nullif(${events.metadata}->>'earningsDate', ''),
      cast(${events.receivedAt} as text)
    ),
    1,
    10
  )`;
}

function buildTimeLabelExpr() {
  return sql<string | null>`coalesce(
    nullif(${events.metadata}->>'report_time', ''),
    nullif(${events.metadata}->>'reportTime', ''),
    nullif(${events.metadata}->>'marketSession', ''),
    nullif(${events.metadata}->>'haltTime', ''),
    nullif(${events.metadata}->>'resumeTime', '')
  )`;
}

function buildCalendarWindow(query: CalendarQuery): { from: string; to: string } {
  const now = new Date();
  const from = query.from ?? normalizeDate(now);

  if (query.to) {
    return { from, to: query.to };
  }

  const to = new Date(`${from}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 6);

  return {
    from,
    to: normalizeDate(to),
  };
}

async function fetchEarningsEvents(
  db: Database,
  query: CalendarQuery,
): Promise<CalendarEventItem[]> {
  const { from, to } = buildCalendarWindow(query);
  const tickers = parseTickers(query.tickers);
  const reportDateExpr = buildReportDateExpr();
  const timeLabelExpr = buildTimeLabelExpr();
  const filters = [
    buildEarningsMatchCondition(),
    sql`${reportDateExpr} >= ${from}`,
    sql`${reportDateExpr} <= ${to}`,
  ];

  if (tickers.length > 0) {
    filters.push(inArray(events.ticker, tickers));
  }

  const rows = await db
    .select({
      eventId: events.id,
      ticker: events.ticker,
      source: events.source,
      severity: events.severity,
      title: events.title,
      reportDate: reportDateExpr,
      timeLabel: timeLabelExpr,
      outcomeT5: eventOutcomes.changeT5,
    })
    .from(events)
    .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
    .where(and(...filters))
    .orderBy(reportDateExpr, desc(events.receivedAt));

  if (rows.length === 0) {
    return [];
  }

  const historicalRows = await db
    .select({
      eventId: events.id,
      ticker: events.ticker,
      changeT5: eventOutcomes.changeT5,
    })
    .from(events)
    .innerJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
    .where(buildEarningsMatchCondition());

  return (rows as EarningsCandidateRow[]).map((row) => {
    const tickerMoves = row.ticker
      ? (historicalRows as HistoricalOutcomeRow[])
        .filter((historicalRow) => historicalRow.ticker === row.ticker && historicalRow.eventId !== row.eventId)
        .map((historicalRow) => normalizePercent(historicalRow.changeT5))
        .filter((value): value is number => value != null)
        .map((value) => Math.abs(value))
      : [];
    const historicalAvgMove = average(tickerMoves);

    return {
      eventId: row.eventId,
      ticker: row.ticker,
      source: row.source,
      severity: row.severity,
      title: row.title,
      reportDate: row.reportDate,
      timeLabel: row.timeLabel,
      outcomeT5: normalizePercent(row.outcomeT5),
      historicalAvgMove,
    };
  });
}

async function fetchActiveHalts(
  db: Database,
  query: CalendarQuery,
): Promise<CalendarEventItem[]> {
  const { from, to } = buildCalendarWindow(query);
  const tickers = parseTickers(query.tickers);
  const dateExpr = sql<string>`substr(cast(${events.receivedAt} as text), 1, 10)`;
  const timeLabelExpr = buildTimeLabelExpr();
  const dedupKeyExpr = sql<string | null>`nullif(${events.metadata}->>'dedupKey', '')`;
  const filters = [
    eq(events.source, 'trading-halt'),
    eq(events.eventType, 'halt'),
    sql`${dateExpr} >= ${from}`,
    sql`${dateExpr} <= ${to}`,
  ];

  if (tickers.length > 0) {
    filters.push(inArray(events.ticker, tickers));
  }

  const [halts, resumes] = await Promise.all([
    db
      .select({
        eventId: events.id,
        ticker: events.ticker,
        source: events.source,
        severity: events.severity,
        title: events.title,
        reportDate: dateExpr,
        timeLabel: timeLabelExpr,
        dedupKey: dedupKeyExpr,
      })
      .from(events)
      .where(and(...filters))
      .orderBy(desc(events.receivedAt)),
    db
      .select({
        dedupKey: dedupKeyExpr,
      })
      .from(events)
      .where(and(
        eq(events.source, 'trading-halt'),
        eq(events.eventType, 'resume'),
        sql`${dateExpr} >= ${from}`,
        sql`${dateExpr} <= ${to}`,
      )),
  ]);

  const resumedDedupKeys = new Set(
    resumes
      .map((row) => row.dedupKey)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );

  return halts
    .filter((row) => !row.dedupKey || !resumedDedupKeys.has(row.dedupKey))
    .map((row) => ({
      eventId: row.eventId,
      ticker: row.ticker,
      source: row.source,
      severity: row.severity,
      title: row.title,
      reportDate: row.reportDate,
      timeLabel: row.timeLabel,
      outcomeT5: null,
      historicalAvgMove: null,
    }));
}

function fetchEconomicCalendar(query: CalendarQuery): CalendarEventItem[] {
  const { from, to } = buildCalendarWindow(query);
  const releases = getScheduledReleases(loadCalendarConfig());

  return releases
    .filter((release) => {
      const releaseDate = normalizeDate(release.scheduledTime);
      return releaseDate >= from && releaseDate <= to;
    })
    .map((release) => ({
      eventId: `econ-${release.releaseKey}`,
      ticker: null,
      source: 'econ-calendar',
      severity: release.indicator.severity,
      title: release.indicator.name,
      reportDate: normalizeDate(release.scheduledTime),
      timeLabel: `${release.indicator.releaseTime} ET`,
      outcomeT5: null,
      historicalAvgMove: null,
    }));
}

function groupByDate(eventsToGroup: CalendarEventItem[]): CalendarDateGroup[] {
  const groups = new Map<string, CalendarEventItem[]>();

  for (const event of eventsToGroup) {
    const bucket = groups.get(event.reportDate) ?? [];
    bucket.push(event);
    groups.set(event.reportDate, bucket);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedEvents]) => ({
      date,
      events: groupedEvents.sort((left, right) => {
        const severityDiff =
          (SEVERITY_RANK[right.severity ?? ''] ?? 0)
          - (SEVERITY_RANK[left.severity ?? ''] ?? 0);

        if (severityDiff !== 0) {
          return severityDiff;
        }

        return left.title.localeCompare(right.title);
      }),
    }));
}

function earningsDataLimited(): boolean {
  return process.env.EARNINGS_ENABLED !== 'true';
}

export function registerCalendarRoutes(
  server: FastifyInstance,
  db: Database,
  options?: CalendarRouteOptions,
): void {
  server.get('/api/v1/calendar/earnings', {
    schema: {
      querystring: CalendarQuerySchema,
    },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as CalendarQuery;
    const items = await fetchEarningsEvents(db, query);

    return {
      earningsDataLimited: earningsDataLimited(),
      events: items,
    };
  });

  server.get('/api/v1/calendar/upcoming', {
    schema: {
      querystring: CalendarQuerySchema,
    },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as CalendarQuery;
    const [earnings, halts] = await Promise.all([
      fetchEarningsEvents(db, query),
      fetchActiveHalts(db, query),
    ]);
    const economic = fetchEconomicCalendar(query);

    return {
      earningsDataLimited: earningsDataLimited(),
      dates: groupByDate([...earnings, ...economic, ...halts]),
    };
  });
}
