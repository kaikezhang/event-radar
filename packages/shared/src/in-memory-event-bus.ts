import { EventEmitter } from 'node:events';
import type { EventBus } from './schemas/event-bus.js';
import type { RawEvent } from './schemas/raw-event.js';

type Handler = (event: RawEvent) => void | Promise<void>;
type TopicHandler = (payload: unknown) => void | Promise<void>;

const EVENT_KEY = 'raw-event';
const topicKey = (topic: string) => `topic:${topic}`;

export class InMemoryEventBus implements EventBus {
  private readonly emitter = new EventEmitter();
  private readonly handlerWrappers = new Map<Handler, (event: RawEvent) => void>();
  private readonly topicHandlerWrappers = new Map<string, Map<TopicHandler, (payload: unknown) => void>>();
  private _publishedCount = 0;

  async publish(event: RawEvent): Promise<void> {
    this._publishedCount++;
    this.emitter.emit(EVENT_KEY, event);
  }

  subscribe(handler: Handler): () => void {
    const existing = this.handlerWrappers.get(handler);
    if (existing) this.emitter.off(EVENT_KEY, existing);
    const wrapped = (event: RawEvent) => {
      this.runHandler(handler, event, '[EventBus] Unhandled error in subscriber:');
    };
    this.handlerWrappers.set(handler, wrapped);
    this.emitter.on(EVENT_KEY, wrapped);
    return () => this.unsubscribe(handler);
  }

  async publishTopic(topic: string, payload: unknown): Promise<void> {
    this.emitter.emit(topicKey(topic), payload);
  }

  subscribeTopic(topic: string, handler: TopicHandler): () => void {
    const wrapped = (payload: unknown) => {
      this.runHandler(handler, payload, '[EventBus] Unhandled error in topic subscriber:');
    };
    let topicWrappers = this.topicHandlerWrappers.get(topic);
    if (!topicWrappers) {
      topicWrappers = new Map();
      this.topicHandlerWrappers.set(topic, topicWrappers);
    }
    const existingTopic = topicWrappers.get(handler);
    if (existingTopic) this.emitter.off(topicKey(topic), existingTopic);
    topicWrappers.set(handler, wrapped);
    this.emitter.on(topicKey(topic), wrapped);
    return () => this.unsubscribeTopic(topic, handler);
  }

  unsubscribe(handler: Handler): void {
    const wrapped = this.handlerWrappers.get(handler);
    if (wrapped) {
      this.emitter.off(EVENT_KEY, wrapped);
      this.handlerWrappers.delete(handler);
    }
  }

  unsubscribeTopic(topic: string, handler: TopicHandler): void {
    const wrapped = this.topicHandlerWrappers.get(topic)?.get(handler);
    if (wrapped) {
      this.emitter.off(topicKey(topic), wrapped);
      this.topicHandlerWrappers.get(topic)?.delete(handler);
      if (this.topicHandlerWrappers.get(topic)?.size === 0) {
        this.topicHandlerWrappers.delete(topic);
      }
    }
  }

  get publishedCount(): number {
    return this._publishedCount;
  }

  get handlerCount(): number {
    return this.emitter.listenerCount(EVENT_KEY);
  }

  private runHandler<T>(
    handler: (payload: T) => void | Promise<void>,
    payload: T,
    errorPrefix: string,
  ): void {
    try {
      Promise.resolve(handler(payload)).catch((error) => {
        console.error(errorPrefix, error);
      });
    } catch (error) {
      console.error(errorPrefix, error);
    }
  }
}
