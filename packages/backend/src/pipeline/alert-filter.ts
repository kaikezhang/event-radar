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

    // Rule 4: Skip dummy scanner events entirely
    if (source === 'dummy' || event.type === 'dummy') {
      return { pass: false, reason: 'dummy event skipped', enrichWithLLM: false };
    }

    // Rule 6: Congress trades always pass
    if (source === 'congress' || event.type === 'congress-trade') {
      return this.applyTickerCooldown(ticker, { pass: true, reason: 'congress trade — always pass', enrichWithLLM: true });
    }

    // Rule 8: Options unusual activity always pass
    if (source === 'unusual-options' || event.type === 'unusual-options') {
      return this.applyTickerCooldown(ticker, { pass: true, reason: 'unusual options activity — always pass', enrichWithLLM: true });
    }

    // Rule 7: Insider trades pass if value > threshold
    if (source === 'sec-edgar' && event.type === 'form-4') {
      const value = numMeta(event, 'transactionValue') ?? numMeta(event, 'value') ?? 0;
      if (value >= this.insiderMinValue) {
        return this.applyTickerCooldown(ticker, { pass: true, reason: `insider trade value $${value} >= $${this.insiderMinValue}`, enrichWithLLM: true });
      }
      return { pass: false, reason: `insider trade value $${value} < $${this.insiderMinValue}`, enrichWithLLM: false };
    }

    // Rule 2: Social noise filter (Reddit / StockTwits)
    if (source === 'reddit' || source === 'stocktwits') {
      return this.checkSocial(event, ticker);
    }

    // Rule 3: Breaking news filter
    if (source === 'breaking-news' || event.type === 'breaking-news') {
      return this.checkBreakingNews(event, ticker);
    }

    // Rule 5: Earnings/FDA calendar — only if today or tomorrow
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
    // Pass if contains a known ticker
    if (ticker && this.watchlist.has(ticker)) {
      return this.applyTickerCooldown(ticker, {
        pass: true,
        reason: `breaking news with watchlist ticker ${ticker}`,
        enrichWithLLM: true,
      });
    }

    // Pass if contains breaking keywords
    const text = `${event.title} ${event.body}`.toLowerCase();
    for (const kw of BREAKING_KEYWORDS) {
      if (text.includes(kw)) {
        return this.applyTickerCooldown(ticker, {
          pass: true,
          reason: `breaking news keyword: "${kw}"`,
          enrichWithLLM: true,
        });
      }
    }

    // Check if any ticker is mentioned in the text
    if (ticker) {
      return this.applyTickerCooldown(ticker, {
        pass: true,
        reason: `breaking news with ticker ${ticker}`,
        enrichWithLLM: true,
      });
    }

    return { pass: false, reason: 'breaking news: no ticker or keyword match', enrichWithLLM: false };
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
