import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  ok,
  err,
  scannerFetch,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { resolveScannerIntervalMs } from './scanner-intervals.js';
import { SeenIdBuffer } from './scraping/scrape-utils.js';
import { parseRssXml } from './breaking-news-scanner.js';
import { extractTickers } from './ticker-extractor.js';

const POLL_INTERVAL_MS = 900_000; // 15 minutes

const DOJ_ATR_RSS_URL =
  'https://www.justice.gov/atr/press-releases/feed';

/**
 * Classify the type of DOJ antitrust action from press release text.
 */
export function classifyDojAction(
  text: string,
): 'merger_challenge' | 'lawsuit' | 'settlement' | 'investigation' | 'consent_decree' | 'other' {
  const lower = text.toLowerCase();

  if (lower.includes('block') || lower.includes('merger challenge') || lower.includes('seeks to block')) {
    return 'merger_challenge';
  }
  if (lower.includes('lawsuit') || lower.includes('sues') || lower.includes('files suit') || lower.includes('antitrust lawsuit')) {
    return 'lawsuit';
  }
  if (lower.includes('settlement') || lower.includes('settles') || lower.includes('agrees to pay')) {
    return 'settlement';
  }
  if (lower.includes('consent decree') || lower.includes('consent order')) {
    return 'consent_decree';
  }
  if (lower.includes('investigation') || lower.includes('investigating') || lower.includes('probe')) {
    return 'investigation';
  }
  return 'other';
}

/**
 * Extract company names from DOJ press release titles.
 * Matches patterns like "Justice Department Sues Google" or "Blocks Merger of CompanyA and CompanyB".
 */
export function extractCompanyNames(text: string): string[] {
  const companies: string[] = [];

  // Match "Sues/Blocks/Challenges [CompanyName]" patterns — single capitalized word
  const actionMatch =
    /(?:sues|blocks|challenges|files suit against|charges)\s+([A-Z][A-Za-z]+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = actionMatch.exec(text)) !== null) {
    companies.push(match[1]!);
  }

  // Match "merger of X and Y" pattern
  const mergerMatch =
    /merger\s+(?:of|between)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+and\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/i.exec(
      text,
    );
  if (mergerMatch) {
    companies.push(mergerMatch[1]!);
    companies.push(mergerMatch[2]!);
  }

  return [...new Set(companies)];
}

function mapDojEventType(
  actionType: ReturnType<typeof classifyDojAction>,
): string {
  return actionType === 'settlement' ? 'doj_settlement' : 'ftc_antitrust';
}

export class DojScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'doj');
  /** Override for testing */
  public fetchFn: typeof scannerFetch = (url, options) =>
    scannerFetch(url, options);

  constructor(eventBus: EventBus) {
    super({
      name: 'doj-antitrust',
      source: 'doj',
      pollIntervalMs: resolveScannerIntervalMs('DOJ', POLL_INTERVAL_MS),
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(DOJ_ATR_RSS_URL, {
        timeoutMs: 30_000,
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        return err(new Error(`DOJ RSS returned ${response.status}`));
      }

      const xml = await response.text();
      const items = parseRssXml(xml);
      const events: RawEvent[] = [];

      for (const item of items) {
        const dedupKey = item.guid || item.link;
        if (this.seenIds.has(dedupKey)) continue;

        this.seenIds.add(dedupKey);

        const fullText = `${item.title} ${item.description}`;
        const tickers = extractTickers(fullText);
        const actionType = classifyDojAction(fullText);
        const companies = extractCompanyNames(item.title);
        const eventType = mapDojEventType(actionType);

        events.push({
          id: randomUUID(),
          source: 'doj',
          type: eventType,
          title: item.title,
          body: item.description || item.title,
          url: item.link || undefined,
          timestamp: item.pubDate ? new Date(item.pubDate) : new Date(),
          metadata: {
            ticker: tickers[0] ?? null,
            tickers,
            action_type: actionType,
            companies,
            case_type: 'antitrust',
            tags:
              actionType === 'merger_challenge' || actionType === 'lawsuit'
                ? ['HIGH_IMPACT', 'ANTITRUST']
                : ['ANTITRUST'],
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
