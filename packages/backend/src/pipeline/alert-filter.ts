import type { RawEvent } from '@event-radar/shared';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const require = createRequire(import.meta.url);

export interface FilterResult {
  pass: boolean;
  reason: string;
  enrichWithLLM: boolean;
}

export interface AlertFilterConfig {
  /** Tickers to watch with lower engagement thresholds. */
  watchlist?: string[];
  /** Minimum upvotes for social posts to pass (default 500). */
  socialMinUpvotes?: number;
  /** Minimum comments for social posts to pass (default 200). */
  socialMinComments?: number;
  /** Cooldown per ticker in minutes (default 60). */
  tickerCooldownMinutes?: number;
  /** Minimum insider trade value to pass (default 1_000_000). */
  insiderMinValue?: number;
  /** Whether the filter is enabled (default true). */
  enabled?: boolean;
  /** Maximum age in minutes for an event to be considered fresh (default 60). */
  maxAgeMinutes?: number;
}

const BREAKING_KEYWORDS = [
  'crash',
  'surge',
  'halt',
  'fda approval',
  'acquisition',
  'bankruptcy',
  'tariff',
  'fed rate',
  'investigation',
  'indictment',
  'sanctions',
  'emergency',
  'recall',
  'delisted',
  'default',
];

/**
 * Primary information sources — first-hand, original data.
 * These always pass the alert filter (subject to staleness + cooldown).
 * Filings, government actions, social posts from officials, etc.
 */
const PRIMARY_SOURCES = new Set([
  'whitehouse',       // Executive orders, presidential documents
  'congress',         // Congressional trades (STOCK Act filings)
  'sec-edgar',        // SEC filings (Form 4, 8-K, etc.)
  'fda',              // FDA approvals, rejections, advisory committees
  'doj-antitrust',    // DOJ antitrust actions
  'unusual-options',  // Unusual options activity (exchange data)
  'truth-social',     // Trump / official social posts
  'x-scanner',        // Key official X/Twitter posts
  'short-interest',   // Short interest data (exchange reported)
  'warn',             // WARN Act layoff notices (government filings)
]);

/**
 * Retrospective / analysis article patterns.
 * These are NOT breaking news — they are post-hoc commentary.
 */
const RETROSPECTIVE_PATTERNS = [
  /\bwhy\b.+\b(?:stock|shares?)\b.+\b(?:today|this week|this morning|yesterday)\b/i,
  /\bhere'?s why\b/i,
  /\bwhat happened\b/i,
  /\bcall transcript\b/i,
  /\bearnings call\b/i,
  /\banalyst (?:says?|thinks?|believes?)\b/i,
  /\b(?:could|may|might|should you)\b.+\b(?:soar|buy|sell|invest)\b/i,
  /\b(?:top|best|worst)\s+\d+\s+(?:stocks?|picks?|buys?)\b/i,
  /\bhere (?:are|is) (?:what|why|how)\b/i,
  /\bhow to\b.+\b(?:invest|trade|buy|profit)\b/i,
  /\b(?:prediction|forecast|outlook)\b.+\b(?:2026|2027|next year)\b/i,
];

function loadDefaultWatchlist(): string[] {
  try {
    return require('../config/watchlist.json') as string[];
  } catch {
    return ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOG', 'META', 'AMD', 'PLTR', 'SMCI', 'ARM', 'AVGO', 'TSM', 'MSTR', 'COIN'];
  }
}

export class AlertFilter {
  private readonly watchlist: Set<string>;
  private readonly socialMinUpvotes: number;
  private readonly socialMinComments: number;
  private readonly tickerCooldownMs: number;
  private readonly insiderMinValue: number;
  private readonly maxAgeMs: number;
  readonly enabled: boolean;

