import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return { default: RedisMock };
});

describe('createEventBus', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('should return InMemoryEventBus by default', async () => {
    delete process.env.EVENT_BUS_TYPE;
    const { createEventBus } = await import('../create-event-bus.js');
    const { InMemoryEventBus } = await import('../in-memory-event-bus.js');
    const bus = createEventBus();
    expect(bus).toBeInstanceOf(InMemoryEventBus);
  });

  it('should return InMemoryEventBus when EVENT_BUS_TYPE=memory', async () => {
    process.env.EVENT_BUS_TYPE = 'memory';
    const { createEventBus } = await import('../create-event-bus.js');
    const { InMemoryEventBus } = await import('../in-memory-event-bus.js');
    const bus = createEventBus();
    expect(bus).toBeInstanceOf(InMemoryEventBus);
  });

  it('should return RedisEventBus when EVENT_BUS_TYPE=redis', async () => {
    process.env.EVENT_BUS_TYPE = 'redis';
    const { createEventBus } = await import('../create-event-bus.js');
    const { RedisEventBus } = await import('../redis-event-bus.js');
    const bus = createEventBus();
    expect(bus).toBeInstanceOf(RedisEventBus);
    // Clean up
    if ('shutdown' in bus && typeof bus.shutdown === 'function') {
      await (bus as { shutdown: () => Promise<void> }).shutdown();
    }
  });
});
