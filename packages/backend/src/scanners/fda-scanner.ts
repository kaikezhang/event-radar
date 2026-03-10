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
import { parseRssXml, type RssItem } from './breaking-news-scanner.js';
import { extractTickers } from './ticker-extractor.js';

const RSS_POLL_INTERVAL_MS = 300_000; // 5 minutes

const FDA_RSS_URL =
  'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds';

/** Keywords indicating market-moving FDA actions */
const FDA_ACTION_KEYWORDS = [
  'approval',
  'approved',
  'approves',
  'nda',
  'bla',
  'complete response letter',
  'crl',
  'pdufa',
  'warning letter',
  'safety alert',
  'recall',
  'clinical trial',
  'phase 1',
  'phase 2',
  'phase 3',
  'breakthrough therapy',
  'fast track',
  'priority review',
  'accelerated approval',
] as const;

export interface FdaRssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid: string;
}

/**
 * Determine the action type from FDA press release text.
 */
export function classifyFdaAction(
  text: string,
): 'approval' | 'crl' | 'safety' | 'clinical_trial' | 'other' {
  const lower = text.toLowerCase();

  // CRL must be checked before approval since CRL items may mention "NDA"
  if (
    lower.includes('complete response letter') ||
    lower.includes('crl')
  ) {
    return 'crl';
  }
  if (
    lower.includes('approval') ||
    lower.includes('approved') ||
    lower.includes('approves') ||
    lower.includes('nda') ||
    lower.includes('bla')
  ) {
    return 'approval';
  }
  if (
    lower.includes('warning letter') ||
    lower.includes('safety alert') ||
    lower.includes('recall')
  ) {
    return 'safety';
  }
  if (
    lower.includes('clinical trial') ||
    lower.includes('phase 1') ||
    lower.includes('phase 2') ||
    lower.includes('phase 3')
  ) {
    return 'clinical_trial';
  }
  return 'other';
}

/**
 * Check if an RSS item matches FDA action keywords.
 */
export function isFdaRelevant(item: RssItem): boolean {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return FDA_ACTION_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Extract drug name from FDA press release title.
 * Matches patterns like "FDA Approves Keytruda (pembrolizumab)" or "Keytruda".
 */
export function extractDrugName(text: string): string | null {
  // Match "FDA Approves DrugName" or parenthetical generic name
  const parenMatch = /\b(\w+)\s*\(([^)]+)\)/.exec(text);
  if (parenMatch) return parenMatch[1]!;

  // Match "Approves/Approved [DrugName]" — single capitalized word after action verb
  const approvalMatch =
    /(?:approv(?:es|ed|al)|grants?)\s+([A-Z][a-z]+)\b/i.exec(text);
  if (approvalMatch) return approvalMatch[1]!;

  return null;
}

export class FdaScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500);
  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(eventBus: EventBus) {
    super({
      name: 'fda',
      source: 'fda',
      pollIntervalMs: RSS_POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(FDA_RSS_URL, {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        return err(new Error(`FDA RSS returned ${response.status}`));
      }

      const xml = await response.text();
      const items = parseRssXml(xml);
      const events: RawEvent[] = [];

      for (const item of items) {
        const dedupKey = item.guid || item.link;
        if (this.seenIds.has(dedupKey)) continue;
        if (!isFdaRelevant(item)) continue;

        this.seenIds.add(dedupKey);

        const fullText = `${item.title} ${item.description}`;
        const tickers = extractTickers(fullText);
        const actionType = classifyFdaAction(fullText);
        const drugName = extractDrugName(item.title);

        events.push({
          id: randomUUID(),
          source: 'fda',
          type: 'fda-action',
          title: item.title,
          body: item.description || item.title,
          url: item.link || undefined,
          timestamp: item.pubDate ? new Date(item.pubDate) : new Date(),
          metadata: {
            ticker: tickers[0] ?? null,
            tickers,
            action_type: actionType,
            drug_name: drugName,
            tags: actionType === 'approval' || actionType === 'crl'
              ? ['HIGH_IMPACT', 'REGULATORY']
              : ['REGULATORY'],
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
