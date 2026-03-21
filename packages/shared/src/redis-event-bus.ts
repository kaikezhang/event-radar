import type { Redis } from 'ioredis';
import type { EventBus } from './schemas/event-bus.js';
import type { RawEvent } from './schemas/raw-event.js';

type Handler = (event: RawEvent) => void | Promise<void>;
type TopicHandler = (payload: unknown) => void | Promise<void>;

const STREAM_KEY = 'event-radar:events';
const topicStreamKey = (topic: string) => `event-radar:topic:${topic}`;
const RAW_GROUP_NAME = 'pipeline-workers';
const CONSUMER_NAME = `worker-${process.pid}`;
const BLOCK_MS = 1000;

export interface RedisEventBusOptions {
  redisUrl?: string;
  maxLen?: number;
}

interface StreamLoop {
  running: boolean;
  promise: Promise<void>;
  groupName: string;
}

export class RedisEventBus implements EventBus {
  private readonly redisUrl: string;
  private readonly maxLen: number;
  private readonly instanceId: string;
  private client: Redis | null = null;
  private readClient: Redis | null = null;
  private handlers: Handler[] = [];
  private topicHandlers = new Map<string, TopicHandler[]>();
  private streamLoops = new Map<string, StreamLoop>();
  private _publishedCount = 0;

  constructor(redisUrl = 'redis://localhost:6379', options?: { maxLen?: number }) {
    this.redisUrl = redisUrl;
    this.maxLen = options?.maxLen ?? Number(process.env.REDIS_STREAM_MAXLEN || '10000');
    this.instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async getClient(): Promise<Redis> {
    if (!this.client) {
      const { default: IORedis } = await import('ioredis');
      this.client = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    }
    return this.client;
  }

  private async getReadClient(): Promise<Redis> {
    if (!this.readClient) {
      const { default: IORedis } = await import('ioredis');
      this.readClient = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    }
    return this.readClient;
  }

  async publish(event: RawEvent): Promise<void> {
    const client = await this.getClient();
    const data = JSON.stringify(event);
    await client.xadd(STREAM_KEY, 'MAXLEN', '~', String(this.maxLen), '*', 'data', data);
    this._publishedCount++;
  }

  subscribe(handler: Handler): () => void {
    this.handlers.push(handler);
    if (!this.streamLoops.has(STREAM_KEY) && this.handlers.length === 1) {
      this.startReadLoop(STREAM_KEY, this.handlers, '[RedisEventBus] Unhandled error in subscriber:', true, RAW_GROUP_NAME);
    }
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
      if (this.handlers.length === 0) {
        // Synchronously delete from map to prevent race with immediate re-subscribe,
        // then drain the loop in background
        const loop = this.streamLoops.get(STREAM_KEY);
        if (loop) {
          loop.running = false;
          this.streamLoops.delete(STREAM_KEY);
          loop.promise.catch(() => {}); // drain in background, errors logged inside loop
        }
      }
    };
  }

  async publishTopic(topic: string, payload: unknown): Promise<void> {
    const client = await this.getClient();
    const data = JSON.stringify(payload);
    await client.xadd(topicStreamKey(topic), 'MAXLEN', '~', String(this.maxLen), '*', 'data', data);
  }

  subscribeTopic(topic: string, handler: TopicHandler): () => void {
    let handlers = this.topicHandlers.get(topic);
    const streamKey = topicStreamKey(topic);
    if (!handlers) {
      handlers = [];
      this.topicHandlers.set(topic, handlers);
      const topicGroupName = `topic-${this.instanceId}`;
      this.startReadLoop(streamKey, handlers, '[RedisEventBus] Unhandled error in topic subscriber:', false, topicGroupName);
    }
    handlers.push(handler);
    return () => {
      const arr = this.topicHandlers.get(topic);
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) {
          this.topicHandlers.delete(topic);
          // Synchronously delete from map to prevent race with immediate re-subscribe,
          // then drain the loop in background
          const loop = this.streamLoops.get(streamKey);
          if (loop) {
            loop.running = false;
            this.streamLoops.delete(streamKey);
            loop.promise.catch(() => {}); // drain in background, errors logged inside loop
          }
        }
      }
    };
  }

  private async stopStreamLoop(streamKey: string): Promise<void> {
    const loop = this.streamLoops.get(streamKey);
    if (loop) {
      loop.running = false;
      try {
        await loop.promise;
      } finally {
        // Always clean up even if the loop promise rejects
        this.streamLoops.delete(streamKey);
      }
    }
  }

  private startReadLoop(
    streamKey: string,
    handlers: (Handler | TopicHandler)[],
    errorPrefix: string,
    parseAsRawEvent: boolean,
    groupName: string,
  ): void {
    const loopState: StreamLoop = {
      running: true,
      promise: Promise.resolve(),
      groupName,
    };
    this.streamLoops.set(streamKey, loopState);

    loopState.promise = (async () => {
      const reader = await this.getReadClient();
      await this.ensureGroup(reader, streamKey, groupName);

      while (loopState.running) {
        try {
          const results = await reader.xreadgroup(
            'GROUP', groupName, CONSUMER_NAME,
            'COUNT', '10',
            'BLOCK', String(BLOCK_MS),
            'STREAMS', streamKey, '>',
          ) as [string, [string, string[]][]][] | null;

          if (!results) continue;

          for (const [, messages] of results) {
            for (const [messageId, fields] of messages) {
              const dataIndex = fields.indexOf('data');
              if (dataIndex === -1 || dataIndex + 1 >= fields.length) continue;

              const raw = fields[dataIndex + 1];
              let payload: unknown;
              try {
                payload = JSON.parse(raw);
                if (parseAsRawEvent && payload && typeof payload === 'object' && 'timestamp' in payload) {
                  (payload as Record<string, unknown>).timestamp = new Date(
                    (payload as Record<string, unknown>).timestamp as string,
                  );
                }
              } catch {
                console.error(`[RedisEventBus] Failed to parse message ${messageId}`);
                await reader.xack(streamKey, groupName, messageId);
                continue;
              }

              for (const handler of [...handlers]) {
                try {
                  await Promise.resolve((handler as (p: unknown) => void | Promise<void>)(payload));
                } catch (error) {
                  console.error(errorPrefix, error);
                }
              }

              await reader.xack(streamKey, groupName, messageId);
            }
          }
        } catch (error) {
          if (!loopState.running) break;
          console.error('[RedisEventBus] Read loop error, retrying in 1s:', error);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })();
  }

  private async ensureGroup(client: Redis, streamKey: string, groupName: string): Promise<void> {
    try {
      await client.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  get publishedCount(): number {
    return this._publishedCount;
  }

  get handlerCount(): number {
    return this.handlers.length;
  }

  async shutdown(): Promise<void> {
    for (const loop of this.streamLoops.values()) {
      loop.running = false;
    }
    await Promise.allSettled([...this.streamLoops.values()].map((l) => l.promise));
    this.streamLoops.clear();
    if (this.readClient) {
      this.readClient.disconnect();
      this.readClient = null;
    }
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
