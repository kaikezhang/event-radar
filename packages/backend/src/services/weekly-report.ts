import { and, eq, gte, lt, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { events, eventOutcomes } from '../db/schema.js';
import { toNumber } from './scorecard-semantics.js';

const EXCLUDED_SOURCES = ['dummy', 'test', 'internal'];
const DAY_MS = 24 * 60 * 60 * 1000;

const WeeklyReportItemSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string(),
  ticker: z.string().nullable(),
  source: z.string(),
  severity: z.string().nullable(),
  movePercent: z.number(),
});

const WeeklyReportSourceRowSchema = z.object({
  source: z.string(),
  events: z.number().int().nonnegative(),
  setupWorkedRate: z.number().min(0).max(1).nullable(),
  avgT5Move: z.number().nullable(),
});

export const WeeklyReportSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  headline: z.string(),
  summary: z.object({
    eventsDetected: z.number().int().nonnegative(),
    sourcesMonitored: z.number().int().nonnegative(),
    highOrCriticalEvents: z.number().int().nonnegative(),
    eventsWithPriceOutcomes: z.number().int().nonnegative(),
  }),
  topSignals: z.array(WeeklyReportItemSchema),
  worstSignals: z.array(WeeklyReportItemSchema),
  sourceLeaderboard: z.array(WeeklyReportSourceRowSchema),
  insight: z.string(),
  markdown: z.string(),
});

export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;

interface WeeklyReportRow {
  eventId: string;
  source: string;
  title: string;
  ticker: string | null;
  severity: string | null;
  changeT5: string | null;
}

export class WeeklyReportService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async generateWeeklyReport(date: string): Promise<WeeklyReport> {
    const periodEnd = new Date(`${date}T00:00:00.000Z`);
    const nextDay = new Date(periodEnd.getTime() + DAY_MS);
    const periodStart = new Date(periodEnd.getTime() - 6 * DAY_MS);

    const rows = await this.db
      .select({
        eventId: events.id,
        source: events.source,
        title: events.title,
        ticker: events.ticker,
        severity: events.severity,
        changeT5: eventOutcomes.changeT5,
      })
      .from(events)
      .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
      .where(and(
        gte(events.createdAt, periodStart),
        lt(events.createdAt, nextDay),
        notInArray(events.source, EXCLUDED_SOURCES),
      ));

    const normalizedRows = rows.map((row) => ({
      ...row,
      movePercent: toNumber(row.changeT5),
    }));

    const summary = {
      eventsDetected: normalizedRows.length,
      sourcesMonitored: new Set(normalizedRows.map((row) => row.source)).size,
      highOrCriticalEvents: normalizedRows.filter((row) =>
        row.severity === 'HIGH' || row.severity === 'CRITICAL').length,
      eventsWithPriceOutcomes: normalizedRows.filter((row) => row.movePercent != null).length,
    };

    const rowsWithOutcomes = normalizedRows.filter((row) => row.movePercent != null);
    const topSignals = rowsWithOutcomes
      .slice()
      .sort((left, right) => (right.movePercent ?? 0) - (left.movePercent ?? 0))
      .slice(0, 3)
      .map((row) => WeeklyReportItemSchema.parse({
        eventId: row.eventId,
        title: row.title,
        ticker: row.ticker,
        source: row.source,
        severity: row.severity,
        movePercent: row.movePercent ?? 0,
      }));
    const worstSignals = rowsWithOutcomes
      .slice()
      .sort((left, right) => (left.movePercent ?? 0) - (right.movePercent ?? 0))
      .slice(0, 3)
      .map((row) => WeeklyReportItemSchema.parse({
        eventId: row.eventId,
        title: row.title,
        ticker: row.ticker,
        source: row.source,
        severity: row.severity,
        movePercent: row.movePercent ?? 0,
      }));

    const sourceLeaderboard = [...groupBySource(normalizedRows).entries()]
      .map(([source, sourceRows]) => {
        const outcomeMoves = sourceRows
          .map((row) => row.movePercent)
          .filter((value): value is number => value != null);
        const setupWorkedCount = outcomeMoves.filter((value) => Math.abs(value) >= 5).length;
        const avgT5Move = outcomeMoves.length > 0
          ? round(outcomeMoves.reduce((sum, value) => sum + value, 0) / outcomeMoves.length, 1)
          : null;

        return WeeklyReportSourceRowSchema.parse({
          source,
          events: sourceRows.length,
          setupWorkedRate: outcomeMoves.length > 0
            ? round(setupWorkedCount / outcomeMoves.length, 4)
            : null,
          avgT5Move,
        });
      })
      .sort((left, right) =>
        (right.setupWorkedRate ?? -1) - (left.setupWorkedRate ?? -1)
        || right.events - left.events
        || (right.avgT5Move ?? -Infinity) - (left.avgT5Move ?? -Infinity)
        || left.source.localeCompare(right.source));

