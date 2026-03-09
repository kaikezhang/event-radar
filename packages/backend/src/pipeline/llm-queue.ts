import { err, type Result } from '@event-radar/shared';

export interface QueueItem<T> {
  data: T;
  priority: number; // lower number = higher priority
  resolve: (result: Result<string, Error>) => void;
}

export interface LlmQueueOptions {
  maxConcurrent?: number;
  maxQueueSize?: number;
  timeoutMs?: number;
}

export class LlmQueue {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly timeoutMs: number;
  private readonly queue: QueueItem<string>[] = [];
  private activeCount = 0;
  private readonly executor: (prompt: string) => Promise<Result<string, Error>>;

  constructor(
    executor: (prompt: string) => Promise<Result<string, Error>>,
    options?: LlmQueueOptions,
  ) {
    this.executor = executor;
    this.maxConcurrent = options?.maxConcurrent ?? 3;
    this.maxQueueSize = options?.maxQueueSize ?? 100;
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  async enqueue(prompt: string, priority: number): Promise<Result<string, Error>> {
    // If queue is full, drop the lowest-priority (highest number) item
    if (this.queue.length >= this.maxQueueSize) {
      const lowestPriorityIdx = this.findLowestPriorityIndex();
      if (lowestPriorityIdx !== -1 && this.queue[lowestPriorityIdx].priority > priority) {
        const dropped = this.queue.splice(lowestPriorityIdx, 1)[0];
        dropped.resolve(err(new Error('Dropped from queue due to backpressure')));
      } else {
        return err(new Error('Queue full and item has lower priority than all queued items'));
      }
    }

    return new Promise<Result<string, Error>>((resolve) => {
      const item: QueueItem<string> = { data: prompt, priority, resolve };
      this.insertByPriority(item);
      this.drain();
    });
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }

  private insertByPriority(item: QueueItem<string>): void {
    // Insert in priority order (lower number = higher priority = front of queue)
    let i = 0;
    while (i < this.queue.length && this.queue[i].priority <= item.priority) {
      i++;
    }
    this.queue.splice(i, 0, item);
  }

  private findLowestPriorityIndex(): number {
    if (this.queue.length === 0) return -1;
    let idx = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].priority > this.queue[idx].priority) {
        idx = i;
      }
    }
    return idx;
  }

  private drain(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.activeCount++;
      this.executeWithTimeout(item);
    }
  }

  private executeWithTimeout(item: QueueItem<string>): void {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const execute = async (): Promise<void> => {
      try {
        const resultPromise = this.executor(item.data);
        const timeoutPromise = new Promise<Result<string, Error>>((resolve) => {
          controller.signal.addEventListener('abort', () => {
            resolve(err(new Error(`LLM request timed out after ${this.timeoutMs}ms`)));
          });
        });

        const result = await Promise.race([resultPromise, timeoutPromise]);
        item.resolve(result);
      } catch (e) {
        item.resolve(err(e instanceof Error ? e : new Error(String(e))));
      } finally {
        clearTimeout(timeout);
        this.activeCount--;
        this.drain();
      }
    };

    void execute();
  }
}
