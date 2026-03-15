import { eq } from 'drizzle-orm';
import {
  AccuracyDirectionSchema,
  ClassificationMethodSchema,
  ConfidenceLevelSchema,
  LLMEnrichmentSchema,
  deriveConfidenceLevel,
  type AccuracyDirection,
} from '@event-radar/shared';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import {
  classificationPredictions,
  events,
  eventOutcomes,
} from '../db/schema.js';

const DirectionVerdictSchema = z.enum(['correct', 'incorrect', 'unclear']);
const SetupVerdictSchema = z.enum(['worked', 'failed', 'insufficient-data']);
const VerdictWindowSchema = z.enum(['T+5', 'T+20']);

const ScorecardWindowSchema = z.object({
  price: z.number().nullable(),
  movePercent: z.number().nullable(),
  evaluatedAt: z.string().datetime().nullable(),
});

const ScorecardThesisSchema = z.object({
  impact: z.string().nullable(),
  whyNow: z.string().nullable(),
  currentSetup: z.string().nullable(),
  historicalContext: z.string().nullable(),
  risks: z.string().nullable(),
});

const OriginalAlertSchema = z.object({
  actionLabel: z.string().nullable(),
  direction: AccuracyDirectionSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  confidenceBucket: ConfidenceLevelSchema.nullable(),
  classifiedBy: ClassificationMethodSchema.nullable(),
  classifiedAt: z.string().datetime().nullable(),
  summary: z.string().nullable(),
  thesis: ScorecardThesisSchema,
});

const ScorecardOutcomeSchema = z.object({
  entryPrice: z.number().nullable(),
  tPlus5: ScorecardWindowSchema,
  tPlus20: ScorecardWindowSchema,
  directionVerdict: DirectionVerdictSchema,
  setupVerdict: SetupVerdictSchema,
});

const ScorecardNotesSchema = z.object({
  summary: z.string(),
  items: z.array(z.string()),
  verdictWindow: VerdictWindowSchema.nullable(),
});

export const AlertScorecardSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string(),
  ticker: z.string().nullable(),
  source: z.string(),
  eventTimestamp: z.string().datetime(),
  originalAlert: OriginalAlertSchema,
  outcome: ScorecardOutcomeSchema,
  notes: ScorecardNotesSchema,
});

export type AlertScorecard = z.infer<typeof AlertScorecardSchema>;

interface ScorecardQueryRow {
  eventId: string;
  title: string;
  source: string;
  summary: string | null;
  metadata: unknown;
  receivedAt: Date;
  eventTime: Date | null;
  outcomeTicker: string | null;
  eventPrice: string | null;
  priceT5: string | null;
  changeT5: string | null;
  evaluatedT5At: Date | null;
  priceT20: string | null;
  changeT20: string | null;
  evaluatedT20At: Date | null;
  predictedDirection: string | null;
  predictionConfidence: string | null;
  classifiedBy: string | null;
  classifiedAt: Date | null;
}

export class AlertScorecardService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getScorecard(eventId: string): Promise<AlertScorecard | null> {
    const [row] = await this.db
      .select({
        eventId: events.id,
        title: events.title,
        source: events.source,
        summary: events.summary,
        metadata: events.metadata,
        receivedAt: events.receivedAt,
        eventTime: eventOutcomes.eventTime,
        outcomeTicker: eventOutcomes.ticker,
        eventPrice: eventOutcomes.eventPrice,
        priceT5: eventOutcomes.priceT5,
        changeT5: eventOutcomes.changeT5,
        evaluatedT5At: eventOutcomes.evaluatedT5At,
        priceT20: eventOutcomes.priceT20,
        changeT20: eventOutcomes.changeT20,
        evaluatedT20At: eventOutcomes.evaluatedT20At,
        predictedDirection: classificationPredictions.predictedDirection,
        predictionConfidence: classificationPredictions.confidence,
        classifiedBy: classificationPredictions.classifiedBy,
        classifiedAt: classificationPredictions.classifiedAt,
      })
      .from(events)
      .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
      .leftJoin(
        classificationPredictions,
        eq(classificationPredictions.eventId, events.id),
      )
      .where(eq(events.id, eventId))
      .limit(1);

