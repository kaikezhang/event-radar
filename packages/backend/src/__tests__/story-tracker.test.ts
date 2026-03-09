import { describe, it, expect, beforeEach } from 'vitest';
import type { RawEvent } from '@event-radar/shared';
import { StoryTracker } from '../pipeline/story-tracker.js';

/* ── helpers ─────────────────────────────────────────────────────── */

let eventCounter = 0;
function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  eventCounter++;
  return {
    id: `550e8400-e29b-41d4-a716-44665544${String(eventCounter).padStart(4, '0')}`,
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test event',
    body: 'Test event body.',
    url: 'https://example.com',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  eventCounter = 0;
});

/* ── Story Tracker ────────────────────────────────────────────────── */

describe('StoryTracker', () => {
  let tracker: StoryTracker;
  const now = new Date('2024-01-15T10:00:00Z');

  beforeEach(() => {
    tracker = new StoryTracker({ expiryMs: 30 * 60 * 1000 });
  });

  it('should create a new story when tracking a duplicate for the first time', () => {
    const original = makeEvent();
    const duplicate = makeEvent();

    const storyId = tracker.track(duplicate, original.id, now);

    expect(storyId).toBe(original.id); // story ID = first event's ID
    expect(tracker.activeCount).toBe(1);
  });

  it('should add subsequent events to existing story', () => {
    const original = makeEvent();
    const dup1 = makeEvent();
    const dup2 = makeEvent();

    tracker.track(dup1, original.id, now);
    tracker.track(dup2, original.id, now);

    const story = tracker.getStory(original.id);
    expect(story).toBeDefined();
    expect(story!.eventCount).toBe(3); // original + 2 duplicates
    expect(tracker.activeCount).toBe(1);
  });

  it('should expire stories after configured timeout', () => {
    const original = makeEvent();
    const duplicate = makeEvent();

    tracker.track(duplicate, original.id, now);
    expect(tracker.activeCount).toBe(1);

    // 31 minutes later
    const later = new Date(now.getTime() + 31 * 60 * 1000);
    tracker.cleanup(later);

    expect(tracker.activeCount).toBe(0);
    expect(tracker.getStory(original.id)).toBeUndefined();
  });

  it('should keep story alive when new events arrive within window', () => {
    const original = makeEvent();
    const dup1 = makeEvent();
    const dup2 = makeEvent();

    // Track first dup at t=0
    tracker.track(dup1, original.id, now);

    // Track second dup at t=25min (refreshes the story)
    const t25 = new Date(now.getTime() + 25 * 60 * 1000);
    tracker.track(dup2, original.id, t25);

    // At t=31min, story should still be alive (last updated at t=25min)
    const t31 = new Date(now.getTime() + 31 * 60 * 1000);
    tracker.cleanup(t31);

    expect(tracker.activeCount).toBe(1);
    expect(tracker.getStory(original.id)!.eventCount).toBe(3);
  });

  it('should track multiple independent stories', () => {
    const orig1 = makeEvent();
    const orig2 = makeEvent();
    const dup1 = makeEvent();
    const dup2 = makeEvent();

    tracker.track(dup1, orig1.id, now);
    tracker.track(dup2, orig2.id, now);

    expect(tracker.activeCount).toBe(2);
    expect(tracker.getStory(orig1.id)!.storyId).not.toBe(
      tracker.getStory(orig2.id)!.storyId,
    );
  });

  it('should return undefined for unknown event ID', () => {
    expect(tracker.getStory('nonexistent')).toBeUndefined();
  });

  it('should reset all state', () => {
    const original = makeEvent();
    const duplicate = makeEvent();

    tracker.track(duplicate, original.id, now);
    expect(tracker.activeCount).toBe(1);

    tracker.reset();
    expect(tracker.activeCount).toBe(0);
    expect(tracker.getStory(original.id)).toBeUndefined();
  });
});
