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
  /\b(?:live updates?|live blog|as it happened)\b/i,
  /\b(?:explainer|explained|recap|roundup|digest)\b/i,
  /\b(?:after|following)\b.+\b(?:earnings|results|the call|the report)\b/i,
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
  /\b(?:average retiree|retirees?|retirement savers?)\b.+\b(?:gets?|need(?:s)?|should|must|can|could)\b/i,
  /\b(?:social security|401\(k\)|ira)\b.+\b(?:check|benefit|claim|withdraw|retire|income)\b/i,
  /\b(?:passive income|millionaire maker|set for life)\b/i,
  /\bturn \$?\d[\d,]*(?:\s+into|\s+to)\s+\$?\d[\d,]*/i,
  /\b(?:should you buy|is it time to buy|is it a buy)\b/i,
  /\b(?:buy|sell|hold)\b.+\b(?:now|today)\b/i,
];

const NEWSWIRE_NEGATIVE_PATTERNS = [
  /\b(?:will|to)\s+(?:present|participate|host|attend)\b.+\b(?:conference|summit|webcast|fireside chat|investor day|forum|expo)\b/i,
  /\b(?:announces?|scheduled?|schedules?)\b.+\b(?:conference call|webcast|presentation|fireside chat|investor day)\b/i,
  /\b(?:conference|webcast|fireside chat|investor day|forum|expo)\b/i,
  /\b(?:rings?|ringing)\b.+\bopening bell\b/i,
  /\b(?:publishes?|releases?)\b.+\b(?:sustainability|esg|csr)\s+report\b/i,
  /\b(?:opens?|opening)\b.+\b(?:store|location|branch|office|showroom)\b/i,
  /\b(?:launches?|unveils?)\b.+\b(?:website|brand campaign|marketing campaign|podcast|newsletter)\b/i,
  /\b(?:partners?|collaborates?)\s+with\b.+\b(?:university|college|nonprofit|association)\b/i,
];

type CooldownSeverity = NonNullable<LlmClassificationResult['severity']>;

const COOLDOWN_SEVERITIES: readonly CooldownSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const NEXT_SESSION_SOURCES = new Set([
  'truth-social',
  'whitehouse',
  'federal-register',
  'sec-regulatory',
  'fed',
  'treasury',
  'commerce',
  'cfpb',
  'ftc',
]);

const OFFICIAL_FILING_SOURCES = new Set([
  'sec-edgar',
  'fda',
  'trading-halt',
  'pr-newswire',
  'businesswire',
  'globenewswire',
  'company-ir',
  'ir-monitor',
]);