    if (!row) {
      return null;
    }

    return AlertScorecardSchema.parse(this.toScorecard(row));
  }

  private toScorecard(row: ScorecardQueryRow): AlertScorecard {
    const metadata = asRecord(row.metadata);
    const enrichment = getEnrichment(metadata?.['llm_enrichment']);
    const direction = this.getDirection(row, metadata, enrichment);
    const confidence = toNumber(row.predictionConfidence);
    const confidenceBucket =
      confidence != null ? deriveConfidenceLevel(confidence) : null;
    const selectedWindow = selectVerdictWindow(
      toNumber(row.changeT5),
      toNumber(row.changeT20),
    );
    const directionVerdict = this.buildDirectionVerdict(
      direction,
      selectedWindow?.movePercent ?? null,
    );
    const setupVerdict = this.buildSetupVerdict(
      direction,
      selectedWindow?.movePercent ?? null,
    );

    return {
      eventId: row.eventId,
      title: row.title,
      ticker: row.outcomeTicker ?? extractTicker(metadata, enrichment),
      source: row.source,
      eventTimestamp: (row.eventTime ?? row.receivedAt).toISOString(),
      originalAlert: {
        actionLabel: enrichment?.action ?? null,
        direction,
        confidence,
        confidenceBucket,
        classifiedBy: parseClassificationMethod(row.classifiedBy),
        classifiedAt: row.classifiedAt?.toISOString() ?? null,
        summary: enrichment?.summary ?? row.summary ?? null,
        thesis: {
          impact: enrichment?.impact ?? null,
          whyNow: enrichment?.whyNow ?? null,
          currentSetup: enrichment?.currentSetup ?? null,
          historicalContext: enrichment?.historicalContext ?? null,
          risks: enrichment?.risks ?? null,
        },
      },
      outcome: {
        entryPrice: toNumber(row.eventPrice),
        tPlus5: {
          price: toNumber(row.priceT5),
          movePercent: toNumber(row.changeT5),
          evaluatedAt: row.evaluatedT5At?.toISOString() ?? null,
        },
        tPlus20: {
          price: toNumber(row.priceT20),
          movePercent: toNumber(row.changeT20),
          evaluatedAt: row.evaluatedT20At?.toISOString() ?? null,
        },
        directionVerdict,
        setupVerdict,
      },
      notes: this.buildNotes({
        direction,
        selectedWindow,
        directionVerdict,
        setupVerdict,
        actionLabel: enrichment?.action ?? null,
        confidenceBucket,
      }),
    };
  }

  private getDirection(
    row: ScorecardQueryRow,
    metadata: Record<string, unknown> | null,
    enrichment: z.infer<typeof LLMEnrichmentSchema> | null,
  ): AccuracyDirection | null {
    return (
      normalizeDirection(row.predictedDirection)
      ?? normalizeDirection(metadata?.['direction'])
      ?? normalizeDirection(enrichment?.tickers[0]?.direction)
    );
  }

  private buildDirectionVerdict(
    direction: AccuracyDirection | null,
    movePercent: number | null,
  ): z.infer<typeof DirectionVerdictSchema> {
    if (direction == null || direction === 'neutral' || movePercent == null) {
      return 'unclear';
    }

    if (direction === 'bullish') {
      return movePercent > 0 ? 'correct' : 'incorrect';
    }

    return movePercent < 0 ? 'correct' : 'incorrect';
  }

  private buildSetupVerdict(
    direction: AccuracyDirection | null,
    movePercent: number | null,
  ): z.infer<typeof SetupVerdictSchema> {
    if (direction == null || direction === 'neutral' || movePercent == null) {
      return 'insufficient-data';
    }

    if (direction === 'bullish') {
      return movePercent > 0 ? 'worked' : 'failed';
    }

    return movePercent < 0 ? 'worked' : 'failed';
  }

  private buildNotes(input: {
    direction: AccuracyDirection | null;
    selectedWindow: SelectedWindow | null;
    directionVerdict: z.infer<typeof DirectionVerdictSchema>;
    setupVerdict: z.infer<typeof SetupVerdictSchema>;
    actionLabel: string | null;
    confidenceBucket: z.infer<typeof ConfidenceLevelSchema> | null;
  }): z.infer<typeof ScorecardNotesSchema> {
    const { direction, selectedWindow, directionVerdict, actionLabel, confidenceBucket } = input;
    const items: string[] = [];

    if (selectedWindow == null) {
      items.push('T+5 and T+20 price moves are not available yet.');
    } else if (selectedWindow.label === 'T+20') {
      items.push('Used T+20 as the primary verdict window.');
    } else {
      items.push('Used T+5 because T+20 is not available yet.');
    }

    if (actionLabel) {
      items.push(`Original action label: ${actionLabel}.`);
    }
    if (confidenceBucket) {
      items.push(`Confidence bucket: ${confidenceBucket}.`);
    }

    if (selectedWindow == null) {
      return {
        summary: 'Outcome tracking has not produced a usable T+5 or T+20 move yet.',
        items,
        verdictWindow: null,
      };
    }

    if (direction == null || direction === 'neutral') {
      return {
        summary: 'No directional setup was captured for this alert.',
        items,
        verdictWindow: selectedWindow.label,
      };
    }

    return {
      summary:
        directionVerdict === 'correct'
          ? `${capitalize(direction)} setup matched the ${selectedWindow.label} move (${formatMove(selectedWindow.movePercent)}).`
          : `${capitalize(direction)} setup did not match the ${selectedWindow.label} move (${formatMove(selectedWindow.movePercent)}).`,
      items,
      verdictWindow: selectedWindow.label,
    };
  }
}

