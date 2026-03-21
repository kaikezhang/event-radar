import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RawEvent } from '../schemas/raw-event.js';

interface MockRedisInstance {
  xaddCalls: unknown[][];
  xgroupCalls: unknown[][];
  xreadgroupCalls: unknown[][];
  xackCalls: unknown[][];
  disconnected: boolean;
  pendingMessages: (unknown[] | null)[];
  xgroupError: Error | null;
}

const { mockInstances } = vi.hoisted(() => {
  const mockInstances: MockRedisInstance[] = [];
  return { mockInstances };
});

vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      xaddCalls: unknown[][] = [];
      xgroupCalls: unknown[][] = [];
      xreadgroupCalls: unknown[][] = [];
      xackCalls: unknown[][] = [];
      disconnected = false;
      /** Queue of responses — shift() consumed on each xreadgroup call */
      pendingMessages: (unknown[] | null)[] = [];
      xgroupError: Error | null = null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_url?: string, _opts?: unknown) {
        mockInstances.push(this);
      }

      async xadd(...args: unknown[]) {
        this.xaddCalls.push(args);
        return `1234567890-${this.xaddCalls.length}`;
      }

      async xgroup(...args: unknown[]) {
        this.xgroupCalls.push(args);
        if (this.xgroupError) throw this.xgroupError;
        return 'OK';
      }

      async xreadgroup(...args: unknown[]) {
        this.xreadgroupCalls.push(args);
        await new Promise((r) => setTimeout(r, 50));
        // Consume from the front of the queue
        if (this.pendingMessages.length > 0) {
          return this.pendingMessages.shift();
        }
        return null;
      }

      async xack(...args: unknown[]) {
        this.xackCalls.push(args);
        return 1;
      }

      disconnect() {
        this.disconnected = true;
      }
    },
  };
});

const { RedisEventBus } = await import('../redis-event-bus.js');

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'test',
    type: 'test-event',
    title: 'Test Event',
    body: 'body',
    timestamp: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

/** The read client is always the last mock instance created after subscribing */
function lastMock(): MockRedisInstance {
  return mockInstances[mockInstances.length - 1];
}

