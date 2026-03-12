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
      socialMinUpvotes: 500,
      socialMinComments: 200,
      tickerCooldownMinutes: 60,
      insiderMinValue: 1_000_000,
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

  describe('Rule 4: Dummy events', () => {
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

  describe('Rule 6: Congress trades', () => {
    it('should always pass congress trades', () => {
      const event = makeEvent({ source: 'congress', type: 'congress-trade' });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.enrichWithLLM).toBe(true);
      expect(result.reason).toContain('congress');
    });
  });

  describe('Rule 8: Unusual options', () => {
    it('should always pass unusual options activity', () => {
      const event = makeEvent({ source: 'unusual-options', type: 'unusual-options' });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.enrichWithLLM).toBe(true);
    });
  });

  describe('Rule 7: Insider trades', () => {
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

  describe('Rule 2: Social noise filter', () => {
    it('should pass high-engagement reddit posts (upvotes)', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 600, comments: 50 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should pass high-engagement reddit posts (comments)', () => {
      const event = makeEvent({
        source: 'reddit',
        type: 'post',
        metadata: { upvotes: 100, comments: 250 },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
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

  describe('Rule 3: Breaking news', () => {
    it('should pass breaking news with watchlist ticker', () => {
      const event = makeEvent({
        source: 'breaking-news',
        type: 'breaking-news',
        title: 'Some news about TSLA',
        metadata: { ticker: 'TSLA' },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should pass breaking news with keyword', () => {
      const event = makeEvent({
        source: 'breaking-news',
        type: 'breaking-news',
        title: 'Market crash feared after tariff announcement',
        body: 'Details about the crash...',
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
      expect(result.reason).toContain('keyword');
    });

    it('should pass breaking news with any ticker', () => {
      const event = makeEvent({
        source: 'breaking-news',
        type: 'breaking-news',
        title: 'XYZ Corp announces something',
        metadata: { ticker: 'XYZ' },
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });

    it('should block breaking news without ticker or keyword', () => {
      const event = makeEvent({
        source: 'breaking-news',
        type: 'breaking-news',
        title: 'Minor update on weather',
        body: 'Nothing market-related',
      });
      const result = filter.check(event);
      expect(result.pass).toBe(false);
    });
  });

  describe('Rule 5: Calendar events', () => {
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

    it('should pass FDA calendar events without date', () => {
      const event = makeEvent({
        source: 'fda',
        type: 'fda-calendar',
      });
      const result = filter.check(event);
      expect(result.pass).toBe(true);
    });
  });

  describe('Rule 1: Dedup cooldown', () => {
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
