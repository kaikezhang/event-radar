import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { getMarketSession, getNextSessionOpenMs } from './llm-gatekeeper.js';

const require = createRequire(import.meta.url);

interface FilterResult {
  pass: boolean;
  reason: string;
  enrichWithLLM: boolean;
}

export interface AlertFilterConfig {
  /** Tickers to watch with lower engagement thresholds. */
  watchlist?: string[];
  /** Minimum upvotes for social posts to pass (default 1000). */
  socialMinUpvotes?: number;
  /** Minimum comments for social posts to pass (default 500). */
  socialMinComments?: number;
  /** Cooldown per ticker in minutes (default 60). */
  tickerCooldownMinutes?: number;
  /** Minimum insider trade value to pass (default 1_000_000). */
  insiderMinValue?: number;
  /** Whether the filter is enabled (default true). */
  enabled?: boolean;
  /** Maximum age in minutes for an event to be considered fresh during market hours (default 120). */
  maxAgeMinutes?: number;
  /** Override for current time (testing only) */
  nowFn?: () => Date;
}

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

/**
 * Clickbait / opinion / advisory patterns.
 */
const CLICKBAIT_PATTERNS = [
  /\bworried about\b/i,
  /\bthis \d+ (?:move|trick|strategy|step)\b/i,
  /\bmake or break\b/i,
  /\bbefore it'?s too late\b/i,
  /\byou need to know\b/i,
  /\bdon'?t miss\b/i,
  /\bsecret(?:s)?\b.+\b(?:wall street|investor|trader)\b/i,
  /\bnobody is talking about\b/i,
  /\bI'm buying\b/i,
  /\bmy portfolio\b/i,
  /\b(?:billionaire|millionaire|warren buffett|cathie wood)\b.+\b(?:buy|sell|load|dump)\b/i,
  /\b(?:right now|today)\b.*[.!]$/i,
  /\byour portfolio\b/i,
];

function loadDefaultWatchlist(): string[] {
  try {
    return require('../config/watchlist.json') as string[];
  } catch {
    return ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOG', 'META', 'AMD', 'PLTR', 'SMCI', 'ARM', 'AVGO', 'TSM', 'MSTR', 'COIN'];
  }
}

/**
 * L1 Deterministic Filter — fast, cheap, accurate pre-filter.
 *
 * Runs on ALL sources (no more primary/secondary distinction).
 * Events that pass L1 go to L2 LLM Judge.
 *
 * Rules:
 * - Staleness: 2h during market hours, extend to next tradable session for overnight/weekend
 * - Retrospective article patterns (regex)
 * - Clickbait patterns (regex)
 * - Dummy event skip
 * - Insider trade $1M minimum
 * - Social engagement thresholds (upvotes >= 1000 or comments >= 500)
 * - Per-ticker cooldown (60 min)
 */
export class AlertFilter {
  private static readonly MAX_COOLDOWN_ENTRIES = 10_000;
  private readonly watchlist: Set<string>;
  private readonly socialMinUpvotes: number;
  private readonly socialMinComments: number;
  private readonly tickerCooldownMs: number;
  private readonly maxMapSize: number;
  private readonly insiderMinValue: number;
  private readonly maxAgeMs: number;
  readonly enabled: boolean;
  private readonly nowFn: () => Date;

  /** ticker → last alert timestamp (persisted to disk) */
  private readonly cooldownMap = new Map<string, number>();
  private static readonly COOLDOWN_PATH = '/tmp/event-radar-seen/ticker-cooldown.json';
  private cooldownDirty = false;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pruneTimer: ReturnType<typeof setInterval>;

  constructor(config?: AlertFilterConfig) {
    const watchlistArr = config?.watchlist ?? loadDefaultWatchlist();
    this.watchlist = new Set(watchlistArr.map((t) => t.toUpperCase()));
    this.socialMinUpvotes = config?.socialMinUpvotes ?? num('SOCIAL_MIN_UPVOTES', 1000);
    this.socialMinComments = config?.socialMinComments ?? num('SOCIAL_MIN_COMMENTS', 500);
    this.tickerCooldownMs = (config?.tickerCooldownMinutes ?? num('TICKER_COOLDOWN_MINUTES', 60)) * 60_000;
    this.maxMapSize = 10_000;
    this.insiderMinValue = config?.insiderMinValue ?? num('INSIDER_MIN_VALUE', 1_000_000);
    this.maxAgeMs = (config?.maxAgeMinutes ?? num('MAX_EVENT_AGE_MINUTES', 120)) * 60_000;
    this.enabled = config?.enabled ?? process.env.ALERT_FILTER_ENABLED !== 'false';
    this.nowFn = config?.nowFn ?? (() => new Date());
    this.loadCooldowns();
    this.pruneTimer = setInterval(() => this.pruneExpired(), 600_000);
    this.pruneTimer.unref?.();
  }