  /** ticker → last alert timestamp (persisted to disk) */
  private readonly cooldownMap = new Map<string, number>();
  private static readonly COOLDOWN_PATH = '/tmp/event-radar-seen/ticker-cooldown.json';
  private cooldownDirty = false;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: AlertFilterConfig) {
    const watchlistArr = config?.watchlist ?? loadDefaultWatchlist();
    this.watchlist = new Set(watchlistArr.map((t) => t.toUpperCase()));
    this.socialMinUpvotes = config?.socialMinUpvotes ?? num('SOCIAL_MIN_UPVOTES', 500);
    this.socialMinComments = config?.socialMinComments ?? num('SOCIAL_MIN_COMMENTS', 200);
    this.tickerCooldownMs = (config?.tickerCooldownMinutes ?? num('TICKER_COOLDOWN_MINUTES', 60)) * 60_000;
    this.insiderMinValue = config?.insiderMinValue ?? num('INSIDER_MIN_VALUE', 1_000_000);
    this.maxAgeMs = (config?.maxAgeMinutes ?? num('MAX_EVENT_AGE_MINUTES', 60)) * 60_000;
    this.enabled = config?.enabled ?? process.env.ALERT_FILTER_ENABLED !== 'false';
    this.loadCooldowns();
  }

  check(event: RawEvent): FilterResult {
    if (!this.enabled) {
      return { pass: true, reason: 'filter disabled', enrichWithLLM: false };
    }

    const source = event.source.toLowerCase();
    const ticker = typeof event.metadata?.['ticker'] === 'string'
      ? (event.metadata['ticker'] as string).toUpperCase()
      : undefined;

    // Rule 0a: Staleness — drop events older than maxAgeMs (default 1 hour)
    const eventAge = Date.now() - event.timestamp.getTime();
    if (eventAge > this.maxAgeMs) {
      return { pass: false, reason: `stale event: ${Math.round(eventAge / 60_000)}min old (max ${Math.round(this.maxAgeMs / 60_000)}min)`, enrichWithLLM: false };
    }

    // Rule 0b: Retrospective / analysis articles — only for secondary sources
    // Primary sources (filings, gov actions) should never be filtered by title patterns
    if (!PRIMARY_SOURCES.has(source)) {
      const titleAndBody = `${event.title} ${event.body}`;
      for (const pattern of RETROSPECTIVE_PATTERNS) {
        if (pattern.test(titleAndBody)) {
          return { pass: false, reason: `retrospective article: matched "${pattern.source}"`, enrichWithLLM: false };
        }
      }
    }

    // Rule 1: Skip dummy scanner events entirely
    if (source === 'dummy' || event.type === 'dummy') {
      return { pass: false, reason: 'dummy event skipped', enrichWithLLM: false };
    }

    // ============================================================
    // PRIMARY SOURCES — first-hand, original information.
    // These always pass (subject to staleness + ticker cooldown).
    // ============================================================

    if (PRIMARY_SOURCES.has(source)) {
      // Special case: insider trades still need value threshold
      if (source === 'sec-edgar' && event.type === 'form-4') {
        const value = numMeta(event, 'transactionValue') ?? numMeta(event, 'value') ?? 0;
        if (value < this.insiderMinValue) {
          return { pass: false, reason: `insider trade value $${value} < $${this.insiderMinValue}`, enrichWithLLM: false };
        }
      }

      return this.applyTickerCooldown(ticker, {
        pass: true,
        reason: `primary source: ${source}`,
        enrichWithLLM: true,
      });
    }

    // ============================================================
    // SECONDARY SOURCES — commentary, aggregation, social chatter.
    // Need keyword / engagement filters to cut noise.
    // ============================================================

    // Social noise filter (Reddit / StockTwits)
    if (source === 'reddit' || source === 'stocktwits') {
      return this.checkSocial(event, ticker);
    }

    // Breaking news (RSS aggregation) — needs keyword + retrospective filter
    if (source === 'breaking-news' || event.type === 'breaking-news') {
      return this.checkBreakingNews(event, ticker);
    }

    // Analyst ratings — watchlist only, cooldown applies
    if (source === 'analyst') {
      if (ticker && this.watchlist.has(ticker)) {
        return this.applyTickerCooldown(ticker, { pass: true, reason: `analyst rating for watchlist ticker ${ticker}`, enrichWithLLM: true });
      }
      return { pass: false, reason: 'analyst rating: not on watchlist', enrichWithLLM: false };
    }

    // Earnings/FDA calendar — only if today or tomorrow
    if (this.isCalendarEvent(event)) {
      return this.checkCalendarEvent(event, ticker);
    }

    // Default: pass through with LLM enrichment for non-trivial events
    return this.applyTickerCooldown(ticker, { pass: true, reason: 'default pass', enrichWithLLM: true });
  }

  /** Reset cooldown map (useful for testing). */
  resetCooldowns(): void {
    this.cooldownMap.clear();
  }

  private loadCooldowns(): void {
    // Skip loading in test environment
    if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
    try {
      if (!existsSync(AlertFilter.COOLDOWN_PATH)) return;
      const data = JSON.parse(readFileSync(AlertFilter.COOLDOWN_PATH, 'utf-8'));
      if (data && typeof data === 'object') {
        const now = Date.now();
        for (const [ticker, ts] of Object.entries(data)) {
          if (typeof ts === 'number' && now - ts < this.tickerCooldownMs) {
            this.cooldownMap.set(ticker, ts);
          }
        }
      }
    } catch { /* ignore corrupt file */ }
  }

  private saveCooldowns(): void {
    // Skip saving in test environment
    if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
    this.cooldownDirty = true;
    if (this.cooldownTimer) return;
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      if (this.cooldownDirty) {
        this.cooldownDirty = false;
        try {
          const dir = '/tmp/event-radar-seen';
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          const obj: Record<string, number> = {};
          for (const [k, v] of this.cooldownMap) obj[k] = v;
          writeFileSync(AlertFilter.COOLDOWN_PATH, JSON.stringify(obj));
        } catch { /* ignore write errors */ }
      }
    }, 2000);
  }

  // --- Private helpers ---

  private checkSocial(event: RawEvent, ticker: string | undefined): FilterResult {
    const upvotes = numMeta(event, 'upvotes') ?? numMeta(event, 'score') ?? 0;
    const comments = numMeta(event, 'comments') ?? numMeta(event, 'commentCount') ?? 0;
    const highEngagement = boolMeta(event, 'high_engagement');

    // High engagement flag set by scanner
    if (highEngagement) {
      return this.applyTickerCooldown(ticker, { pass: true, reason: `social high_engagement flag`, enrichWithLLM: true });
    }

    // High engagement: >500 upvotes OR >200 comments
    if (upvotes >= this.socialMinUpvotes || comments >= this.socialMinComments) {
      return this.applyTickerCooldown(ticker, {
        pass: true,
        reason: `social engagement: ${upvotes} upvotes, ${comments} comments`,
        enrichWithLLM: true,
      });
    }

    // Watchlist ticker with >100 upvotes
    if (ticker && this.watchlist.has(ticker) && upvotes >= 100) {
      return this.applyTickerCooldown(ticker, {
        pass: true,
        reason: `watchlist ticker ${ticker} with ${upvotes} upvotes`,
        enrichWithLLM: true,
      });
    }

    return { pass: false, reason: `social noise: ${upvotes} upvotes, ${comments} comments`, enrichWithLLM: false };
  }

  private checkBreakingNews(event: RawEvent, ticker: string | undefined): FilterResult {
    const text = `${event.title} ${event.body}`.toLowerCase();

    // Must contain a breaking keyword to be considered explosive
    let matchedKeyword: string | undefined;
    for (const kw of BREAKING_KEYWORDS) {
      if (text.includes(kw)) {
        matchedKeyword = kw;
        break;
      }
    }

    if (!matchedKeyword) {
      return { pass: false, reason: 'breaking news: no explosive keyword match', enrichWithLLM: false };
    }

    // Breaking keyword found — pass with or without ticker
    return this.applyTickerCooldown(ticker, {
      pass: true,
      reason: `breaking news keyword: "${matchedKeyword}"${ticker ? ` (${ticker})` : ''}`,
      enrichWithLLM: true,
    });
  }

  private isCalendarEvent(event: RawEvent): boolean {
    const type = event.type.toLowerCase();
    return type.includes('earnings') || type.includes('fda') || type.includes('calendar');
  }

  private checkCalendarEvent(event: RawEvent, ticker: string | undefined): FilterResult {
    const eventDateStr = event.metadata?.['eventDate'] as string | undefined
      ?? event.metadata?.['date'] as string | undefined;

    if (eventDateStr) {
      const eventDate = new Date(eventDateStr);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      if (eventDate > tomorrow) {
        return { pass: false, reason: `calendar event too far away: ${eventDateStr}`, enrichWithLLM: false };
      }
    }

    return this.applyTickerCooldown(ticker, { pass: true, reason: 'calendar event today/tomorrow', enrichWithLLM: true });
  }

  private applyTickerCooldown(ticker: string | undefined, result: FilterResult): FilterResult {
    if (!ticker || !result.pass) return result;

    const now = Date.now();
    const lastAlert = this.cooldownMap.get(ticker);

    if (lastAlert && now - lastAlert < this.tickerCooldownMs) {
      return {
        pass: false,
        reason: `ticker ${ticker} cooldown (last alert ${Math.round((now - lastAlert) / 1000)}s ago)`,
        enrichWithLLM: false,
      };
    }

    this.cooldownMap.set(ticker, now);
    this.saveCooldowns();
    return result;
  }
}

// --- Utility ---

function num(envKey: string, fallback: number): number {
  const v = process.env[envKey];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numMeta(event: RawEvent, key: string): number | undefined {
  const v = event.metadata?.[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function boolMeta(event: RawEvent, key: string): boolean {
  return event.metadata?.[key] === true;
}
