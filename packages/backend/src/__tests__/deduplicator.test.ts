import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { RawEvent } from '@event-radar/shared';
import { sql } from 'drizzle-orm';
import { EventDeduplicator } from '../pipeline/deduplicator.js';
import {
  exactIdMatch,
  tickerWindowMatch,
  contentSimilarityMatch,
  findBestMatch,
} from '../pipeline/dedup-strategies.js';
import { createTestDb, safeClose } from './helpers/test-db.js';

/* ── helpers ─────────────────────────────────────────────────────── */

let eventCounter = 0;
function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  eventCounter++;
  return {
    id: `550e8400-e29b-41d4-a716-44665544${String(eventCounter).padStart(4, '0')}`,
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test Corp files for bankruptcy',
    body: 'Test Corp has filed for Chapter 11 bankruptcy protection.',
    url: 'https://www.sec.gov/filing/test',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { item_types: ['1.03'], ticker: 'TEST' },
    ...overrides,
  };
}

beforeEach(() => {
  eventCounter = 0;
});

/* ── 1. Dedup Strategies ─────────────────────────────────────────── */

describe('exactIdMatch', () => {
  it('should match events with same filingId', () => {
    const e1 = makeEvent({ metadata: { filingId: 'SEC-123' } });
    const e2 = makeEvent({ metadata: { filingId: 'SEC-123' } });
    const result = exactIdMatch(e2, e1);

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('exact-id');
    expect(result!.confidence).toBe(1.0);
  });

  it('should match events with same tweetId', () => {
    const e1 = makeEvent({ metadata: { tweetId: '123456' } });
    const e2 = makeEvent({ metadata: { tweetId: '123456' } });
    const result = exactIdMatch(e2, e1);

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('exact-id');
  });

  it('should not match events with different IDs', () => {
    const e1 = makeEvent({ metadata: { filingId: 'SEC-123' } });
    const e2 = makeEvent({ metadata: { filingId: 'SEC-456' } });
    const result = exactIdMatch(e2, e1);

    expect(result).toBeNull();
  });

  it('should not match events with no ID fields', () => {
    const e1 = makeEvent({ metadata: { ticker: 'AAPL' } });
    const e2 = makeEvent({ metadata: { ticker: 'AAPL' } });
    const result = exactIdMatch(e2, e1);

    expect(result).toBeNull();
  });
});

