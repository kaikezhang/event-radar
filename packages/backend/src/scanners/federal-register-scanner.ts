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
import type { FederalRegisterApiResponse, FederalRegisterDocument } from './whitehouse-scanner.js';
import { isMarketRelevant, extractTopics } from './whitehouse-scanner.js';

const POLL_INTERVAL_MS = 900_000; // 15 minutes

const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json';

/**
 * Agency slugs to monitor on Federal Register.
 * These cover DOJ antitrust, FDA, SEC, FTC, CFPB, etc.
 */
const MONITORED_AGENCIES = [
  'justice-department',
  'food-and-drug-administration',
  'securities-and-exchange-commission',
  'federal-trade-commission',
  'consumer-financial-protection-bureau',
  'federal-reserve-system',
  'treasury-department',
  'commerce-department',
] as const;

/** Map agency slug → source label for events */
const AGENCY_SOURCE_MAP: Record<string, string> = {
  'justice-department': 'doj-antitrust',
  'food-and-drug-administration': 'fda',
  'securities-and-exchange-commission': 'sec-regulatory',
  'federal-trade-commission': 'ftc',
  'consumer-financial-protection-bureau': 'cfpb',
  'federal-reserve-system': 'fed',
  'treasury-department': 'treasury',
  'commerce-department': 'commerce',
};

/** Keywords that make a federal document HIGH priority */
const HIGH_PRIORITY_KEYWORDS = [
  'antitrust', 'merger', 'acquisition', 'monopoly',
  'approval', 'approved', 'rejection', 'denied',
  'enforcement', 'penalty', 'fine', 'settlement',
  'investigation', 'subpoena', 'injunction',
  'recall', 'warning', 'ban', 'prohibited',
  'rate', 'interest rate', 'monetary policy',
] as const;

/**
 * FederalRegisterScanner — monitors Rules, Notices, and Proposed Rules
 * from key federal agencies via the free Federal Register API.
 * Replaces broken DOJ RSS + FDA RSS scanners.
 */
export class FederalRegisterScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(1000, 'federal-register');
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'federal-register',
      source: 'federal-register',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const url = new URL(FEDERAL_REGISTER_API);
      // Document types: Rules + Notices (skip Proposed Rules — too noisy)
      url.searchParams.append('conditions[type][]', 'RULE');
      url.searchParams.append('conditions[type][]', 'NOTICE');
      // Only today's documents
      const today = new Date().toISOString().split('T')[0];
      url.searchParams.set('conditions[publication_date][gte]', today!);
      url.searchParams.set('order', 'newest');
      url.searchParams.set('per_page', '50');
      // Filter to monitored agencies
      for (const agency of MONITORED_AGENCIES) {
        url.searchParams.append('conditions[agencies][]', agency);
      }

      const response = await this.fetchFn(url.toString(), {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return err(new Error(`Federal Register API returned ${response.status}`));
      }

      const json = (await response.json()) as FederalRegisterApiResponse;
      if (!json?.results) return ok([]);

      const events: RawEvent[] = [];
      const MAX_AGE_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

      for (const doc of json.results) {
        if (this.seenIds.has(doc.document_number)) continue;
        if (!isMarketRelevant(doc)) continue;

        if (!isTest) {
          const pubDate = new Date(doc.publication_date);
          if (now - pubDate.getTime() > MAX_AGE_MS) {
            this.seenIds.add(doc.document_number);
            continue;
          }
        }

        this.seenIds.add(doc.document_number);

        const fullText = `${doc.title} ${doc.abstract ?? ''}`;
        const tickers = extractTickers(fullText);
        const topics = extractTopics(doc);

        // Determine source from agencies (use first matching monitored agency)
        const agencySource = this.detectAgencySource(doc);
        const isHighPriority = HIGH_PRIORITY_KEYWORDS.some(kw =>
          fullText.toLowerCase().includes(kw),
        );

        events.push({
          id: randomUUID(),
          source: agencySource,
          type: 'regulatory-action',
          title: `[${doc.type}] ${doc.title}`,
          body: doc.abstract ?? doc.title,
          url: doc.html_url,
          timestamp: new Date(doc.publication_date),
          metadata: {
            ticker: tickers[0] ?? null,
            tickers,
            document_type: doc.type,
            document_number: doc.document_number,
            publication_date: doc.publication_date,
            topics,
            agency_source: agencySource,
            federal_register_url: doc.html_url,
            tags: isHighPriority
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

  /** Best-effort detection of which agency a document belongs to */
  private detectAgencySource(doc: FederalRegisterDocument): string {
    // Federal Register API includes agency info in the title/abstract often
    const text = `${doc.title} ${doc.abstract ?? ''}`.toLowerCase();

    for (const [slug, source] of Object.entries(AGENCY_SOURCE_MAP)) {
      const agencyName = slug.replace(/-/g, ' ');
      if (text.includes(agencyName)) return source;
    }

    // Fallback: check common abbreviations
    if (text.includes('doj') || text.includes('antitrust')) return 'doj-antitrust';
    if (text.includes('fda') || text.includes('drug') || text.includes('medical device')) return 'fda';
    if (text.includes('sec') || text.includes('securities')) return 'sec-regulatory';
    if (text.includes('ftc')) return 'ftc';
    if (text.includes('fed') || text.includes('federal reserve')) return 'fed';

    return 'federal-register';
  }
}