  check(event: RawEvent, llmResult?: LlmClassificationResult): FilterResult {
    if (!this.enabled) {
      return { pass: true, reason: 'filter disabled', enrichWithLLM: false };
    }

    const source = event.source.toLowerCase();
    const ticker = typeof event.metadata?.['ticker'] === 'string'
      ? (event.metadata['ticker'] as string).toUpperCase()
      : undefined;

    // Rule 0: Staleness — unified 2h during market hours, session-aware for off-hours
    const now = this.nowFn();
    const eventAge = now.getTime() - event.timestamp.getTime();
    const effectiveMaxAge = this.getEffectiveMaxAge(now);
    if (eventAge > effectiveMaxAge) {
      return { pass: false, reason: `stale event: ${Math.round(eventAge / 60_000)}min old (max ${Math.round(effectiveMaxAge / 60_000)}min)`, enrichWithLLM: false };
    }

    // Rule 1: Retrospective article patterns — all sources
    const titleAndBody = `${event.title} ${event.body}`;
    for (const pattern of RETROSPECTIVE_PATTERNS) {
      if (pattern.test(titleAndBody)) {
        return { pass: false, reason: `retrospective article: matched "${pattern.source}"`, enrichWithLLM: false };
      }
    }

    // Rule 2: Clickbait patterns — all sources
    for (const pattern of CLICKBAIT_PATTERNS) {
      if (pattern.test(titleAndBody)) {
        return { pass: false, reason: `clickbait: matched "${pattern.source}"`, enrichWithLLM: false };
      }
    }

    // Rule 3: Skip dummy scanner events
    if (source === 'dummy' || event.type === 'dummy') {
      return { pass: false, reason: 'dummy event skipped', enrichWithLLM: false };
    }

    // Rule 4: Newswire noise filter — require US-listed ticker or HIGH+ keyword
    if (source === 'pr-newswire' || source === 'businesswire' || source === 'globenewswire') {
      return this.checkNewswire(event, ticker);
    }

    // Rule 5: Insider trade threshold and meaningless Form 4 suppression
    if (source === 'sec-edgar' && isSecForm4Event(event)) {
      const value = numMeta(event, 'transactionValue')
        ?? numMeta(event, 'transaction_value')
        ?? numMeta(event, 'value')
        ?? 0;
      if (value <= 0) {
        return { pass: false, reason: 'form-4 with no transaction value', enrichWithLLM: false };
      }
      if (value < this.insiderMinValue) {
        return { pass: false, reason: `insider trade value $${value} < $${this.insiderMinValue}`, enrichWithLLM: false };
      }
    }

    // Rule 6: Social noise filter (Reddit / StockTwits)
    if (source === 'reddit' || source === 'stocktwits') {
      return this.checkSocial(event, ticker);
    }

    // Rule 7: Calendar events — only if today or tomorrow
    if (this.isCalendarEvent(event)) {
      return this.checkCalendarEvent(event);
    }

    // Default: pass through to L2 LLM Judge with ticker cooldown
    return this.applyTickerCooldown(event, llmResult, {
      pass: true,
      reason: 'L1 pass',
      enrichWithLLM: true,
    });
  }

  /** Reset cooldown map (useful for testing). */
  resetCooldowns(): void {
    this.cooldownMap.clear();
  }

  dispose(): void {
    clearInterval(this.pruneTimer);
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  /**
   * Session-aware max age calculation.
   * During market hours (RTH/PRE/POST): 2 hours.
   * During CLOSED: max(2h, nextSessionOpen - now) so events remain valid
   * until the next trading session opens (handles weekends + holidays).
   */
  private getEffectiveMaxAge(now: Date): number {
    const session = getMarketSession(now);
    if (session === 'CLOSED') {
      const nextOpenMs = getNextSessionOpenMs(now);
      const msUntilOpen = nextOpenMs - now.getTime();
      return Math.max(this.maxAgeMs, msUntilOpen);
    }
    return this.maxAgeMs; // 2h default
  }

  private loadCooldowns(): void {
    if (isTestRuntime()) return;
    try {
      if (!existsSync(AlertFilter.COOLDOWN_PATH)) return;
      const data = JSON.parse(readFileSync(AlertFilter.COOLDOWN_PATH, 'utf-8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        this.loadCooldownEntries(data as Record<string, number>);
      }
    } catch { /* ignore corrupt file */ }
  }

  private saveCooldowns(): void {
    if (isTestRuntime()) return;
    this.cooldownDirty = true;
    if (this.cooldownTimer) return;
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      if (this.cooldownDirty) {
        this.cooldownDirty = false;
        try {
          const dir = '/tmp/event-radar-seen';
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          this.pruneExpired();
          const obj: Record<string, number> = {};
          for (const [k, v] of this.cooldownMap) obj[k] = v;
          const tmpPath = AlertFilter.COOLDOWN_PATH + '.tmp';
          writeFileSync(tmpPath, JSON.stringify(obj));
          renameSync(tmpPath, AlertFilter.COOLDOWN_PATH);
        } catch { /* ignore write errors */ }
      }
    }, 2000);
  }

