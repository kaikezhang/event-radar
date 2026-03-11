import { EventEmitter } from 'node:events';
import type { EventBus } from './schemas/event-bus.js';
import type { RawEvent } from './schemas/raw-event.js';

type Handler = (event: RawEvent) => void | Promise<void>;
type TopicHandler = (payload: unknown) => void | Promise<void>;

const EVENT_KEY = 'raw-event';
const topicKey = (topic: string) => `topic:${topic}`;

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

  async publishTopic(topic: string, payload: unknown): Promise<void> {
    this.emitter.emit(topicKey(topic), payload);
  }

  subscribeTopic(topic: string, handler: TopicHandler): () => void {
    this.emitter.on(topicKey(topic), handler);
    return () => this.unsubscribeTopic(topic, handler);
  }

  unsubscribe(handler: Handler): void {
    this.emitter.off(EVENT_KEY, handler);
  }

  unsubscribeTopic(topic: string, handler: TopicHandler): void {
    this.emitter.off(topicKey(topic), handler);
  }

  get publishedCount(): number {
    return this._publishedCount;
  }

  get handlerCount(): number {
    return this.emitter.listenerCount(EVENT_KEY);
  }
}
