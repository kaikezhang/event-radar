import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawEvent } from '@event-radar/shared';

interface StoredEntry {
  score: number;
  member: string;
}

interface RedisState {
  entries: StoredEntry[];
}

interface MockRedisInstance {
  url: string;
  zaddCalls: unknown[][];
  zrangebyscoreCalls: unknown[][];
  zremrangebyscoreCalls: unknown[][];
  disconnected: boolean;
}

const { mockInstances, redisStateByUrl } = vi.hoisted(() => ({
  mockInstances: [] as MockRedisInstance[],
  redisStateByUrl: new Map<string, RedisState>(),
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    url: string;
    zaddCalls: unknown[][] = [];
    zrangebyscoreCalls: unknown[][] = [];
    zremrangebyscoreCalls: unknown[][] = [];
    disconnected = false;

    constructor(url = 'redis://localhost:6379') {
      this.url = url;
      if (!redisStateByUrl.has(url)) {
        redisStateByUrl.set(url, { entries: [] });
      }
      mockInstances.push(this);
    }

    async zadd(...args: unknown[]) {
      this.zaddCalls.push(args);
      const [, score, member] = args;
      const state = redisStateByUrl.get(this.url)!;
      state.entries = state.entries.filter((entry) => entry.member !== String(member));
      state.entries.push({
        score: Number(score),
        member: String(member),
      });
      state.entries.sort((a, b) => a.score - b.score);
      return 1;
    }

    async zrangebyscore(...args: unknown[]) {
      this.zrangebyscoreCalls.push(args);
      const [, min, max] = args;
      const state = redisStateByUrl.get(this.url)!;
      const minScore = parseBoundary(min);
      const maxScore = parseBoundary(max);
      return state.entries
        .filter((entry) => entry.score >= minScore && entry.score <= maxScore)
        .map((entry) => entry.member);
    }

    async zremrangebyscore(...args: unknown[]) {
      this.zremrangebyscoreCalls.push(args);
      const [, min, max] = args;
      const state = redisStateByUrl.get(this.url)!;
      const minScore = parseBoundary(min);
      const maxScore = parseBoundary(max);
      const before = state.entries.length;
      state.entries = state.entries.filter(
        (entry) => entry.score < minScore || entry.score > maxScore,
      );
      return before - state.entries.length;
    }

    disconnect() {
      this.disconnected = true;
    }
  },
}));

const { EventDeduplicator } = await import('../pipeline/deduplicator.js');

function parseBoundary(value: unknown): number {
  if (value === '-inf') return Number.NEGATIVE_INFINITY;
  if (value === '+inf') return Number.POSITIVE_INFINITY;
  return Number(value);
}

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
    metadata: { filingId: `SEC-${eventCounter}`, ticker: 'TEST' },
    ...overrides,
  };
}

function getStoredMembers(url: string): RawEvent[] {
  const state = redisStateByUrl.get(url);
  return (state?.entries ?? []).map((entry) => {
    const parsed = JSON.parse(entry.member) as RawEvent & { timestamp: string };
    return {
      ...parsed,
      timestamp: new Date(parsed.timestamp),
    };
  });
}