interface SelectedWindow {
  label: z.infer<typeof VerdictWindowSchema>;
  movePercent: number;
}

function selectVerdictWindow(
  changeT5: number | null,
  changeT20: number | null,
): SelectedWindow | null {
  if (changeT20 != null) {
    return { label: 'T+20', movePercent: changeT20 };
  }

  if (changeT5 != null) {
    return { label: 'T+5', movePercent: changeT5 };
  }

  return null;
}

function parseClassificationMethod(
  value: string | null,
): z.infer<typeof ClassificationMethodSchema> | null {
  const parsed = ClassificationMethodSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function getEnrichment(
  value: unknown,
): z.infer<typeof LLMEnrichmentSchema> | null {
  const parsed = LLMEnrichmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeDirection(value: unknown): AccuracyDirection | null {
  if (typeof value !== 'string') {
    return null;
  }

  const lowered = value.trim().toLowerCase();
  const parsed = AccuracyDirectionSchema.safeParse(lowered);
  return parsed.success ? parsed.data : null;
}

function extractTicker(
  metadata: Record<string, unknown> | null,
  enrichment: z.infer<typeof LLMEnrichmentSchema> | null,
): string | null {
  const directTicker = metadata?.['ticker'];
  if (typeof directTicker === 'string' && directTicker.trim().length > 0) {
    return directTicker.trim().toUpperCase();
  }

  const tickers = metadata?.['tickers'];
  if (Array.isArray(tickers)) {
    const first = tickers.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof first === 'string') {
      return first.trim().toUpperCase();
    }
  }

  const enrichmentTicker = enrichment?.tickers[0]?.symbol;
  return typeof enrichmentTicker === 'string' && enrichmentTicker.trim().length > 0
    ? enrichmentTicker.trim().toUpperCase()
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function toNumber(value: string | number | null): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMove(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
