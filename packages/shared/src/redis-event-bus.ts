import type { Redis } from 'ioredis';
import type { EventBus } from './schemas/event-bus.js';
import type { RawEvent } from './schemas/raw-event.js';

type Handler = (event: RawEvent) => void | Promise<void>;
type TopicHandler = (payload: unknown) => void | Promise<void>;

const STREAM_KEY = 'event-radar:events';
const topicStreamKey = (topic: string) => `event-radar:topic:${topic}`;
const GROUP_NAME = 'pipeline-workers';
const CONSUMER_NAME = `worker-${process.pid}`;
const BLOCK_MS = 1000;

export interface RedisEventBusOptions {
  redisUrl?: string;
  maxLen?: number;
}

export class RedisEventBus implements EventBus {
  private readonly redisUrl: string;
  private readonly maxLen: number;
  private client: Redis | null = null;
  private readClient: Redis | null = null;
  private handlers: Handler[] = [];
  private topicHandlers = new Map<string, TopicHandler[]>();
  private running = false;
  private readLoops: Promise<void>[] = [];
  private _publishedCount = 0;

  constructor(redisUrl = 'redis://localhost:6379', options?: { maxLen?: number }) {
    this.redisUrl = redisUrl;
    this.maxLen = options?.maxLen ?? Number(process.env.REDIS_STREAM_MAXLEN || '10000');
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
    if (!this.running && this.handlers.length === 1) {
      this.startReadLoop(STREAM_KEY, this.handlers, '[RedisEventBus] Unhandled error in subscriber:', true);
    }
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  async publishTopic(topic: string, payload: unknown): Promise<void> {
    const client = await this.getClient();
    const data = JSON.stringify(payload);
    await client.xadd(topicStreamKey(topic), 'MAXLEN', '~', String(this.maxLen), '*', 'data', data);
  }

  subscribeTopic(topic: string, handler: TopicHandler): () => void {
    let handlers = this.topicHandlers.get(topic);
    if (!handlers) {
      handlers = [];
      this.topicHandlers.set(topic, handlers);
      this.startReadLoop(topicStreamKey(topic), handlers, '[RedisEventBus] Unhandled error in topic subscriber:', false);
    }
    handlers.push(handler);
    return () => {
      const arr = this.topicHandlers.get(topic);
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) this.topicHandlers.delete(topic);
      }
    };
  }

  private startReadLoop(
    streamKey: string,
    handlers: (Handler | TopicHandler)[],
    errorPrefix: string,
    parseAsRawEvent: boolean,
  ): void {
    this.running = true;
    const loop = (async () => {
      const reader = await this.getReadClient();
      await this.ensureGroup(reader, streamKey);

      while (this.running) {
        try {
          const results = await reader.xreadgroup(
            'GROUP', GROUP_NAME, CONSUMER_NAME,
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
                await reader.xack(streamKey, GROUP_NAME, messageId);
                continue;
              }

              for (const handler of [...handlers]) {
                try {
                  await Promise.resolve((handler as (p: unknown) => void | Promise<void>)(payload));
                } catch (error) {
                  console.error(errorPrefix, error);
                }
              }

              await reader.xack(streamKey, GROUP_NAME, messageId);
            }
          }
        } catch (error) {
          if (!this.running) break;
          console.error('[RedisEventBus] Read loop error, retrying in 1s:', error);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })();
    this.readLoops.push(loop);
  }

  private async ensureGroup(client: Redis, streamKey: string): Promise<void> {
    try {
      await client.xgroup('CREATE', streamKey, GROUP_NAME, '0', 'MKSTREAM');
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
    this.running = false;
    await Promise.allSettled(this.readLoops);
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
