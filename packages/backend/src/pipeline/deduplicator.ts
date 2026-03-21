import type { RawEvent } from '@event-radar/shared';
import type { DedupResult } from '@event-radar/shared';
import type { Redis } from 'ioredis';
import { eq, gt, and } from 'drizzle-orm';
import { findBestMatch } from './dedup-strategies.js';
import { StoryTracker } from './story-tracker.js';
import type { Database } from '../db/connection.js';
import { events } from '../db/schema.js';

export interface DeduplicatorOptions {
  /** Sliding window duration in ms. Default: 30 minutes. */
  windowMs?: number;
  /** Story expiry duration in ms. Default: 30 minutes. */
  storyExpiryMs?: number;
  /** Optional database for cross-window dedup lookups. */
  db?: Database;
  /** Optional Redis URL for persistent sliding-window storage. */
  redisUrl?: string;
}

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;
const DB_LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const REDIS_WINDOW_KEY = 'event-radar:dedup-window';

export class EventDeduplicator {
  private readonly window: RawEvent[] = [];
  private readonly windowMs: number;
  private readonly storyTracker: StoryTracker;
  private readonly db?: Database;
  private readonly redisUrl?: string;
  private redisClientPromise: Promise<Redis> | null = null;
  private hydrationPromise: Promise<void> | null = null;
  private hydrated = false;

  constructor(options?: DeduplicatorOptions) {
    this.windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.db = options?.db;
    this.redisUrl = options?.redisUrl;
    this.storyTracker = new StoryTracker({
      expiryMs: options?.storyExpiryMs ?? DEFAULT_WINDOW_MS,
    });
  }

  /**
   * Check an incoming event for duplicates against the sliding window.
   * If duplicate, returns match info and tracks the story.
   * If new, adds the event to the window.
   */
  async check(event: RawEvent, now: Date = new Date()): Promise<DedupResult> {
    await this.ensureWindowHydrated(now);
    this.cleanup(now);
    await this.cleanupRedis(now);

    // DB-based dedup: check events table for matching sourceEventId in last 24h
    if (this.db && event.id) {
      const cutoff24h = new Date(now.getTime() - DB_LOOKUP_WINDOW_MS);
      const [existing] = await this.db
        .select()
        .from(events)
        .where(
          and(
            eq(events.sourceEventId, event.id),
            gt(events.receivedAt, cutoff24h),
          ),
        )
        .limit(1);

      if (existing) {
        return {
          isDuplicate: true,
          matchType: 'db-lookup',
          matchConfidence: 1.0,
          originalEventId: existing.id,
          storyId: undefined,
        };
      }
    }

    const match = findBestMatch(event, this.window);

    if (match) {
      const storyId = this.storyTracker.track(event, match.matchedEventId, now);
      // Add the duplicate to the window too so future events can match against it
      await this.addToWindow(event);

      return {
        isDuplicate: true,
        matchType: match.matchType,
        matchConfidence: match.confidence,
        originalEventId: match.matchedEventId,
        storyId,
      };
    }

    // Not a duplicate — add to window
    await this.addToWindow(event);

    // Check if this event's original was already part of a story
    const existingStory = this.storyTracker.getStory(event.id);

    return {
      isDuplicate: false,
      matchType: 'none',
      matchConfidence: 0,
      originalEventId: undefined,
      storyId: existingStory?.storyId,
    };
  }

  /** Get story info for an event. */
  getStory(eventId: string): { storyId: string; eventCount: number } | undefined {
    return this.storyTracker.getStory(eventId);
  }

  /** Number of active stories. */
  get activeStoryCount(): number {
    return this.storyTracker.activeCount;
  }

  /** Number of events in the sliding window. */
  get windowSize(): number {
    return this.window.length;
  }

  /** Remove events outside the sliding window. */
  private cleanup(now: Date): void {
    const cutoff = now.getTime() - this.windowMs;
    while (this.window.length > 0 && this.window[0].timestamp.getTime() < cutoff) {
      this.window.shift();
    }
    this.storyTracker.cleanup(now);
  }

  /** Reset all state (useful for tests). */
  reset(): void {
    this.window.length = 0;
    this.storyTracker.reset();
    this.hydrated = this.redisUrl != null;
  }

  async shutdown(): Promise<void> {
    const clientPromise = this.redisClientPromise;
    this.redisClientPromise = null;
    this.hydrationPromise = null;
    this.hydrated = false;

    if (!clientPromise) {
      return;
    }

    const client = await clientPromise;
    client.disconnect();
  }

  private async addToWindow(event: RawEvent): Promise<void> {
    this.window.push(event);

    if (!this.redisUrl) {
      return;
    }

    const client = await this.getRedisClient();
    await client.zadd(
      REDIS_WINDOW_KEY,
      event.timestamp.getTime(),
      JSON.stringify(event),
    );
  }

  private async ensureWindowHydrated(now: Date): Promise<void> {
    if (!this.redisUrl || this.hydrated) {
      return;
    }

    if (!this.hydrationPromise) {
      this.hydrationPromise = (async () => {
        const client = await this.getRedisClient();
        const cutoff = now.getTime() - this.windowMs;

        await client.zremrangebyscore(REDIS_WINDOW_KEY, '-inf', cutoff);

        const serializedEvents = await client.zrangebyscore(
          REDIS_WINDOW_KEY,
          cutoff,
          '+inf',
        );

        this.window.length = 0;

        for (const serializedEvent of serializedEvents) {
          const parsed = this.parseRedisEvent(serializedEvent);
          if (parsed) {
            this.window.push(parsed);
          }
        }

        this.hydrated = true;
      })().finally(() => {
        this.hydrationPromise = null;
      });
    }

    await this.hydrationPromise;
  }

  private async cleanupRedis(now: Date): Promise<void> {
    if (!this.redisUrl) {
      return;
    }

    const client = await this.getRedisClient();
    const cutoff = now.getTime() - this.windowMs;
    await client.zremrangebyscore(REDIS_WINDOW_KEY, '-inf', cutoff);
  }

  private async getRedisClient(): Promise<Redis> {
    const redisUrl = this.redisUrl;

    if (!redisUrl) {
      throw new Error('Redis is not configured for EventDeduplicator');
    }

    if (!this.redisClientPromise) {
      this.redisClientPromise = import('ioredis')
        .then(({ default: IORedis }) => new IORedis(redisUrl, { maxRetriesPerRequest: null }));
    }

    return this.redisClientPromise;
  }

  private parseRedisEvent(serializedEvent: string): RawEvent | null {
    try {
      const parsed = JSON.parse(serializedEvent) as RawEvent & { timestamp: string };
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    } catch (error) {
      console.error(
        '[EventDeduplicator] Failed to parse dedup window entry from Redis:',
        error,
      );
      return null;
    }
  }
}