describe('EventDeduplicator Redis window', () => {
  beforeEach(() => {
    eventCounter = 0;
    mockInstances.length = 0;
    redisStateByUrl.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('keeps disabled mode purely in-memory', async () => {
    const dedup = new EventDeduplicator({ windowMs: 30 * 60 * 1000 });

    await dedup.check(makeEvent(), new Date('2024-01-15T10:00:00Z'));

    expect(mockInstances).toHaveLength(0);
    expect(dedup.windowSize).toBe(1);
  });

  it('connects to Redis lazily on the first check', async () => {
    const dedup = new EventDeduplicator({
      windowMs: 30 * 60 * 1000,
      redisUrl: 'redis://lazy-connect',
    });

    expect(mockInstances).toHaveLength(0);

    await dedup.check(makeEvent(), new Date('2024-01-15T10:00:00Z'));

    expect(mockInstances).toHaveLength(1);
    expect(mockInstances[0].zrangebyscoreCalls).toHaveLength(1);
    await dedup.shutdown();
  });

  it('persists unique events to the Redis sorted set', async () => {
    const redisUrl = 'redis://persist-unique';
    const dedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });
    const event = makeEvent({
      timestamp: new Date('2024-01-15T10:02:00Z'),
    });

    await dedup.check(event, new Date('2024-01-15T10:02:00Z'));

    const client = mockInstances[0];
    expect(client.zaddCalls).toHaveLength(1);
    expect(client.zaddCalls[0][0]).toBe('event-radar:dedup-window');
    expect(client.zaddCalls[0][1]).toBe(event.timestamp.getTime());
    expect(getStoredMembers(redisUrl)).toEqual([
      expect.objectContaining({ id: event.id }),
    ]);
    await dedup.shutdown();
  });

  it('persists duplicate events to Redis after matching', async () => {
    const redisUrl = 'redis://persist-duplicate';
    const dedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });
    const first = makeEvent({
      metadata: { filingId: 'SEC-42', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });
    const duplicate = makeEvent({
      metadata: { filingId: 'SEC-42', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:01:00Z'),
    });

    await dedup.check(first, new Date('2024-01-15T10:00:00Z'));
    const result = await dedup.check(duplicate, new Date('2024-01-15T10:01:00Z'));

    expect(result.isDuplicate).toBe(true);
    expect(getStoredMembers(redisUrl).map((event) => event.id)).toEqual([
      first.id,
      duplicate.id,
    ]);
    await dedup.shutdown();
  });

  it('hydrates recent Redis events after a simulated restart', async () => {
    const redisUrl = 'redis://restart';
    const firstDedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });
    const existing = makeEvent({
      metadata: { filingId: 'SEC-77', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });

    await firstDedup.check(existing, new Date('2024-01-15T10:00:00Z'));
    await firstDedup.shutdown();

    const secondDedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });
    const incoming = makeEvent({
      metadata: { filingId: 'SEC-77', ticker: 'ACME' },
      timestamp: new Date('2024-01-15T10:02:00Z'),
    });

    const result = await secondDedup.check(incoming, new Date('2024-01-15T10:02:00Z'));

    expect(result.isDuplicate).toBe(true);
    expect(result.originalEventId).toBe(existing.id);
    await secondDedup.shutdown();
  });

  it('does not hydrate events older than the configured window', async () => {
    const redisUrl = 'redis://stale-hydration';
    const staleEvent = makeEvent({
      metadata: { filingId: 'STALE-1', ticker: 'OLD' },
      timestamp: new Date('2024-01-15T09:00:00Z'),
    });

    redisStateByUrl.set(redisUrl, {
      entries: [{
        score: staleEvent.timestamp.getTime(),
        member: JSON.stringify(staleEvent),
      }],
    });

    const dedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });
    const incoming = makeEvent({
      metadata: { filingId: 'STALE-1', ticker: 'OLD' },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    });

    const result = await dedup.check(incoming, new Date('2024-01-15T10:00:00Z'));

    expect(result.isDuplicate).toBe(false);
    expect(dedup.windowSize).toBe(1);
    await dedup.shutdown();
  });

  it('removes expired Redis entries when the window advances', async () => {
    const redisUrl = 'redis://cleanup';
    const dedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });
    const oldEvent = makeEvent({
      metadata: { filingId: 'OLD-1', ticker: 'OLD' },
      timestamp: new Date('2024-01-15T09:00:00Z'),
    });
    const freshEvent = makeEvent({
      metadata: { filingId: 'NEW-1', ticker: 'NEW' },
      timestamp: new Date('2024-01-15T09:31:00Z'),
    });

    await dedup.check(oldEvent, new Date('2024-01-15T09:00:00Z'));
    await dedup.check(freshEvent, new Date('2024-01-15T09:31:00Z'));

    expect(getStoredMembers(redisUrl).map((event) => event.id)).toEqual([freshEvent.id]);
    expect(mockInstances[0].zremrangebyscoreCalls.at(-1)).toEqual([
      'event-radar:dedup-window',
      '-inf',
      freshEvent.timestamp.getTime() - 30 * 60 * 1000,
    ]);
    await dedup.shutdown();
  });

  it('skips malformed Redis payloads during hydration', async () => {
    const redisUrl = 'redis://malformed';
    const validEvent = makeEvent({
      metadata: { filingId: 'VALID-1', ticker: 'GOOD' },
      timestamp: new Date('2024-01-15T09:45:00Z'),
    });
    redisStateByUrl.set(redisUrl, {
      entries: [
        { score: validEvent.timestamp.getTime(), member: JSON.stringify(validEvent) },
        { score: validEvent.timestamp.getTime(), member: '{broken-json' },
      ],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dedup = new EventDeduplicator({ redisUrl, windowMs: 30 * 60 * 1000 });

    await dedup.check(
      makeEvent({
        metadata: { filingId: 'NEXT-1', ticker: 'NEXT' },
        timestamp: new Date('2024-01-15T10:00:00Z'),
      }),
      new Date('2024-01-15T10:00:00Z'),
    );

    expect(dedup.windowSize).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
    await dedup.shutdown();
  });

  it('disconnects the Redis client on shutdown', async () => {
    const dedup = new EventDeduplicator({
      redisUrl: 'redis://shutdown',
      windowMs: 30 * 60 * 1000,
    });

    await dedup.check(makeEvent(), new Date('2024-01-15T10:00:00Z'));
    await dedup.shutdown();

    expect(mockInstances[0].disconnected).toBe(true);
  });
});
