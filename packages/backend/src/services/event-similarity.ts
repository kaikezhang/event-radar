import { sql, and, gte, lte } from 'drizzle-orm';
import { events } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type {
  SimilarityOptions,
  SimilarityScore,
  SimilarEvent,
} from '@event-radar/shared';

const DEFAULT_OPTIONS: Required<SimilarityOptions> = {
  maxResults: 10,
  timeWindowMinutes: 60,
  minScore: 0.5,
  sameTickerOnly: false,
};

const WEIGHTS = {
  ticker: 0.4,
  time: 0.3,
  content: 0.3,
} as const;

// Common English stopwords to exclude from content similarity
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'nor',
  'as', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'above',
  'after', 'again', 'all', 'also', 'am', 'any', 'because', 'before',
  'between', 'both', 'each', 'few', 'he', 'her', 'here', 'him', 'his',
  'how', 'i', 'into', 'me', 'more', 'most', 'my', 'new', 'now', 'only',
  'other', 'our', 'out', 'over', 'own', 'same', 'she', 'so', 'some',
  'such', 'there', 'they', 'their', 'them', 'through', 'under', 'up',
  'us', 'we', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'you', 'your',
]);

/** Extract tickers from event metadata */
export function extractTickers(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const md = metadata as Record<string, unknown>;
  if (typeof md.ticker === 'string') return [md.ticker.toUpperCase()];
  if (Array.isArray(md.tickers)) {
    return md.tickers.filter((t): t is string => typeof t === 'string')
      .map((t) => t.toUpperCase());
  }
  return [];
}

/** Tokenize text into keywords, removing stopwords */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Time proximity score: exponential decay based on minutes difference */
export function timeProximityScore(
  timeA: Date,
  timeB: Date,
  halfLifeMinutes = 30,
): number {
  const diffMs = Math.abs(timeA.getTime() - timeB.getTime());
  const diffMinutes = diffMs / (1000 * 60);
  // Exponential decay: score = e^(-λt) where λ = ln(2)/halfLife
  const lambda = Math.LN2 / halfLifeMinutes;
  return Math.exp(-lambda * diffMinutes);
}

/** Compute pairwise similarity between two events */
export function computeSimilarity(
  eventA: EventRow,
  eventB: EventRow,
): SimilarityScore {
  // Ticker similarity (Jaccard index)
  const tickersA = extractTickers(eventA.metadata);
  const tickersB = extractTickers(eventB.metadata);
  const tickerScore = jaccardSimilarity(tickersA, tickersB);

  // Time proximity (exponential decay)
  const timeScore = timeProximityScore(eventA.receivedAt, eventB.receivedAt);

  // Content similarity (Jaccard on keywords from title + summary)
  const textA = [eventA.title, eventA.summary ?? ''].join(' ');
  const textB = [eventB.title, eventB.summary ?? ''].join(' ');
  const keywordsA = extractKeywords(textA);
  const keywordsB = extractKeywords(textB);
  const contentScore = jaccardSimilarity(keywordsA, keywordsB);

  // Weighted composite
  const composite =
    WEIGHTS.ticker * tickerScore +
    WEIGHTS.time * timeScore +
    WEIGHTS.content * contentScore;

  return { composite, ticker: tickerScore, time: timeScore, content: contentScore };
}

interface EventRow {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  rawPayload: unknown;
  metadata: unknown;
  severity: string | null;
  receivedAt: Date;
  createdAt: Date;
}

/** Find similar events for a given event ID */
export async function findSimilarEvents(
  db: Database,
  eventId: string,
  options?: Partial<SimilarityOptions>,
): Promise<SimilarEvent[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get the source event
  const [sourceEvent] = await db
    .select()
    .from(events)
    .where(sql`${events.id} = ${eventId}`)
    .limit(1);

  if (!sourceEvent) {
    return [];
  }

  // Build time window
  const windowStart = new Date(
    sourceEvent.receivedAt.getTime() - opts.timeWindowMinutes * 60 * 1000,
  );
  const windowEnd = new Date(
    sourceEvent.receivedAt.getTime() + opts.timeWindowMinutes * 60 * 1000,
  );

  // Build query conditions
  const conditions = [
    sql`${events.id} != ${eventId}`,
    gte(events.receivedAt, windowStart),
    lte(events.receivedAt, windowEnd),
  ];

  // If sameTickerOnly, filter by ticker in metadata
  if (opts.sameTickerOnly) {
    const tickers = extractTickers(sourceEvent.metadata);
    if (tickers.length === 0) return [];
    // Filter events that have any of the same tickers
    const tickerConditions = tickers.map(
      (t) => sql`${events.metadata}->>'ticker' = ${t}`,
    );
    if (tickerConditions.length === 1) {
      conditions.push(tickerConditions[0]);
    } else {
      conditions.push(sql`(${sql.join(tickerConditions, sql` OR `)})`);
    }
  }

  // Fetch candidate events within the time window
  const candidates = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(sql`${events.receivedAt} DESC`)
    .limit(200); // Fetch more than needed; we'll score and filter

  // Score each candidate
  const scored: SimilarEvent[] = [];
  for (const candidate of candidates) {
    const score = computeSimilarity(sourceEvent, candidate);
    if (score.composite >= opts.minScore) {
      scored.push({
        eventId: candidate.id,
        score: score.composite,
        tickerScore: score.ticker,
        timeScore: score.time,
        contentScore: score.content,
        event: candidate as unknown as Record<string, unknown>,
      });
    }
  }

  // Sort by composite score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.maxResults);
}
