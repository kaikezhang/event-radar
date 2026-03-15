import type { Severity } from '@event-radar/shared';
import { pipelineQueueDroppedTotal } from '../metrics.js';

export interface PipelineTask {
  severity: Severity;
  run: () => Promise<void>;
}

export interface PipelineLimiterOptions {
  maxConcurrent?: number;
  maxQueueDepth?: number;
  onError?: (error: unknown) => void;
}

interface QueueEntry extends PipelineTask {
  sequence: number;
}

interface DrainWaiter {
  resolve: (drained: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export class PipelineLimiter {
  private readonly maxConcurrent: number;
  private readonly maxQueueDepth: number;
  private readonly onError?: (error: unknown) => void;
  private readonly queue: QueueEntry[] = [];
  private readonly drainWaiters: DrainWaiter[] = [];
  private activeCount = 0;
  private nextSequence = 0;
  private accepting = true;

  constructor(options?: PipelineLimiterOptions) {
    this.maxConcurrent = options?.maxConcurrent ?? 5;
    this.maxQueueDepth = options?.maxQueueDepth ?? 100;
    this.onError = options?.onError;
  }

  enqueue(task: PipelineTask): boolean {
    if (!this.accepting) {
      return false;
    }

    const entry: QueueEntry = {
      ...task,
      sequence: this.nextSequence++,
    };

    if (this.activeCount < this.maxConcurrent) {
      this.start(entry);
      return true;
    }

    if (this.queue.length >= this.maxQueueDepth) {
      const lowestIndex = this.findLowestSeverityIndex();
      if (
        lowestIndex !== -1
        && this.isHigherPriority(entry, this.queue[lowestIndex])
      ) {
        this.queue.splice(lowestIndex, 1);
        pipelineQueueDroppedTotal.inc();
      } else {
        pipelineQueueDroppedTotal.inc();
        return false;
      }
    }

    this.insertByPriority(entry);
    return true;
  }

  async drain(timeoutMs = 30_000): Promise<boolean> {
    this.accepting = false;

    if (this.activeCount === 0 && this.queue.length === 0) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.removeDrainWaiter(timeout);
        resolve(false);
      }, timeoutMs);

      this.drainWaiters.push({ resolve, timeout });
    });
  }

  get active(): number {
    return this.activeCount;
  }

  get pending(): number {
    return this.queue.length;
  }

  private start(entry: QueueEntry): void {
    this.activeCount++;

    void (async () => {
      try {
        await entry.run();
      } catch (error) {
        if (this.onError) {
          this.onError(error);
        } else {
          console.error('[PipelineLimiter] Task failed:', error);
        }
      } finally {
        this.activeCount--;
        this.drainQueue();
        this.resolveDrainWaitersIfIdle();
      }
    })();
  }

  private drainQueue(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        return;
      }

      this.start(next);
    }
  }

  private insertByPriority(entry: QueueEntry): void {
    let index = 0;
    while (
      index < this.queue.length
      && !this.isHigherPriority(entry, this.queue[index])
    ) {
      index++;
    }

    this.queue.splice(index, 0, entry);
  }

  private findLowestSeverityIndex(): number {
    if (this.queue.length === 0) {
      return -1;
    }

    let lowestIndex = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.isHigherPriority(this.queue[lowestIndex], this.queue[i])) {
        lowestIndex = i;
      }
    }

    return lowestIndex;
  }

  private isHigherPriority(left: QueueEntry, right: QueueEntry): boolean {
    const leftRank = SEVERITY_RANK[left.severity];
    const rightRank = SEVERITY_RANK[right.severity];

    if (leftRank !== rightRank) {
      return leftRank > rightRank;
    }

    return left.sequence < right.sequence;
  }

  private resolveDrainWaitersIfIdle(): void {
    if (this.activeCount !== 0 || this.queue.length !== 0) {
      return;
    }

    while (this.drainWaiters.length > 0) {
      const waiter = this.drainWaiters.shift();
      if (!waiter) {
        return;
      }

      clearTimeout(waiter.timeout);
      waiter.resolve(true);
    }
  }

  private removeDrainWaiter(timeout: ReturnType<typeof setTimeout>): void {
    const index = this.drainWaiters.findIndex((waiter) => waiter.timeout === timeout);
    if (index !== -1) {
      this.drainWaiters.splice(index, 1);
    }
  }
}