    const headline = `Event Radar Weekly Scorecard — Week of ${formatWeekRange(periodStart, periodEnd)}`;
    const insight = buildInsight(sourceLeaderboard);
    const report = {
      periodStart: toDateKey(periodStart),
      periodEnd: toDateKey(periodEnd),
      headline,
      summary,
      topSignals,
      worstSignals,
      sourceLeaderboard,
      insight,
      markdown: buildMarkdown({
        headline,
        summary,
        topSignals,
        worstSignals,
        sourceLeaderboard,
        insight,
      }),
    };

    return WeeklyReportSchema.parse(report);
  }
}

function groupBySource(rows: Array<WeeklyReportRow & { movePercent: number | null }>) {
  const grouped = new Map<string, Array<WeeklyReportRow & { movePercent: number | null }>>();

  for (const row of rows) {
    const current = grouped.get(row.source) ?? [];
    current.push(row);
    grouped.set(row.source, current);
  }

  return grouped;
}

function buildInsight(sourceLeaderboard: WeeklyReport['sourceLeaderboard']): string {
  const topSource = sourceLeaderboard[0];
  if (!topSource) {
    return 'No reportable events landed in this window, so no source-level insight is available yet.';
  }

  const rate = formatRate(topSource.setupWorkedRate);
  const avgMove = topSource.avgT5Move == null ? 'n/a' : formatSignedPercent(topSource.avgT5Move);

  return `${topSource.source} led the board with a ${rate} setup-worked rate and an average T+5 move of ${avgMove}.`;
}

function buildMarkdown(input: {
  headline: string;
  summary: WeeklyReport['summary'];
  topSignals: WeeklyReport['topSignals'];
  worstSignals: WeeklyReport['worstSignals'];
  sourceLeaderboard: WeeklyReport['sourceLeaderboard'];
  insight: string;
}): string {
  const topSignals = input.topSignals.length > 0
    ? input.topSignals.map((item, index) =>
      `${index + 1}. 🏆 ${item.title}${item.ticker ? ` (${item.ticker})` : ''} — ${formatSignedPercent(item.movePercent)} in 5 days (${item.severity ?? 'UNKNOWN'})`)
    : ['1. No top-performing signals with T+5 outcomes yet'];

  const worstSignals = input.worstSignals.length > 0
    ? input.worstSignals.map((item, index) =>
      `${index + 1}. ❌ ${item.title}${item.ticker ? ` (${item.ticker})` : ''} — ${formatSignedPercent(item.movePercent)} (${item.severity ?? 'UNKNOWN'})`)
    : ['1. No worst calls with T+5 outcomes yet'];

  const sourceRows = input.sourceLeaderboard.length > 0
    ? input.sourceLeaderboard.map((row) =>
      `| ${row.source} | ${row.events} | ${formatRate(row.setupWorkedRate)} | ${row.avgT5Move == null ? 'n/a' : formatAbsolutePercent(row.avgT5Move)} |`)
    : ['| none | 0 | n/a | n/a |'];

  return [
    `# ${input.headline}`,
    '',
    '## Summary',
    `- **Events Detected:** ${input.summary.eventsDetected.toLocaleString()} (across ${input.summary.sourcesMonitored} sources)`,
    `- **HIGH/CRITICAL Events:** ${input.summary.highOrCriticalEvents.toLocaleString()}`,
    `- **Events with Price Outcomes:** ${input.summary.eventsWithPriceOutcomes.toLocaleString()}`,
    '',
    '## Top Performing Signals',
    ...topSignals,
    '',
    '## Worst Calls',
    ...worstSignals,
    '',
    '## Source Leaderboard',
    '| Source | Events | Setup Worked % | Avg T+5 Move |',
    '|--------|--------|----------------|--------------|',
    ...sourceRows,
    '',
    '## This Week\'s Insight',
    `"${input.insight}"`,
  ].join('\n');
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatWeekRange(periodStart: Date, periodEnd: Date): string {
  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const yearFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'UTC',
  });

  const startMonth = monthFormatter.format(periodStart);
  const endMonth = monthFormatter.format(periodEnd);
  const startDay = periodStart.getUTCDate();
  const endDay = periodEnd.getUTCDate();
  const year = yearFormatter.format(periodEnd);

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  }

  return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
}

function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatAbsolutePercent(value: number): string {
  return `±${Math.abs(value).toFixed(1)}%`;
}

function formatRate(value: number | null): string {
  if (value == null) {
    return 'n/a';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
