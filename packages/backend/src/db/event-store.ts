import { eq, sql } from 'drizzle-orm';
import { events } from './schema.js';
import type { RawEvent, Severity } from '@event-radar/shared';
import type { Database } from './connection.js';

export interface StoreEventInput {
  event: RawEvent;
  severity?: Severity;
  ticker?: string;
  classification?: string;
  classificationConfidence?: number;
  eventType?: string;
}

const CONFIRMATION_WINDOW_MS = 30 * 60 * 1000;

interface ConfirmationCandidateRow {
  id: string;
  source: string;
  confirmed_sources: unknown;
  merged_from: unknown;
  source_urls: unknown;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTicker(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized?.toUpperCase();
}

function normalizeClassification(value: unknown): 'BULLISH' | 'BEARISH' | 'NEUTRAL' | undefined {
  const normalized = normalizeString(value)?.toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'MIXED') {
    return 'NEUTRAL';
  }

  if (normalized === 'BULLISH' || normalized === 'BEARISH' || normalized === 'NEUTRAL') {
    return normalized;
  }

  return undefined;
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }

  return undefined;
}

function readMetadataField(
  metadata: Record<string, unknown> | undefined,
  key: string,
): unknown {
  if (!metadata) {
    return undefined;
  }

  return metadata[key];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => item.replace(/^"|"$/g, '').trim())
      .filter((item) => item.length > 0);
  }

  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return value;
          }
        })()
      : value;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export async function storeEvent(
  db: Database,
  input: StoreEventInput,
): Promise<string> {
  const { event, severity } = input;
  const ticker = normalizeTicker(input.ticker ?? event.metadata?.['ticker']);
  const metadata: Record<string, unknown> = { ...(event.metadata ?? {}) };
  const eventType = normalizeString(input.eventType ?? event.metadata?.['eventType']);
  const llmJudge = readMetadataField(metadata, 'llm_judge');
  const llmJudgeRecord =
    llmJudge && typeof llmJudge === 'object'
      ? llmJudge as Record<string, unknown>
      : undefined;
  const classification = normalizeClassification(
    input.classification
    ?? readMetadataField(metadata, 'classification')
    ?? readMetadataField(llmJudgeRecord, 'direction'),
  );
  const classificationConfidence = normalizeConfidence(
    input.classificationConfidence
    ?? readMetadataField(metadata, 'classificationConfidence')
    ?? readMetadataField(llmJudgeRecord, 'confidence'),
  );

  if (ticker) {
    metadata['ticker'] = ticker;
  }
  if (eventType) {
    metadata['eventType'] = eventType;
  }

  event.metadata = metadata;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(events)
      .values({
        source: event.source,
        sourceEventId: event.id,
        ticker: ticker ?? null,
        classification: classification ?? null,
        classificationConfidence:
          classificationConfidence != null ? String(classificationConfidence) : null,
        eventType: eventType ?? null,
        title: event.title,
        summary: event.body,
        rawPayload: { ...event, metadata } as unknown as Record<string, unknown>,
        metadata,
        severity: severity ?? null,
        receivedAt: event.timestamp,
        sourceUrls: event.url ? [event.url] : null,
        confirmedSources: [event.source],
        confirmationCount: 1,
      })
      .returning({ id: events.id, createdAt: events.createdAt });

    if (!ticker || !eventType) {
      return row.id;
    }

    const windowStart = new Date(row.createdAt.getTime() - CONFIRMATION_WINDOW_MS);
    const candidateResult = await tx.execute(sql`
      SELECT
        id,
        source,
        confirmed_sources,
        merged_from,
        source_urls
      FROM events
      WHERE ticker = ${ticker}
        AND event_type = ${eventType}
        AND id <> ${row.id}
        AND created_at >= ${windowStart}
        AND created_at <= ${row.createdAt}
      ORDER BY created_at ASC, received_at ASC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    const candidate = (candidateResult as unknown as { rows?: ConfirmationCandidateRow[] }).rows?.[0];

    if (!candidate) {
      return row.id;
    }

    const updatedSources = [...new Set([
      candidate.source,
      ...toStringArray(candidate.confirmed_sources),
      event.source,
    ])];
    const updatedMergedFrom = [...new Set([
      ...toStringArray(candidate.merged_from),
      row.id,
    ])];
    const updatedSourceUrls = [...new Set([
      ...toStringArray(candidate.source_urls),
      ...(event.url ? [event.url] : []),
    ])];
    const confirmationCount = updatedSources.length;

    await tx
      .update(events)
      .set({
        confirmedSources: updatedSources,
        confirmationCount,
        mergedFrom: updatedMergedFrom,
        sourceUrls: updatedSourceUrls.length > 0 ? updatedSourceUrls : null,
      })
      .where(eq(events.id, candidate.id));

    event.metadata = {
      ...metadata,
      confirmationCount,
      confirmedSources: updatedSources,
      confirmedEventId: candidate.id,
    };

    await tx
      .update(events)
      .set({
        metadata: event.metadata,
      })
      .where(eq(events.id, row.id));

    return row.id;
  });
}
