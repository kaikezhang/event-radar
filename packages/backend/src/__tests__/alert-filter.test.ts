import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlertFilter } from '../pipeline/alert-filter.js';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'test',
    type: 'test',
    title: 'Test event',
    body: 'Test body',
    timestamp: new Date(),
    metadata: {},
    ...overrides,
  };
}

describe('AlertFilter', () => {
  let filter: AlertFilter;

  beforeEach(() => {
    filter = new AlertFilter({
      watchlist: ['NVDA', 'TSLA', 'AAPL'],
      socialMinUpvotes: 1000,
      socialMinComments: 500,
      tickerCooldownMinutes: 60,
      insiderMinValue: 1_000_000,
      maxAgeMinutes: 120,
      enabled: true,
    });
  });

  afterEach(() => {
    filter.dispose();
    vi.useRealTimers();
  });

  describe('disabled filter', () => {
    it('should pass all events when disabled', () => {
      const disabled = new AlertFilter({ enabled: false });
      const event = makeEvent({ source: 'dummy', type: 'dummy' });
      const result = disabled.check(event);
      expect(result.pass).toBe(true);
      expect(result.reason).toBe('filter disabled');
    });
  });

  describe('Dummy events', () => {
    it('should skip events from dummy source', () => {
      const event = makeEvent({ source: 'dummy', type: 'heartbeat' });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('dummy');
    });

    it('should skip events with dummy type', () => {
      const event = makeEvent({ source: 'other', type: 'dummy' });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
    });
  });

  describe('Staleness — session-aware', () => {
    it('should block stale events during market hours (>2h)', () => {
      // Use a weekday during RTH for the nowFn
      const rthNow = new Date('2026-03-11T14:00:00Z'); // ~10am ET on Wednesday
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => rthNow,
      });
      const event = makeEvent({
        timestamp: new Date(rthNow.getTime() - 3 * 60 * 60_000), // 3h old
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('stale');
    });

    it('should pass fresh events during market hours', () => {
      const rthNow = new Date('2026-03-11T14:00:00Z');
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => rthNow,
      });
      const event = makeEvent({
        timestamp: new Date(rthNow.getTime() - 30 * 60_000), // 30min old
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should extend staleness window during CLOSED session (overnight/weekend)', () => {
      // Saturday noon ET — CLOSED session, next open is Monday 09:30 ET (~45.5h away)
      const closedNow = new Date('2026-03-14T17:00:00Z'); // Saturday noon ET
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => closedNow,
      });
      // Event from 10h ago — should PASS (next open is ~45.5h away)
      const event = makeEvent({
        timestamp: new Date(closedNow.getTime() - 10 * 60 * 60_000),
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should pass Friday close events through to Monday open', () => {
      // Saturday noon ET, event from Friday 16:00 ET (~20h ago)
      const closedNow = new Date('2026-03-14T17:00:00Z'); // Saturday noon ET
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => closedNow,
      });
      const event = makeEvent({
        timestamp: new Date(closedNow.getTime() - 20 * 60 * 60_000), // 20h old
      });
      const result = staleFilter.check(event);
      // Next open is ~45.5h away, so 20h old event should pass
      expect(result.pass).toBe(true);
    });

    it('should block events older than time-to-next-session during CLOSED', () => {
      // Saturday noon ET, next open Monday 09:30 ET (~45.5h away)
      const closedNow = new Date('2026-03-14T17:00:00Z');
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => closedNow,
      });
      // Event from 50h ago — older than ~45.5h window
      const event = makeEvent({
        timestamp: new Date(closedNow.getTime() - 50 * 60 * 60_000),
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('stale');
    });

    it('should handle holiday weekends with extended staleness', () => {
      // Thursday 2026-04-02 20:00 ET, Good Friday is a holiday
      // Next open = Monday 2026-04-06 09:30 ET (~85.5h away)
      // Use a helper to build the ET date
      const etStr = '2026-04-03T01:00:00.000Z'; // ~Thu 21:00 ET (EDT offset)
      const closedNow = new Date(etStr);
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => closedNow,
      });
      // Event from 40h ago should pass (next open is ~85.5h from Thu 20:00)
      const event = makeEvent({
        timestamp: new Date(closedNow.getTime() - 40 * 60 * 60_000),
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(true);
    });
  });

  describe('Retrospective patterns', () => {
    it('should block retrospective articles from any source', () => {
      const event = makeEvent({
        source: 'breaking-news',
        title: "Here's why AAPL stock dropped today",
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('retrospective');
    });

    it('should block retrospective articles even from primary sources', () => {
      const event = makeEvent({
        source: 'whitehouse',
        title: "Here's why the market dropped today",
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('retrospective');
    });

    it('should block analyst opinion articles', () => {
      const event = makeEvent({
        source: 'breaking-news',
        title: 'Analyst says NVDA will soar to $200',
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('retrospective');
    });
  });

  describe('Clickbait patterns', () => {
    it('should block clickbait content', () => {
      const event = makeEvent({
        source: 'breaking-news',
        title: "Buy these stocks before it's too late",
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('clickbait');
    });

    it('should block "you need to know" patterns', () => {
      const event = makeEvent({
        source: 'reddit',
        title: 'What you need to know about TSLA earnings',
        metadata: { upvotes: 2000, comments: 600 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('clickbait');
    });
  });

  describe('Primary sources — no longer bypass filters', () => {
    it('should pass congress trades through L1 (no bypass, but passes as default)', () => {
      const event = makeEvent({ source: 'congress', type: 'congress-trade' });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.reason).toBe('L1 pass');
      expect(result.enrichWithLLM).toBe(true);
    });

    it('should pass unusual options through L1', () => {
      const event = makeEvent({ source: 'unusual-options', type: 'unusual-options' });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.enrichWithLLM).toBe(true);
    });

    it('should pass whitehouse events through L1', () => {
      const event = makeEvent({ source: 'whitehouse', type: 'executive-order' });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });
  });

  describe('Insider trades', () => {
    it('should pass insider trades with value >= $1M', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'form-4',
        metadata: { ticker: 'NVDA', transactionValue: 5_000_000, shares: 100_000 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.enrichWithLLM).toBe(true);
    });

    it('should block insider trades with value < $1M', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'form-4',
        metadata: { ticker: 'XYZ', transactionValue: 500_000, shares: 5_000 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('500000');
    });

    it('should block insider trades with no value', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'form-4',
        metadata: { ticker: 'XYZ' },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
    });

    it('should block sec_form_4 events with zero transaction value', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'sec_form_4',
        title: 'SEC Form 4 filing',
        metadata: { ticker: 'XYZ', transactionValue: 0, shares: null },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.enrichWithLLM).toBe(false);
    });

    it('should block Form 4 title variants with missing transaction value', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'filing',
        title: 'Form 4 - insider filing',
        metadata: { ticker: 'XYZ', form_type: '4', shares: null },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.enrichWithLLM).toBe(false);
    });

    it('should block Form 4 filings with missing share counts', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'form-4',
        title: 'Form 4 - officer transaction',
        metadata: { ticker: 'XYZ', transactionValue: 5_000_000, shares: null },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.enrichWithLLM).toBe(false);
    });
  });

  describe('Social noise filter — updated thresholds', () => {
    it('should pass high-engagement reddit posts (upvotes >= 1000)', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 1200, comments: 50 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should block reddit posts with old threshold (upvotes 600 < 1000)', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 600, comments: 50 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('social noise');
    });

    it('should pass high-engagement reddit posts (comments >= 500)', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 100, comments: 600 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should block reddit posts with old comment threshold (250 < 500)', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 100, comments: 250 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
    });

    it('should pass posts with high_engagement flag', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 10, comments: 5, high_engagement: true },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should pass watchlist ticker posts with >100 upvotes', () => {
      const event = makeEvent({
        source: 'stocktwits',
        type: 'post',
        metadata: { ticker: 'NVDA', upvotes: 150, comments: 20 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.reason).toContain('watchlist');
    });

    it('should block low-engagement social posts', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 50, comments: 30 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('social noise');
    });

    it('should block non-watchlist ticker with low upvotes', () => {
      const event = makeEvent({
        source: 'stocktwits',
        type: 'post',
        metadata: { ticker: 'UNKNOWN', upvotes: 150, comments: 20 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
    });
  });

  describe('Breaking news — no keyword filter (removed)', () => {
    it('should pass breaking news through L1 without keyword requirement', () => {
      const event = makeEvent({
        source: 'breaking-news',
        type: 'breaking-news',
        title: 'TSLA announces routine quarterly update',
        metadata: { ticker: 'TSLA' },
      });
      const result = filter.check(event);
      // Now passes L1 — LLM Judge (L2) will decide relevance
      expect(result.pass).toBe(true);
      expect(result.reason).toBe('L1 pass');
    });

    it('should pass breaking news without keywords through to L2', () => {
      const event = makeEvent({
        source: 'breaking-news',
        type: 'breaking-news',
        title: 'Minor policy update from trade office',
        body: 'Details about the update',
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });
  });

  describe('Calendar events', () => {
    it('should pass earnings events for today', () => {
      const today = new Date().toISOString().split('T')[0];
      const event = makeEvent({
        source: 'econ-calendar',
        type: 'earnings',
        metadata: { ticker: 'AAPL', eventDate: today },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should pass earnings events for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const event = makeEvent({
        source: 'econ-calendar',
        type: 'earnings',
        metadata: { ticker: 'MSFT', eventDate: tomorrow.toISOString().split('T')[0] },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should block calendar events far in the future', () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const event = makeEvent({
        source: 'econ-calendar',
        type: 'earnings',
        metadata: { ticker: 'GOOG', eventDate: nextWeek.toISOString().split('T')[0] },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('too far away');
    });
  });

  describe('Ticker cooldown', () => {
    it('should apply per-ticker cooldown', () => {
      const event1 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA' },
      });
      const event2 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA' },
      });

      const r1 = filter.check(event1);
      expect(r1.pass).toBe(true);

      const r2 = filter.check(event2);
      expect(r2.pass).toBe(false);
      expect(r2.reason).toContain('cooldown');
    });

    it('should allow different tickers', () => {
      const event1 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA' },
      });
      const event2 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'TSLA' },
      });

      expect(filter.check(event1).pass).toBe(true);
      expect(filter.check(event2).pass).toBe(true);
    });

    it('should allow the same ticker across different event types', () => {
      const event1 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA', eventType: 'earnings_beat' },
      });
      const event2 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA', eventType: 'guidance_raise' },
      });

      expect(filter.check(event1).pass).toBe(true);
      expect(filter.check(event2).pass).toBe(true);
    });

    it('should block the same ticker and llm event type combination', () => {
      const event1 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA' },
      });
      const event2 = makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA' },
      });
      const llmResult = makeLlmResult({ eventType: 'earnings_beat' });

      expect(filter.check(event1, llmResult).pass).toBe(true);
      const second = filter.check(event2, llmResult);
      expect(second.pass).toBe(false);
      expect(second.reason).toContain('cooldown');
    });

    it('should apply legacy ticker cooldowns across all event types after migration', () => {
      const now = Date.now();
      const legacyAwareFilter = new AlertFilter({
        tickerCooldownMinutes: 60,
        nowFn: () => new Date(now),
      });

      (legacyAwareFilter as {
        loadCooldownEntries(entries: Record<string, number>): void;
      }).loadCooldownEntries({
        NVDA: now - 5_000,
      });

      const result = legacyAwareFilter.check(
        makeEvent({
          source: 'congress',
          type: 'congress-trade',
          metadata: { ticker: 'NVDA', eventType: 'earnings_beat' },
        }),
      );

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('cooldown');

      legacyAwareFilter.dispose();
    });

    it('should prune expired cooldown entries on the runtime interval', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

      const pruningFilter = new AlertFilter({
        tickerCooldownMinutes: 1,
        nowFn: () => new Date(Date.now()),
      });

      pruningFilter.check(makeEvent({
        source: 'congress',
        type: 'congress-trade',
        metadata: { ticker: 'NVDA', eventType: 'earnings_beat' },
      }));

      const cooldownMap = (pruningFilter as { cooldownMap: Map<string, number> }).cooldownMap;
      expect(cooldownMap.size).toBe(1);

      await vi.advanceTimersByTimeAsync(600_000);

      expect(cooldownMap.size).toBe(0);
      pruningFilter.dispose();
    });

    it('should cap cooldown map size by evicting the oldest entries', () => {
      const cappedFilter = new AlertFilter({
        tickerCooldownMinutes: 60,
        nowFn: () => new Date('2026-03-15T12:00:00.000Z'),
      });
      const cooldownMap = (cappedFilter as { cooldownMap: Map<string, number> }).cooldownMap;
      const baseTs = Date.parse('2026-03-15T11:00:00.000Z');

      for (let i = 0; i < 10_005; i++) {
        cooldownMap.set(`TICK${i}:news_breaking`, baseTs + i);
      }

      (cappedFilter as { pruneExpired(now?: number): void }).pruneExpired(Date.parse('2026-03-15T12:00:00.000Z'));

      expect(cooldownMap.size).toBe(10_000);
      expect(cooldownMap.has('TICK0:news_breaking')).toBe(false);
      expect(cooldownMap.has('TICK4:news_breaking')).toBe(false);
      expect(cooldownMap.has('TICK5:news_breaking')).toBe(true);

      cappedFilter.dispose();
    });

    it('should not apply cooldown to events without ticker', () => {
      const event1 = makeEvent({ source: 'congress', type: 'congress-trade' });
      const event2 = makeEvent({ source: 'congress', type: 'congress-trade' });

      expect(filter.check(event1).pass).toBe(true);
      expect(filter.check(event2).pass).toBe(true);
    });
  });

  describe('Default pass-through', () => {
    it('should pass unknown event types with LLM enrichment', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: '8-K',
        metadata: { ticker: 'XYZ' },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.enrichWithLLM).toBe(true);
    });
  });
});

function makeLlmResult(
  overrides: Partial<LlmClassificationResult> = {},
): LlmClassificationResult {
  return {
    severity: 'HIGH',
    direction: 'BULLISH',
    eventType: 'news_breaking',
    confidence: 0.8,
    reasoning: 'test',
    tags: ['test'],
    priority: 5,
    matchedRules: [],
    ...overrides,
  };
}
