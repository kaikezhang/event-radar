import { describe, it, expect, beforeEach } from 'vitest';
import { AlertFilter } from '../pipeline/alert-filter.js';
import type { RawEvent } from '@event-radar/shared';

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
      // Saturday noon ET — CLOSED session, should use 16h window
      const closedNow = new Date('2026-03-14T17:00:00Z'); // Saturday noon ET
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => closedNow,
      });
      // Event from 10h ago — should PASS during CLOSED (16h window)
      const event = makeEvent({
        timestamp: new Date(closedNow.getTime() - 10 * 60 * 60_000),
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should still block very old events during CLOSED session (>16h)', () => {
      const closedNow = new Date('2026-03-14T17:00:00Z');
      const staleFilter = new AlertFilter({
        enabled: true,
        maxAgeMinutes: 120,
        nowFn: () => closedNow,
      });
      const event = makeEvent({
        timestamp: new Date(closedNow.getTime() - 20 * 60 * 60_000), // 20h old
      });
      const result = staleFilter.check(event);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('stale');
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
        metadata: { ticker: 'NVDA', transactionValue: 5_000_000 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.enrichWithLLM).toBe(true);
    });

    it('should block insider trades with value < $1M', () => {
      const event = makeEvent({
        source: 'sec-edgar',
        type: 'form-4',
        metadata: { ticker: 'XYZ', transactionValue: 500_000 },
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
