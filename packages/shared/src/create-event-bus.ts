import type { EventBus } from './schemas/event-bus.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';
import { RedisEventBus } from './redis-event-bus.js';

export function createEventBus(): EventBus {
  if (process.env.EVENT_BUS_TYPE === 'redis') {
    return new RedisEventBus(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return new InMemoryEventBus();
}
