import type { RawEvent } from './raw-event.js';

export interface EventBus {
  publish(event: RawEvent): Promise<void>;
  subscribe(handler: (event: RawEvent) => void | Promise<void>): () => void;
  publishTopic(topic: string, payload: unknown): Promise<void>;
  subscribeTopic(
    topic: string,
    handler: (payload: unknown) => void | Promise<void>,
  ): () => void;
}
