import { describe, it, expect, vi } from 'vitest';
import { InMemoryEventBus } from '../in-memory-event-bus.js';
import type { RawEvent } from '../schemas/raw-event.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'test',
    type: 'test-event',
    title: 'Test Event',
    body: 'body',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('InMemoryEventBus', () => {
  describe('publish', () => {
    it('should emit event to subscriber', async () => {
      const bus = new InMemoryEventBus();
      const received: RawEvent[] = [];
      bus.subscribe((e) => { received.push(e); });

      const event = makeEvent();
      await bus.publish(event);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(event);
    });

    it('should increment publishedCount', async () => {
      const bus = new InMemoryEventBus();
      expect(bus.publishedCount).toBe(0);

      await bus.publish(makeEvent());
      expect(bus.publishedCount).toBe(1);

      await bus.publish(makeEvent());
      expect(bus.publishedCount).toBe(2);
    });

    it('should emit to multiple subscribers', async () => {
      const bus = new InMemoryEventBus();
      const received1: RawEvent[] = [];
      const received2: RawEvent[] = [];

      bus.subscribe((e) => { received1.push(e); });
      bus.subscribe((e) => { received2.push(e); });

      await bus.publish(makeEvent());

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should work with no subscribers', async () => {
      const bus = new InMemoryEventBus();
      await expect(bus.publish(makeEvent())).resolves.toBeUndefined();
      expect(bus.publishedCount).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', async () => {
      const bus = new InMemoryEventBus();
      const handler = vi.fn();
      const unsub = bus.subscribe(handler);

      await bus.publish(makeEvent());
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();

      await bus.publish(makeEvent());
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should track handler count', () => {
      const bus = new InMemoryEventBus();
      expect(bus.handlerCount).toBe(0);

      const unsub1 = bus.subscribe(() => {});
      expect(bus.handlerCount).toBe(1);

      const unsub2 = bus.subscribe(() => {});
      expect(bus.handlerCount).toBe(2);

      unsub1();
      expect(bus.handlerCount).toBe(1);

      unsub2();
      expect(bus.handlerCount).toBe(0);
    });

    it('should catch async subscriber errors instead of creating unhandled rejections', async () => {
      const bus = new InMemoryEventBus();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bus.subscribe(async () => {
        throw new Error('subscriber exploded');
      });

      await expect(bus.publish(makeEvent())).resolves.toBeUndefined();
      await Promise.resolve();

      expect(errorSpy).toHaveBeenCalledWith(
        '[EventBus] Unhandled error in subscriber:',
        expect.objectContaining({ message: 'subscriber exploded' }),
      );

      errorSpy.mockRestore();
    });
  });

  describe('topics', () => {
    it('should catch async topic subscriber errors instead of creating unhandled rejections', async () => {
      const bus = new InMemoryEventBus();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bus.subscribeTopic('alerts', async () => {
        throw new Error('topic exploded');
      });

      await expect(bus.publishTopic('alerts', { ok: true })).resolves.toBeUndefined();
      await Promise.resolve();

      expect(errorSpy).toHaveBeenCalledWith(
        '[EventBus] Unhandled error in topic subscriber:',
        expect.objectContaining({ message: 'topic exploded' }),
      );

      errorSpy.mockRestore();
    });
  });

  describe('unsubscribe', () => {
    it('should remove the specific handler', async () => {
      const bus = new InMemoryEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe(handler1);
      bus.subscribe(handler2);

      bus.unsubscribe(handler1);

      await bus.publish(makeEvent());

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should be safe to call with unregistered handler', () => {
      const bus = new InMemoryEventBus();
      expect(() => bus.unsubscribe(() => {})).not.toThrow();
    });
  });

  describe('metrics', () => {
    it('should have zero counts initially', () => {
      const bus = new InMemoryEventBus();
      expect(bus.publishedCount).toBe(0);
      expect(bus.handlerCount).toBe(0);
    });
  });
});
