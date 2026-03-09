import type { RawEvent } from '@event-radar/shared';
import type { DedupResult } from '@event-radar/shared';
import { findBestMatch } from './dedup-strategies.js';
import { StoryTracker } from './story-tracker.js';

export interface DeduplicatorOptions {
  /** Sliding window duration in ms. Default: 30 minutes. */
  windowMs?: number;
  /** Story expiry duration in ms. Default: 30 minutes. */
  storyExpiryMs?: number;
}

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;

export class EventDeduplicator {
  private readonly window: RawEvent[] = [];
  private readonly windowMs: number;
  private readonly storyTracker: StoryTracker;

  constructor(options?: DeduplicatorOptions) {
    this.windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.storyTracker = new StoryTracker({
      expiryMs: options?.storyExpiryMs ?? DEFAULT_WINDOW_MS,
    });
  }

  /**
   * Check an incoming event for duplicates against the sliding window.
   * If duplicate, returns match info and tracks the story.
   * If new, adds the event to the window.
   */
  check(event: RawEvent, now: Date = new Date()): DedupResult {
    this.cleanup(now);

    const match = findBestMatch(event, this.window);

    if (match) {
      const storyId = this.storyTracker.track(event, match.matchedEventId, now);
      // Add the duplicate to the window too so future events can match against it
      this.window.push(event);

      return {
        isDuplicate: true,
        matchType: match.matchType,
        matchConfidence: match.confidence,
        originalEventId: match.matchedEventId,
        storyId,
      };
    }

    // Not a duplicate — add to window
    this.window.push(event);

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
  }
}