  // --- Private helpers ---

  /**
   * Newswire noise filter.
   * PR Newswire / BusinessWire / GlobeNewswire publish tons of irrelevant press releases.
   * Only pass events that:
   *  1. Have a recognized US-listed ticker, OR
   *  2. Match HIGH/CRITICAL severity keyword patterns (M&A, FDA, bankruptcy, etc.)
   * This prevents spam like "isinwheel launches spring promotions" from reaching delivery.
   */
  private checkNewswire(event: RawEvent, ticker: string | undefined): FilterResult {
    const titleAndBody = `${event.title} ${event.body}`.toLowerCase();

    // HIGH/CRITICAL keyword patterns that are always relevant
    const NEWSWIRE_PASS_PATTERNS = [
      'merger', 'acquisition', 'acquire', 'fda approv', 'fda reject',
      'restructur', 'bankrupt', 'chapter 11', 'chapter 7',
      'layoff', 'workforce reduction', 'earnings', 'revenue',
      'guidance', 'ipo', 'initial public offering', 'delisted',
      'sec investigation', 'fraud', 'settlement', 'recall',
      'tariff', 'sanction', 'executive order', 'antitrust',
      'hostile takeover', 'activist investor', 'stock buyback',
      'dividend', 'stock split', 'share repurchase',
    ];

    const hasPassKeyword = NEWSWIRE_PASS_PATTERNS.some((kw) => titleAndBody.includes(kw));

    // If we have a recognized ticker on watchlist → pass
    if (ticker && this.watchlist.has(ticker)) {
      return this.applyTickerCooldown(event, undefined, {
        pass: true,
        reason: `newswire watchlist ticker ${ticker}`,
        enrichWithLLM: true,
      });
    }

    // If there's a ticker AND a high-relevance keyword → pass
    if (ticker && hasPassKeyword) {
      return this.applyTickerCooldown(event, undefined, {
        pass: true,
        reason: `newswire ticker ${ticker} + keyword match`,
        enrichWithLLM: true,
      });
    }

    // No ticker but has a strong keyword → pass (LLM Judge will further filter)
    if (!ticker && hasPassKeyword) {
      return { pass: true, reason: 'newswire keyword match (no ticker)', enrichWithLLM: true };
    }

    // Has ticker but no keyword → pass with LLM enrichment (let LLM Judge decide)
    if (ticker) {
      return this.applyTickerCooldown(event, undefined, {
        pass: true,
        reason: `newswire ticker ${ticker} (no keyword)`,
        enrichWithLLM: true,
      });
    }

    // No ticker AND no keyword → block as noise
    return { pass: false, reason: 'newswire noise: no US ticker and no relevance keyword', enrichWithLLM: false };
  }

  private checkSocial(event: RawEvent, ticker: string | undefined): FilterResult {
    const upvotes = numMeta(event, 'upvotes') ?? numMeta(event, 'score') ?? 0;
    const comments = numMeta(event, 'comments') ?? numMeta(event, 'commentCount') ?? 0;
    const highEngagement = boolMeta(event, 'high_engagement');

    // High engagement flag set by scanner
    if (highEngagement) {
      return this.applyTickerCooldown(event, undefined, {
        pass: true,
        reason: 'social high_engagement flag',
        enrichWithLLM: true,
      });
    }

    // High engagement: >=1000 upvotes OR >=500 comments
    if (upvotes >= this.socialMinUpvotes || comments >= this.socialMinComments) {
      return this.applyTickerCooldown(event, undefined, {
        pass: true,
        reason: `social engagement: ${upvotes} upvotes, ${comments} comments`,
        enrichWithLLM: true,
      });
    }

    // Watchlist ticker with >100 upvotes
    if (ticker && this.watchlist.has(ticker) && upvotes >= 100) {
      return this.applyTickerCooldown(event, undefined, {
        pass: true,
        reason: `watchlist ticker ${ticker} with ${upvotes} upvotes`,
        enrichWithLLM: true,
      });
    }

    return { pass: false, reason: `social noise: ${upvotes} upvotes, ${comments} comments`, enrichWithLLM: false };
  }

