import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scannerFetch } from '../scanner-fetch.js';

describe('scannerFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts slow requests after the configured timeout', async () => {
    globalThis.fetch = vi.fn((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('This operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    ) as typeof fetch;

    const request = scannerFetch('https://example.com/slow', { timeoutMs: 100 });
    const expectation = expect(request).rejects.toMatchObject({
      name: 'AbortError',
      message: expect.stringContaining('100ms'),
    });

    await vi.advanceTimersByTimeAsync(100);

    await expectation;
  });

  it('composes caller abort signals with its timeout signal', async () => {
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input, init) => {
      observedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Caller aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as typeof fetch;

    const controller = new AbortController();
    const request = scannerFetch('https://example.com/abort', {
      signal: controller.signal,
      timeoutMs: 1_000,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(observedSignal).toBeDefined();
    expect(observedSignal).not.toBe(controller.signal);
    expect(observedSignal?.aborted).toBe(true);
  });
});