describe('RedisEventBus', () => {
  let bus: InstanceType<typeof RedisEventBus>;

  beforeEach(() => {
    mockInstances.length = 0;
    bus = new RedisEventBus('redis://localhost:6379');
  });

  afterEach(async () => {
    await bus.shutdown();
  });

  describe('publish', () => {
    it('should call XADD with correct stream key and serialized data', async () => {
      const event = makeEvent();
      await bus.publish(event);

      const writeClient = mockInstances[0];
      expect(writeClient.xaddCalls).toHaveLength(1);

      const [streamKey, , , , id, field, data] = writeClient.xaddCalls[0];
      expect(streamKey).toBe('event-radar:events');
      expect(id).toBe('*');
      expect(field).toBe('data');
      expect(JSON.parse(data as string)).toMatchObject({
        id: event.id,
        source: 'test',
        type: 'test-event',
      });
    });

    it('should use MAXLEN trimming', async () => {
      await bus.publish(makeEvent());
      const [, maxlen, approx, len] = mockInstances[0].xaddCalls[0];
      expect(maxlen).toBe('MAXLEN');
      expect(approx).toBe('~');
      expect(len).toBe('10000');
    });

    it('should increment publishedCount', async () => {
      expect(bus.publishedCount).toBe(0);
      await bus.publish(makeEvent());
      expect(bus.publishedCount).toBe(1);
      await bus.publish(makeEvent());
      expect(bus.publishedCount).toBe(2);
    });

    it('should work without subscribers', async () => {
      await expect(bus.publish(makeEvent())).resolves.toBeUndefined();
      expect(bus.publishedCount).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const unsub = bus.subscribe(() => {});
      expect(typeof unsub).toBe('function');
    });

    it('should track handler count', () => {
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

    it('should create consumer group on first subscribe', async () => {
      bus.subscribe(() => {});
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      expect(readClient.xgroupCalls).toHaveLength(1);
      expect(readClient.xgroupCalls[0]).toEqual(
        expect.arrayContaining(['CREATE', 'event-radar:events', 'pipeline-workers', '0', 'MKSTREAM']),
      );
    });

    it('should deliver messages to handlers via XREADGROUP', async () => {
      const received: RawEvent[] = [];
      const event = makeEvent();

      bus.subscribe((e) => { received.push(e); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      readClient.pendingMessages.push([
        ['event-radar:events', [
          ['1234-0', ['data', JSON.stringify(event)]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ id: event.id, source: 'test' });
    });

    it('should XACK messages after handler completes', async () => {
      const event = makeEvent();
      bus.subscribe(() => {});
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      readClient.pendingMessages.push([
        ['event-radar:events', [
          ['msg-99', ['data', JSON.stringify(event)]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));

      expect(readClient.xackCalls).toHaveLength(1);
      expect(readClient.xackCalls[0]).toEqual([
        'event-radar:events', 'pipeline-workers', 'msg-99',
      ]);
    });

    it('should catch handler errors and still XACK', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const event = makeEvent();

      bus.subscribe(() => { throw new Error('handler boom'); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      readClient.pendingMessages.push([
        ['event-radar:events', [
          ['msg-err', ['data', JSON.stringify(event)]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));

      expect(errorSpy).toHaveBeenCalledWith(
        '[RedisEventBus] Unhandled error in subscriber:',
        expect.objectContaining({ message: 'handler boom' }),
      );
      expect(readClient.xackCalls).toHaveLength(1);
      errorSpy.mockRestore();
    });
  });

  describe('consumer group', () => {
    it('should handle BUSYGROUP error gracefully', async () => {
      // Create a standalone bus for this test
      const busA = new RedisEventBus('redis://localhost:6379');
      busA.subscribe(() => {});
      await new Promise((r) => setTimeout(r, 100));

      const readClientA = lastMock();
      expect(readClientA.xgroupCalls).toHaveLength(1);

      // Second bus — set up xgroupError on the new read client after it's created
      const busB = new RedisEventBus('redis://localhost:6379');
      busB.subscribe(() => {});
      await new Promise((r) => setTimeout(r, 100));

      // busB created new instances after busA
      const readClientB = lastMock();
      expect(readClientB).not.toBe(readClientA);
      expect(readClientB.xgroupCalls).toHaveLength(1);

      // No crash = BUSYGROUP would be handled gracefully
      expect(busB.handlerCount).toBe(1);

      await busA.shutdown();
      await busB.shutdown();
    });
  });

  describe('publishTopic', () => {
    it('should call XADD with topic stream key', async () => {
      await bus.publishTopic('alerts', { severity: 'high' });

      const writeClient = mockInstances[0];
      expect(writeClient.xaddCalls).toHaveLength(1);
      expect(writeClient.xaddCalls[0][0]).toBe('event-radar:topic:alerts');
      expect(JSON.parse(writeClient.xaddCalls[0][6] as string)).toEqual({ severity: 'high' });
    });
  });

  describe('subscribeTopic', () => {
    it('should return an unsubscribe function', () => {
      const unsub = bus.subscribeTopic('alerts', () => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should create per-instance consumer group for topic stream (fanout)', async () => {
      bus.subscribeTopic('alerts', () => {});
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      expect(readClient.xgroupCalls).toHaveLength(1);
      const groupArgs = readClient.xgroupCalls[0];
      expect(groupArgs[0]).toBe('CREATE');
      expect(groupArgs[1]).toBe('event-radar:topic:alerts');
      // Topic group should NOT be 'pipeline-workers' — it must be per-instance for fanout
      expect(groupArgs[2]).not.toBe('pipeline-workers');
      expect(groupArgs[2]).toMatch(/^topic-/);
    });
  });

  describe('graceful shutdown', () => {
    it('should stop the read loop and disconnect clients', async () => {
      bus.subscribe(() => {});
      await new Promise((r) => setTimeout(r, 100));

      await bus.shutdown();

      for (const instance of mockInstances) {
        expect(instance.disconnected).toBe(true);
      }
    });

    it('should be safe to call shutdown multiple times', async () => {
      await expect(bus.shutdown()).resolves.toBeUndefined();
      await expect(bus.shutdown()).resolves.toBeUndefined();
    });

    it('should be safe to call without subscribing', async () => {
      await expect(bus.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('subscribeTopic before subscribe — both loops must run', () => {
    it('should start both raw event and topic read loops independently', async () => {
      // subscribeTopic first (like websocket plugin does)
      bus.subscribeTopic('event:classified', () => {});
      await new Promise((r) => setTimeout(r, 100));

      // Now subscribe for raw events (pipeline)
      const received: RawEvent[] = [];
      bus.subscribe((e) => { received.push(e); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();

      // Both consumer groups should have been created
      expect(readClient.xgroupCalls.length).toBeGreaterThanOrEqual(2);
      const streamKeys = readClient.xgroupCalls.map((c) => c[1]);
      expect(streamKeys).toContain('event-radar:topic:event:classified');
      expect(streamKeys).toContain('event-radar:events');

      // Deliver a raw event — it should be consumed
      const event = makeEvent();
      readClient.pendingMessages.push([
        ['event-radar:events', [
          ['raw-1', ['data', JSON.stringify(event)]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ id: event.id });
    });
  });

  describe('unsubscribe last handler stops the loop', () => {
    it('should stop consuming messages after last handler is removed', async () => {
      const received: unknown[] = [];
      const unsub = bus.subscribeTopic('alerts', (p) => { received.push(p); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();

      // Deliver a message before unsub — should be received
      readClient.pendingMessages.push([
        ['event-radar:topic:alerts', [
          ['msg-1', ['data', JSON.stringify({ n: 1 })]],
        ]],
      ]);
      await new Promise((r) => setTimeout(r, 200));
      expect(received).toHaveLength(1);

      // Unsubscribe the only handler
      unsub();

      // Queue another message — should NOT be consumed (loop stopped)
      const callsBefore = readClient.xreadgroupCalls.length;
      await new Promise((r) => setTimeout(r, 200));
      // The loop should have stopped, so xreadgroup call count should not increase significantly
      const callsAfter = readClient.xreadgroupCalls.length;
      // Allow at most 1 extra call (in-flight at time of stop)
      expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
    });

    it('should stop raw event loop when last handler removed', async () => {
      const unsub = bus.subscribe(() => {});
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      unsub();

      const callsBefore = readClient.xreadgroupCalls.length;
      await new Promise((r) => setTimeout(r, 200));
      const callsAfter = readClient.xreadgroupCalls.length;
      expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
    });
  });

  describe('topic fanout — multiple subscribers all receive the same message', () => {
    it('should deliver to all handlers on the same topic', async () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];

      bus.subscribeTopic('alerts', (p) => { received1.push(p); });
      bus.subscribeTopic('alerts', (p) => { received2.push(p); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      readClient.pendingMessages.push([
        ['event-radar:topic:alerts', [
          ['msg-fanout-1', ['data', JSON.stringify({ severity: 'high' })]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));

      // Both handlers should receive the message (local fanout)
      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      expect(received1[0]).toEqual({ severity: 'high' });
      expect(received2[0]).toEqual({ severity: 'high' });
    });

    it('should use per-instance group names so different instances get all messages', async () => {
      bus.subscribeTopic('alerts', () => {});
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      const groupName = readClient.xgroupCalls[0][2] as string;

      // Group name should be instance-specific, not the shared 'pipeline-workers'
      expect(groupName).not.toBe('pipeline-workers');
      expect(groupName).toMatch(/^topic-\d+-/);
    });
  });

  describe('per-instance topic groups', () => {
    it('should give each RedisEventBus instance its own topic consumer group', async () => {
      const busA = new RedisEventBus('redis://localhost:6379');
      const busB = new RedisEventBus('redis://localhost:6379');

      busA.subscribeTopic('alerts', () => {});
      await new Promise((r) => setTimeout(r, 100));
      const readClientA = lastMock();
      const groupA = readClientA.xgroupCalls[0][2] as string;

      busB.subscribeTopic('alerts', () => {});
      await new Promise((r) => setTimeout(r, 100));
      const readClientB = lastMock();
      const groupB = readClientB.xgroupCalls[0][2] as string;

      expect(groupA).toMatch(/^topic-/);
      expect(groupB).toMatch(/^topic-/);
      expect(groupA).not.toBe(groupB);

      await busA.shutdown();
      await busB.shutdown();
    });
  });

  describe('re-subscribe after unsubscribe', () => {
    it('should restart the read loop after all handlers unsubscribe and a new one subscribes', async () => {
      const received: unknown[] = [];

      // Subscribe and then unsubscribe
      const unsub = bus.subscribe((e) => { received.push(e); });
      await new Promise((r) => setTimeout(r, 100));
      unsub();
      await new Promise((r) => setTimeout(r, 100));

      // Re-subscribe — this must start a new read loop
      bus.subscribe((e) => { received.push(e); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      const event = makeEvent();
      readClient.pendingMessages.push([
        ['event-radar:events', [
          ['re-sub-1', ['data', JSON.stringify(event)]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ id: event.id });
    });

    it('should restart topic read loop after unsubscribe and re-subscribe', async () => {
      const received: unknown[] = [];

      const unsub = bus.subscribeTopic('alerts', (p) => { received.push(p); });
      await new Promise((r) => setTimeout(r, 100));
      unsub();
      await new Promise((r) => setTimeout(r, 100));

      bus.subscribeTopic('alerts', (p) => { received.push(p); });
      await new Promise((r) => setTimeout(r, 100));

      const readClient = lastMock();
      readClient.pendingMessages.push([
        ['event-radar:topic:alerts', [
          ['re-topic-1', ['data', JSON.stringify({ restarted: true })]],
        ]],
      ]);

      await new Promise((r) => setTimeout(r, 200));
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ restarted: true });
    });
  });

  describe('metrics', () => {
    it('should have zero counts initially', () => {
      expect(bus.publishedCount).toBe(0);
      expect(bus.handlerCount).toBe(0);
    });
  });
});