  private isCalendarEvent(event: RawEvent): boolean {
    const type = event.type.toLowerCase();
    return type.includes('earnings') || type.includes('fda') || type.includes('calendar');
  }

  private checkCalendarEvent(event: RawEvent): FilterResult {
    const eventDateStr = event.metadata?.['eventDate'] as string | undefined
      ?? event.metadata?.['date'] as string | undefined;

    if (eventDateStr) {
      const eventDate = new Date(eventDateStr);
      const now = this.nowFn();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      if (eventDate > tomorrow) {
        return { pass: false, reason: `calendar event too far away: ${eventDateStr}`, enrichWithLLM: false };
      }
    }

    return this.applyTickerCooldown(event, undefined, {
      pass: true,
      reason: 'calendar event today/tomorrow',
      enrichWithLLM: true,
    });
  }

  private applyTickerCooldown(
    event: RawEvent,
    llmResult: LlmClassificationResult | undefined,
    result: FilterResult,
  ): FilterResult {
    const ticker = typeof event.metadata?.['ticker'] === 'string'
      ? (event.metadata['ticker'] as string).toUpperCase()
      : undefined;
    if (!ticker || !result.pass) return result;

    const eventType = this.resolveEventType(event, llmResult);
    const now = this.nowFn().getTime();
    this.pruneExpired(now);

    const lastAlert = this.getCooldownLookupKeys(ticker, eventType)
      .map((key) => this.cooldownMap.get(key))
      .find((ts): ts is number => typeof ts === 'number');

    if (lastAlert && now - lastAlert < this.tickerCooldownMs) {
      return {
        pass: false,
        reason: `ticker ${ticker} cooldown (last alert ${Math.round((now - lastAlert) / 1000)}s ago)`,
        enrichWithLLM: false,
      };
    }

    const writeKey = eventType ? `${ticker}:${eventType}` : ticker;
    this.cooldownMap.set(writeKey, now);
    if (this.cooldownMap.size > this.maxMapSize) {
      this.pruneExpired(now);
    }
    this.saveCooldowns();
    return result;
  }

  private loadCooldownEntries(entries: Record<string, number>): void {
    const now = this.nowFn().getTime();
    for (const [key, ts] of Object.entries(entries)) {
      if (typeof ts !== 'number' || now - ts >= this.tickerCooldownMs) {
        continue;
      }

      const normalizedKey = key.includes(':') ? key.toUpperCase() : `${key.toUpperCase()}:*`;
      this.cooldownMap.set(normalizedKey, ts);
    }

    this.pruneExpired(now);
  }

  private pruneExpired(now = this.nowFn().getTime()): void {
    for (const [key, ts] of this.cooldownMap) {
      if (now - ts >= this.tickerCooldownMs) {
        this.cooldownMap.delete(key);
      }
    }

    if (this.cooldownMap.size <= AlertFilter.MAX_COOLDOWN_ENTRIES) {
      return;
    }

    const entries = [...this.cooldownMap.entries()].sort((a, b) => a[1] - b[1]);
    const overflow = entries.length - AlertFilter.MAX_COOLDOWN_ENTRIES;

    for (let i = 0; i < overflow; i++) {
      this.cooldownMap.delete(entries[i][0]);
    }
  }

  private resolveEventType(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): string | undefined {
    const metadataEventType = event.metadata?.['eventType'];
    if (typeof metadataEventType === 'string' && metadataEventType.length > 0) {
      return metadataEventType;
    }

    if (typeof llmResult?.eventType === 'string' && llmResult.eventType.length > 0) {
      return llmResult.eventType;
    }

    return undefined;
  }

  private getCooldownLookupKeys(ticker: string, eventType?: string): string[] {
    const keys = eventType
      ? [`${ticker}:${eventType}`, ticker, `${ticker}:*`]
      : [ticker, `${ticker}:*`];

    return [...new Set(keys)];
  }
}

// --- Utility ---

function num(envKey: string, fallback: number): number {
  const v = process.env[envKey];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isSecForm4Event(event: RawEvent): boolean {
  const normalizedType = event.type.toLowerCase();
  const title = event.title.toLowerCase();
  const body = event.body.toLowerCase();
  const formType = event.metadata?.['form_type'] ?? event.metadata?.['formType'];

  return (
    normalizedType.includes('form-4')
    || normalizedType.includes('form_4')
    || normalizedType === '4'
    || title.includes('form 4')
    || body.includes('form 4')
    || formType === '4'
    || formType === 'Form 4'
  );
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

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test'
    || process.env.VITEST === 'true'
    || process.env.VITEST_WORKER_ID != null
    || process.argv.some((arg) => arg.includes('vitest'));
}
