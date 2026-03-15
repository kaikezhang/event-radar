import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PipelineLimiter } from '../pipeline/pipeline-limiter.js';
import { resetMetrics, registry } from '../metrics.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('PipelineLimiter', () => {
  beforeEach(() => {
    resetMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('respects the configured max concurrency', async () => {
    const limiter = new PipelineLimiter({
      maxConcurrent: 2,
      maxQueueDepth: 10,
    });
    let active = 0;
    let maxActive = 0;
    const first = deferred();
    const second = deferred();
    const third = deferred();

    const schedule = (gate: ReturnType<typeof deferred>) =>
      limiter.enqueue({
        severity: 'HIGH',
        run: async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await gate.promise;
          active--;
        },
      });

    expect(schedule(first)).toBe(true);
    expect(schedule(second)).toBe(true);
    expect(schedule(third)).toBe(true);

    await Promise.resolve();
    expect(active).toBe(2);
    expect(maxActive).toBe(2);

    first.resolve();
    second.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(active).toBe(1);

    third.resolve();
    await expect(limiter.drain()).resolves.toBe(true);
  });

  it('drops the lowest-severity queued event when a higher-severity event arrives to a full queue', async () => {
    const limiter = new PipelineLimiter({
      maxConcurrent: 1,
      maxQueueDepth: 2,
    });
    const blocker = deferred();
    const executed: string[] = [];

    limiter.enqueue({
      severity: 'CRITICAL',
      run: async () => {
        executed.push('active');
        await blocker.promise;
      },
    });
    limiter.enqueue({
      severity: 'LOW',
      run: async () => {
        executed.push('low');
      },
    });
    limiter.enqueue({
      severity: 'MEDIUM',
      run: async () => {
        executed.push('medium');
      },
    });

    const accepted = limiter.enqueue({
      severity: 'HIGH',
      run: async () => {
        executed.push('high');
      },
    });

    expect(accepted).toBe(true);

    blocker.resolve();
    await expect(limiter.drain()).resolves.toBe(true);

    expect(executed).toEqual(['active', 'high', 'medium']);

    const metric = await registry.getSingleMetricAsString('pipeline_queue_dropped_total');
    expect(metric).toContain('pipeline_queue_dropped_total 1');
  });

  it('drops the incoming event when the queue is full of equal-or-higher severity work', async () => {
    const limiter = new PipelineLimiter({
      maxConcurrent: 1,
      maxQueueDepth: 2,
    });
    const blocker = deferred();
    const executed: string[] = [];

    limiter.enqueue({
      severity: 'CRITICAL',
      run: async () => {
        executed.push('active');
        await blocker.promise;
      },
    });
    limiter.enqueue({
      severity: 'HIGH',
      run: async () => {
        executed.push('high');
      },
    });
    limiter.enqueue({
      severity: 'MEDIUM',
      run: async () => {
        executed.push('medium');
      },
    });

    const accepted = limiter.enqueue({
      severity: 'LOW',
      run: async () => {
        executed.push('low');
      },
    });

    expect(accepted).toBe(false);

    blocker.resolve();
    await expect(limiter.drain()).resolves.toBe(true);

    expect(executed).toEqual(['active', 'high', 'medium']);

    const metric = await registry.getSingleMetricAsString('pipeline_queue_dropped_total');
    expect(metric).toContain('pipeline_queue_dropped_total 1');
  });

  it('drains active and queued work before resolving shutdown', async () => {
    const limiter = new PipelineLimiter({
      maxConcurrent: 1,
      maxQueueDepth: 2,
    });
    const first = deferred();
    const secondRan = vi.fn();

    limiter.enqueue({
      severity: 'HIGH',
      run: async () => {
        await first.promise;
      },
    });
    limiter.enqueue({
      severity: 'MEDIUM',
      run: async () => {
        secondRan();
      },
    });

    let drainResolved = false;
    const drainPromise = limiter.drain().then((result) => {
      drainResolved = true;
      return result;
    });

    await Promise.resolve();
    expect(drainResolved).toBe(false);

    first.resolve();

    await expect(drainPromise).resolves.toBe(true);
    expect(secondRan).toHaveBeenCalledOnce();
  });

  it('returns false when drain times out before active work finishes', async () => {
    const limiter = new PipelineLimiter({
      maxConcurrent: 1,
      maxQueueDepth: 1,
    });
    const blocker = deferred();

    limiter.enqueue({
      severity: 'HIGH',
      run: async () => {
        await blocker.promise;
      },
    });

    const drainPromise = limiter.drain(10);

    await expect(drainPromise).resolves.toBe(false);

    blocker.resolve();
    await Promise.resolve();
  });
});