describe('tickerWindowMatch', () => {
  it('should match same ticker + type + similar title within 5 minutes', () => {
    const e1 = makeEvent({
      title: 'AAPL reports quarterly earnings results',
      metadata: { ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      title: 'AAPL reports quarterly earnings results today',
      metadata: { ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:03:00Z'),
    });
    const result = tickerWindowMatch(e2, e1);

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('ticker-window');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result!.confidence).toBeLessThanOrEqual(0.9);
  });

  it('should not match different tickers', () => {
    const e1 = makeEvent({ metadata: { ticker: 'AAPL' } });
    const e2 = makeEvent({ metadata: { ticker: 'GOOG' } });
    const result = tickerWindowMatch(e2, e1);

    expect(result).toBeNull();
  });

  it('should not match same ticker with different event types', () => {
    const e1 = makeEvent({ type: '8-K', metadata: { ticker: 'AAPL' } });
    const e2 = makeEvent({ type: '10-K', metadata: { ticker: 'AAPL' } });
    const result = tickerWindowMatch(e2, e1);

    expect(result).toBeNull();
  });

  it('should not match events outside the 5-minute window', () => {
    const e1 = makeEvent({
      metadata: { ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      metadata: { ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:06:00Z'),
    });
    const result = tickerWindowMatch(e2, e1);

    expect(result).toBeNull();
  });

  it('should not match same ticker + type with dissimilar titles', () => {
    const e1 = makeEvent({
      title: '8-K: TestCorp — 1.03 Bankruptcy',
      metadata: { ticker: 'TEST' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      title: '8-K: TestCorp — 2.02 Earnings',
      metadata: { ticker: 'TEST' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });
    const result = tickerWindowMatch(e2, e1);

    expect(result).toBeNull();
  });
});

describe('contentSimilarityMatch', () => {
  it('should match nearly identical headlines from different sources', () => {
    const e1 = makeEvent({
      source: 'reuters',
      title: 'Apple announces record Q4 earnings beating expectations',
      body: 'Apple Inc reported record fourth-quarter earnings today.',
    });
    const e2 = makeEvent({
      source: 'bloomberg',
      title: 'Apple announces record Q4 earnings beating expectations',
      body: 'Apple Inc reported record fourth-quarter earnings today.',
    });
    const result = contentSimilarityMatch(e2, e1);

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('content-similarity');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should not match completely different events', () => {
    const e1 = makeEvent({
      title: 'Apple announces record Q4 earnings',
      body: 'Revenue exceeded analyst expectations.',
    });
    const e2 = makeEvent({
      title: 'Tesla recalls 500000 vehicles',
      body: 'The recall affects Model 3 and Model Y vehicles.',
    });
    const result = contentSimilarityMatch(e2, e1);

    expect(result).toBeNull();
  });
});

/* ── 2. EventDeduplicator ────────────────────────────────────────── */

describe('EventDeduplicator', () => {
  let dedup: EventDeduplicator;
  let testDbClient: Awaited<ReturnType<typeof createTestDb>>['client'] | null = null;

  beforeEach(() => {
    dedup = new EventDeduplicator({ windowMs: 30 * 60 * 1000 });
  });

  afterEach(async () => {
    if (testDbClient) {
      await safeClose(testDbClient);
      testDbClient = null;
    }
  });

  it('should pass through unique events (non-duplicate)', async () => {
    const event = makeEvent();
    const result = await dedup.check(event);

    expect(result.isDuplicate).toBe(false);
    expect(result.matchType).toBe('none');
    expect(result.matchConfidence).toBe(0);
    expect(result.originalEventId).toBeUndefined();
  });

  it('should detect exact ID duplicate (same filing from RSS + API)', async () => {
    const e1 = makeEvent({
      source: 'sec-rss',
      metadata: { filingId: 'SEC-2024-001', ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'sec-api',
      metadata: { filingId: 'SEC-2024-001', ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    const now = new Date('2024-01-15T10:01:00Z');
    await dedup.check(e1, now);
    const result = await dedup.check(e2, now);

    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('exact-id');
    expect(result.matchConfidence).toBe(1.0);
    expect(result.originalEventId).toBe(e1.id);
  });

  it('should detect ticker + time window duplicate (Trump tariff post + news repost)', async () => {
    const e1 = makeEvent({
      source: 'truth-social',
      type: 'political-post',
      title: 'Trump announces new tariffs on China imports',
      body: 'Big tariffs coming on China imports. America First!',
      metadata: { ticker: 'SPY', postId: 'ts-001' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'news-wire',
      type: 'political-post',
      title: 'Trump announces new tariffs on China imports today',
      body: 'Markets react to tariff news from President Trump.',
      metadata: { ticker: 'SPY' },
      timestamp: new Date('2024-01-15T10:03:00Z'),
    });

    const now = new Date('2024-01-15T10:03:00Z');
    await dedup.check(e1, now);
    const result = await dedup.check(e2, now);

    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('ticker-window');
  });

  it('should detect Truth Social duplicates when identical titles arrive with different post ids', async () => {
    const e1 = makeEvent({
      source: 'truth-social',
      type: 'political-post',
      title: 'TRUTH: NEW TARIFFS ON CHINA WILL BEGIN IMMEDIATELY',
      body: 'First feed payload.',
      metadata: { postId: 'truth-social-guid-1001' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'truth-social',
      type: 'political-post',
      title: 'TRUTH: NEW TARIFFS ON CHINA WILL BEGIN IMMEDIATELY',
      body: 'Second feed payload with a different GUID.',
      metadata: { postId: 'truth-social-guid-1002' },
      timestamp: new Date('2024-01-15T10:10:00Z'),
    });

    await dedup.check(e1, e1.timestamp);
    const result = await dedup.check(e2, e2.timestamp);

    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('content-similarity');
    expect(result.originalEventId).toBe(e1.id);
  });

  it('should normalize Truth Social titles before matching duplicates', async () => {
    const e1 = makeEvent({
      source: 'truth-social',
      type: 'political-post',
      title: 'Peace Deal With Iran Is Near',
      body: 'Original feed title.',
      metadata: { postId: 'truth-social-guid-2001' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'truth-social',
      type: 'political-post',
      title: '  Peace   Deal With Iran Is Near  ',
      body: 'Whitespace differs but the post is the same.',
      metadata: { postId: 'truth-social-guid-2002' },
      timestamp: new Date('2024-01-15T10:20:00Z'),
    });

    await dedup.check(e1, e1.timestamp);
    const result = await dedup.check(e2, e2.timestamp);

    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('content-similarity');
    expect(result.originalEventId).toBe(e1.id);
  });

  it('should detect Truth Social duplicates from the database by identical title within 24 hours', async () => {
    const { db, client } = await createTestDb();
    testDbClient = client;
    dedup = new EventDeduplicator({ db, windowMs: 30 * 60 * 1000 });

    const original = makeEvent({
      id: '550e8400-e29b-41d4-a716-446655440111',
      source: 'truth-social',
      type: 'political-post',
      title: 'America First Trade Deal Is Coming Soon',
      body: 'Stored event body.',
      metadata: { postId: 'truth-social-guid-db-1' },
      timestamp: new Date('2024-01-15T08:00:00Z'),
    });

    await db.execute(sql`
      INSERT INTO events (
        id,
        source,
        source_event_id,
        title,
        summary,
        metadata,
        severity,
        received_at,
        created_at
      )
      VALUES (
        ${original.id},
        ${original.source},
        ${String(original.metadata?.['postId'])},
        ${original.title},
        ${original.body},
        ${JSON.stringify(original.metadata ?? {})}::jsonb,
        'HIGH',
        ${new Date('2024-01-15T08:00:00Z')},
        ${new Date('2024-01-15T08:00:00Z')}
      )
    `);

    const duplicate = makeEvent({
      id: '550e8400-e29b-41d4-a716-446655440112',
      source: 'truth-social',
      type: 'political-post',
      title: 'America First Trade Deal Is Coming Soon',
      body: 'Fresh scan with a new RSS GUID.',
      metadata: { postId: 'truth-social-guid-db-2' },
      timestamp: new Date('2024-01-15T17:00:00Z'),
    });

    const result = await dedup.check(duplicate, duplicate.timestamp);

    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('db-lookup');
    expect(result.originalEventId).toBe(original.id);
  });

  it('should detect content similarity duplicate (similar headlines from newswires)', async () => {
    const e1 = makeEvent({
      source: 'reuters',
      title: 'Federal Reserve raises interest rates by 25 basis points',
      body: 'The Federal Reserve announced a 25 basis point rate increase today.',
      metadata: { ticker: 'SPY' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'ap-news',
      title: 'Federal Reserve raises interest rates by 25 basis points',
      body: 'The Federal Reserve announced a 25 basis point rate increase today.',
      metadata: { ticker: 'QQQ' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    const now = new Date('2024-01-15T10:01:00Z');
    await dedup.check(e1, now);
    const result = await dedup.check(e2, now);

    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('content-similarity');
    expect(result.matchConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should group 3 related events into 1 story', async () => {
    const e1 = makeEvent({
      source: 'sec-rss',
      metadata: { filingId: 'MERGER-001', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'sec-api',
      metadata: { filingId: 'MERGER-001', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:02:00Z'),
    });
    const e3 = makeEvent({
      source: 'news-wire',
      metadata: { filingId: 'MERGER-001', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:05:00Z'),
    });

    const now = new Date('2024-01-15T10:05:00Z');
    await dedup.check(e1, now);
    const r2 = await dedup.check(e2, now);
    const r3 = await dedup.check(e3, now);

    expect(r2.isDuplicate).toBe(true);
    expect(r2.storyId).toBeDefined();

    expect(r3.isDuplicate).toBe(true);
    expect(r3.storyId).toBe(r2.storyId);

    // Story should have 3 events
    const story = dedup.getStory(e1.id);
    expect(story).toBeDefined();
    expect(story!.eventCount).toBe(3);
    expect(story!.storyId).toBe(e1.id); // First event becomes story anchor
  });

  it('should remove old events from sliding window', async () => {
    const oldEvent = makeEvent({
      metadata: { filingId: 'OLD-001' },
      timestamp: new Date('2024-01-15T09:00:00Z'),
    });

    // Add old event at its timestamp
    await dedup.check(oldEvent, new Date('2024-01-15T09:00:00Z'));
    expect(dedup.windowSize).toBe(1);

    // 31 minutes later, the old event should be cleaned up
    const newEvent = makeEvent({
      metadata: { filingId: 'OLD-001' },
      timestamp: new Date('2024-01-15T09:31:00Z'),
    });
    const result = await dedup.check(newEvent, new Date('2024-01-15T09:31:00Z'));

    // Old event was cleaned, so no match
    expect(result.isDuplicate).toBe(false);
  });

  it('should let non-duplicate events pass through even with events in window', async () => {
    const e1 = makeEvent({
      source: 'sec-edgar',
      title: 'Apple earnings report',
      body: 'Apple reported strong Q4 earnings.',
      metadata: { filingId: 'AAPL-001', ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      source: 'truth-social',
      type: 'political-post',
      title: 'Tesla announces new factory in Texas',
      body: 'Elon Musk reveals plans for a new Gigafactory.',
      metadata: { postId: 'TSLA-001', ticker: 'TSLA' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    const now = new Date('2024-01-15T10:01:00Z');
    await dedup.check(e1, now);
    const result = await dedup.check(e2, now);

    expect(result.isDuplicate).toBe(false);
    expect(result.matchType).toBe('none');
    expect(dedup.windowSize).toBe(2);
  });

  it('should return active story count', async () => {
    const e1 = makeEvent({
      metadata: { filingId: 'A-001' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      metadata: { filingId: 'A-001' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    const now = new Date('2024-01-15T10:01:00Z');
    await dedup.check(e1, now);
    expect(dedup.activeStoryCount).toBe(0);

    await dedup.check(e2, now);
    expect(dedup.activeStoryCount).toBe(1);
  });

  it('should prefer exact ID match over other strategies', async () => {
    // Create two events that match on both exact ID and ticker+window
    const e1 = makeEvent({
      metadata: { filingId: 'SEC-001', ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const e2 = makeEvent({
      metadata: { filingId: 'SEC-001', ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    const now = new Date('2024-01-15T10:01:00Z');
    await dedup.check(e1, now);
    const result = await dedup.check(e2, now);

    // Exact ID has confidence 1.0 which should beat ticker-window
    expect(result.isDuplicate).toBe(true);
    expect(result.matchType).toBe('exact-id');
    expect(result.matchConfidence).toBe(1.0);
  });
});

/* ── 3. findBestMatch integration ────────────────────────────────── */

describe('findBestMatch', () => {
  it('should return null for empty window', () => {
    const event = makeEvent();
    const result = findBestMatch(event, []);
    expect(result).toBeNull();
  });

  it('should not match event against itself', () => {
    const event = makeEvent();
    const result = findBestMatch(event, [event]);
    expect(result).toBeNull();
  });

  it('should pick highest confidence match from multiple candidates', () => {
    const incoming = makeEvent({
      title: 'SEC filing for ACME Corp merger',
      body: 'ACME Corp has filed 8-K regarding the merger.',
      metadata: { filingId: 'SEC-001', ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:02:00Z'),
    });

    const exactMatch = makeEvent({
      title: 'Completely different article about technology',
      body: 'This article discusses emerging trends in AI.',
      metadata: { filingId: 'SEC-001', ticker: 'GOOG' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const tickerMatch = makeEvent({
      title: 'AAPL files quarterly earnings report today',
      body: 'Apple reported earnings for Q4.',
      metadata: { ticker: 'AAPL' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    const result = findBestMatch(incoming, [tickerMatch, exactMatch]);

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('exact-id');
    expect(result!.confidence).toBe(1.0);
  });
});