const FAST_MOVING_SOURCES = new Set([
  'breaking-news',
  'yahoo-finance',
  'reddit',
  'stocktwits',
  'social-signal',
  'community-post',
]);

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
 * - Staleness: 2h during market hours, extend to next weekday session for overnight/weekend
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

    // Rule 0: Staleness — source-aware thresholds with next-session carry for official sources
    const now = this.nowFn();
    const eventAge = now.getTime() - event.timestamp.getTime();
    const effectiveMaxAge = this.getEffectiveMaxAge(event, now);
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

    // Rule 3: Newswire noise filter — require US-listed ticker or HIGH+ keyword
    if (source === 'pr-newswire' || source === 'businesswire' || source === 'globenewswire') {
      return this.checkNewswire(event, ticker);
    }

    // Rule 4: Insider trade threshold and meaningless Form 4 suppression
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

    // Rule 5: Social noise filter — detect social chatter from engagement metadata
    if (isSocialSignal(event)) {
      return this.checkSocial(event, ticker);
    }

    // Rule 6: Calendar events — only if today or tomorrow
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
   * Source-aware staleness calculation.
   * Fast-moving secondary/social sources expire quickly during active sessions.
   * Official filings / press releases get a wider window, and policy/official
   * sources stay valid until the next liquid session when markets are closed.
   */
  private getEffectiveMaxAge(event: RawEvent, now: Date): number {
    const session = getMarketSession(now);
    const source = event.source.toLowerCase();

    if (NEXT_SESSION_SOURCES.has(source)) {
      return this.getNextSessionAwareMaxAge(now, this.maxAgeMs);
    }

    if (OFFICIAL_FILING_SOURCES.has(source)) {
      if (session === 'RTH') return 30 * 60_000;
      if (session === 'PRE' || session === 'POST') return 90 * 60_000;
      return this.getNextSessionAwareMaxAge(now, 90 * 60_000);
    }

    if (FAST_MOVING_SOURCES.has(source)) {
      if (session === 'RTH') return 15 * 60_000;
      return 30 * 60_000;
    }

    return this.getNextSessionAwareMaxAge(now, this.maxAgeMs);
  }

  private getNextSessionAwareMaxAge(now: Date, fallbackMs: number): number {
    if (getMarketSession(now) !== 'CLOSED') {
      return fallbackMs;
    }

    const nextOpenMs = getNextSessionOpenMs(now);
    const msUntilOpen = nextOpenMs - now.getTime();
    return Math.max(fallbackMs, msUntilOpen);
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
    const matchedNegativePattern = NEWSWIRE_NEGATIVE_PATTERNS.find((pattern) => pattern.test(titleAndBody));

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

    if (matchedNegativePattern && !hasPassKeyword) {
      return {
        pass: false,
        reason: `newswire noise: matched "${matchedNegativePattern.source}"`,
        enrichWithLLM: false,
      };
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
    const severity = this.resolveSeverity(event, llmResult);
    const now = this.nowFn().getTime();
    this.pruneExpired(now);

    const lastAlert = this.getCooldownLookupKeys(ticker, eventType, severity)
      .map((key) => this.cooldownMap.get(key))
      .find((ts): ts is number => typeof ts === 'number');

    if (lastAlert && now - lastAlert < this.tickerCooldownMs) {
      return {
        pass: false,
        reason: `ticker ${ticker} cooldown (last alert ${Math.round((now - lastAlert) / 1000)}s ago)`,
        enrichWithLLM: false,
      };
    }

    const writeKey = this.getCooldownWriteKey(ticker, eventType, severity);
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

      const normalizedKey = this.normalizeCooldownKey(key);
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

  private resolveSeverity(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): CooldownSeverity | undefined {
    const metadataSeverity = event.metadata?.['severity'];
    if (isCooldownSeverity(metadataSeverity)) {
      return metadataSeverity;
    }

    if (isCooldownSeverity(llmResult?.severity)) {
      return llmResult.severity;
    }

    return undefined;
  }

  private getCooldownLookupKeys(
    ticker: string,
    eventType?: string,
    severity?: CooldownSeverity,
  ): string[] {
    const normalizedType = normalizeEventType(eventType);
    const blockingSeverities = severity
      ? [...COOLDOWN_SEVERITIES.slice(getSeverityIndex(severity)), '*']
      : ['*'];
    const typeKeys = normalizedType ? [normalizedType, '*'] : ['*'];
    const keys: string[] = [];

    for (const typeKey of typeKeys) {
      for (const severityKey of blockingSeverities) {
        keys.push(`${ticker}:${typeKey}:${severityKey}`);
      }
    }

    if (normalizedType) {
      keys.push(`${ticker}:${normalizedType}`);
    }
    keys.push(ticker);

    return [...new Set(keys)];
  }

  private getCooldownWriteKey(
    ticker: string,
    eventType?: string,
    severity?: CooldownSeverity,
  ): string {
    return `${ticker}:${normalizeEventType(eventType) ?? '*'}:${severity ?? '*'}`;
  }

  private normalizeCooldownKey(key: string): string {
    const parts = key.split(':');

    if (parts.length === 1) {
      return `${parts[0]!.toUpperCase()}:*:*`;
    }

    if (parts.length === 2) {
      return `${parts[0]!.toUpperCase()}:${normalizeEventType(parts[1]) ?? '*'}:*`;
    }

    const ticker = parts[0]!.toUpperCase();
    const severity = parts[parts.length - 1]!;
    const eventTypeValue = parts.slice(1, -1).join(':');

    return `${ticker}:${normalizeEventType(eventTypeValue) ?? '*'}:${isCooldownSeverity(severity) ? severity : '*'}`;
  }
}

// --- Utility ---

function num(envKey: string, fallback: number): number {
  const v = process.env[envKey];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeEventType(eventType?: string): string | undefined {
  const normalized = eventType?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isCooldownSeverity(value: unknown): value is CooldownSeverity {
  return typeof value === 'string' && COOLDOWN_SEVERITIES.includes(value as CooldownSeverity);
}

function getSeverityIndex(severity: CooldownSeverity): number {
  return COOLDOWN_SEVERITIES.indexOf(severity);
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

function isSocialSignal(event: RawEvent): boolean {
  return [
    'high_engagement',
    'upvotes',
    'score',
    'comments',
    'commentCount',
  ].some((key) => event.metadata?.[key] != null);
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
