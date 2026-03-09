import { EventEmitter } from 'node:events';
import type { EventBus } from './schemas/event-bus.js';
import type { RawEvent } from './schemas/raw-event.js';

type Handler = (event: RawEvent) => void | Promise<void>;

const EVENT_KEY = 'raw-event';

export class InMemoryEventBus implements EventBus {
  private readonly emitter = new EventEmitter();
  private _publishedCount = 0;

  async publish(event: RawEvent): Promise<void> {
    this._publishedCount++;
    this.emitter.emit(EVENT_KEY, event);
  }

  subscribe(handler: Handler): () => void {
    this.emitter.on(EVENT_KEY, handler);
    return () => this.unsubscribe(handler);
  }

  unsubscribe(handler: Handler): void {
    this.emitter.off(EVENT_KEY, handler);
  }

  get publishedCount(): number {
    return this._publishedCount;
  }

  get handlerCount(): number {
    return this.emitter.listenerCount(EVENT_KEY);
  }
}
