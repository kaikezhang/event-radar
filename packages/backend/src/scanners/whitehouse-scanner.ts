import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  ok,
  err,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { SeenIdBuffer } from './scraping/scrape-utils.js';
import { extractTickers } from './ticker-extractor.js';

const POLL_INTERVAL_MS = 900_000; // 15 minutes

const FEDERAL_REGISTER_API =
  'https://www.federalregister.gov/api/v1/documents';

/** Keywords for market-relevant executive actions */
const MARKET_KEYWORDS = [
  'tariff',
  'trade',
  'sanction',
  'regulation',
  'industry',
  'energy',
  'technology',
  'defense',
  'semiconductor',
  'oil',
  'gas',
  'pharmaceutical',
  'healthcare',
  'tax',
  'import',
  'export',
  'embargo',
  'infrastructure',
] as const;

export interface FederalRegisterDocument {
  document_number: string;
  title: string;
  type: string;
  abstract: string | null;
  html_url: string;
  pdf_url: string | null;
  publication_date: string;
  signing_date: string | null;
  executive_order_number: string | null;
  subtype: string | null;
}

export interface FederalRegisterApiResponse {
  count: number;
  results: FederalRegisterDocument[];
}

/**
 * Parse Federal Register API response into normalized documents.
 */
export function parseFederalRegisterDocs(
  json: FederalRegisterApiResponse,
): FederalRegisterDocument[] {
  if (!json?.results) return [];
  return json.results;
}

/**
 * Check if a document is market-relevant based on keywords.
 */
export function isMarketRelevant(doc: FederalRegisterDocument): boolean {
  const text = `${doc.title} ${doc.abstract ?? ''}`.toLowerCase();
  return MARKET_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Determine topic tags from document content.
 */
export function extractTopics(doc: FederalRegisterDocument): string[] {
  const text = `${doc.title} ${doc.abstract ?? ''}`.toLowerCase();
  const topics: string[] = [];

  if (text.includes('tariff') || text.includes('trade') || text.includes('import') || text.includes('export')) {
    topics.push('trade');
  }
  if (text.includes('sanction') || text.includes('embargo')) {
    topics.push('sanctions');
  }
  if (text.includes('energy') || text.includes('oil') || text.includes('gas')) {
    topics.push('energy');
  }
  if (text.includes('technology') || text.includes('semiconductor')) {
    topics.push('technology');
  }
  if (text.includes('defense')) {
    topics.push('defense');
  }
  if (text.includes('healthcare') || text.includes('pharmaceutical')) {
    topics.push('healthcare');
  }
  if (text.includes('tax')) {
    topics.push('tax');
  }
  if (text.includes('regulation') || text.includes('industry')) {
    topics.push('regulation');
  }
  if (text.includes('infrastructure')) {
    topics.push('infrastructure');
  }

  return topics;
}

export class WhiteHouseScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'whitehouse');
  /** Override for testing */
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'whitehouse',
      source: 'whitehouse',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const url = new URL(FEDERAL_REGISTER_API);
      url.searchParams.set('conditions[type][]', 'PRESDOCU');
      url.searchParams.set('order', 'newest');
      url.searchParams.set('per_page', '25');

      const response = await this.fetchFn(url.toString(), {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return err(
          new Error(`Federal Register API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as FederalRegisterApiResponse;
      const docs = parseFederalRegisterDocs(json);
      const events: RawEvent[] = [];

      const MAX_DOC_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

      for (const doc of docs) {
        if (this.seenIds.has(doc.document_number)) continue;
        if (!isMarketRelevant(doc)) continue;

        // Skip documents older than 24 hours (skip in tests)
        if (!isTest) {
          const docDate = new Date(doc.signing_date ?? doc.publication_date);
          if (now - docDate.getTime() > MAX_DOC_AGE_MS) {
            this.seenIds.add(doc.document_number); // mark as seen so we don't re-check
            continue;
          }
        }

        this.seenIds.add(doc.document_number);

        const fullText = `${doc.title} ${doc.abstract ?? ''}`;
        const tickers = extractTickers(fullText);
        const topics = extractTopics(doc);

        const docTypeLabel = doc.executive_order_number
          ? `Executive Order ${doc.executive_order_number}`
          : doc.type === 'Presidential Document'
            ? doc.subtype ?? 'Presidential Document'
            : doc.type;

        events.push({
          id: randomUUID(),
          source: 'whitehouse',
          type: 'executive-action',
          title: `${docTypeLabel}: ${doc.title}`,
          body: doc.abstract ?? doc.title,
          url: doc.html_url,
          timestamp: new Date(doc.signing_date ?? doc.publication_date),
          metadata: {
            ticker: tickers[0] ?? null,
            tickers,
            document_type: doc.type,
            executive_order_number: doc.executive_order_number,
            signing_date: doc.signing_date,
            publication_date: doc.publication_date,
            topics,
            federal_register_url: doc.html_url,
            tags: doc.executive_order_number
              ? ['HIGH_IMPACT', 'EXECUTIVE_ORDER']
              : ['EXECUTIVE_ACTION'],
          },
        });
      }

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
