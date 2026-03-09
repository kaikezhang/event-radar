import type { RawEvent } from '@event-radar/shared';

export interface Story {
  storyId: string;
  eventIds: string[];
  lastUpdated: Date;
}

export interface StoryTrackerOptions {
  /** How long a story remains active after its last event, in ms. Default: 30 minutes. */
  expiryMs?: number;
}

const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;

export class StoryTracker {
  private readonly stories = new Map<string, Story>();
  private readonly eventToStory = new Map<string, string>();
  private readonly expiryMs: number;

  constructor(options?: StoryTrackerOptions) {
    this.expiryMs = options?.expiryMs ?? DEFAULT_EXPIRY_MS;
  }

  /**
   * Try to assign an event to an existing story based on its matched original event.
   * If the original event belongs to a story, add this event to the same story.
   * If the original event has no story yet, create a new story with both events.
   * Returns the storyId if the event was assigned to a story.
   */
  track(event: RawEvent, originalEventId: string, now: Date = new Date()): string {
    this.cleanup(now);

    const existingStoryId = this.eventToStory.get(originalEventId);

    if (existingStoryId) {
      const story = this.stories.get(existingStoryId)!;
      story.eventIds.push(event.id);
      story.lastUpdated = now;
      this.eventToStory.set(event.id, existingStoryId);
      return existingStoryId;
    }

    // Create new story with the original event as the anchor
    const storyId = originalEventId;
    const story: Story = {
      storyId,
      eventIds: [originalEventId, event.id],
      lastUpdated: now,
    };
    this.stories.set(storyId, story);
    this.eventToStory.set(originalEventId, storyId);
    this.eventToStory.set(event.id, storyId);
    return storyId;
  }

  /**
   * Check if an event is part of a developing story.
   * Returns storyId and event count, or undefined.
   */
  getStory(eventId: string): { storyId: string; eventCount: number } | undefined {
    const storyId = this.eventToStory.get(eventId);
    if (!storyId) return undefined;
    const story = this.stories.get(storyId);
    if (!story) return undefined;
    return { storyId: story.storyId, eventCount: story.eventIds.length };
  }

  /** Number of active (non-expired) stories. */
  get activeCount(): number {
    return this.stories.size;
  }

  /** Remove expired stories. */
  cleanup(now: Date = new Date()): void {
    for (const [storyId, story] of this.stories) {
      if (now.getTime() - story.lastUpdated.getTime() > this.expiryMs) {
        for (const eventId of story.eventIds) {
          this.eventToStory.delete(eventId);
        }
        this.stories.delete(storyId);
      }
    }
  }

  /** Reset all state (useful for tests). */
  reset(): void {
    this.stories.clear();
    this.eventToStory.clear();
  }
}
