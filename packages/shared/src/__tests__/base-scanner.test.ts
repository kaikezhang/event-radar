import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseScanner } from '../base-scanner.js';
import { InMemoryEventBus } from '../in-memory-event-bus.js';
import { ok, err } from '../schemas/result.js';
import type { RawEvent } from '../schemas/raw-event.js';
import type { Result } from '../schemas/result.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'test',
    type: 'test-event',
    title: 'Test Event',
    body: 'body',
    timestamp: new Date(),
    ...overrides,
  };
}

function makeAbortError(
  message = 'Request timed out after 30000ms',
): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

class SuccessScanner extends BaseScanner {
  callCount = 0;

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    this.callCount++;
    return ok([makeEvent()]);
  }
}

class FailScanner extends BaseScanner {
  protected async poll(): Promise<Result<RawEvent[], Error>> {
    return err(new Error('poll failed'));
  }
}

class ThrowScanner extends BaseScanner {
  protected async poll(): Promise<Result<RawEvent[], Error>> {
    throw new Error('unexpected crash');
  }
}

describe('BaseScanner', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new InMemoryEventBus();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to create scanners with proper options
  function makeSuccessScanner() {
    return new SuccessScanner({
      name: 'test-success',
      source: 'test',
      pollIntervalMs: 1000,
      eventBus,
    });
  }

  function makeFailScanner() {
    return new FailScanner({
      name: 'test-fail',
      source: 'test',
      pollIntervalMs: 1000,
      eventBus,
    });
  }

  function makeThrowScanner() {
    return new ThrowScanner({
      name: 'test-throw',
      source: 'test',
      pollIntervalMs: 1000,
      eventBus,
    });
  }

  describe('scan()', () => {
    it('should return events on successful poll', async () => {
      const scanner = makeSuccessScanner();
      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].source).toBe('test');
      }
    });

    it('should publish events to the event bus', async () => {
      const scanner = makeSuccessScanner();
      const events: RawEvent[] = [];
      eventBus.subscribe((e) => { events.push(e); });

      await scanner.scan();
      expect(events).toHaveLength(1);
    });

    it('should return error result on poll failure', async () => {
      const scanner = makeFailScanner();
      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('poll failed');
      }
    });

    it('should catch thrown errors and return err result', async () => {
      const scanner = makeThrowScanner();
      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('unexpected crash');
      }
    });
  });

  describe('health tracking', () => {
    it('should start with healthy status', () => {
      const scanner = makeSuccessScanner();
      const h = scanner.health();
      expect(h.status).toBe('healthy');
      expect(h.errorCount).toBe(0);
      expect(h.lastScanAt).toBeNull();
    });

    it('should update lastScanAt after scan', async () => {
      const scanner = makeSuccessScanner();
      await scanner.scan();
      expect(scanner.health().lastScanAt).not.toBeNull();
    });

    it('should stay healthy after successful scans', async () => {
      const scanner = makeSuccessScanner();
      await scanner.scan();
      await scanner.scan();
      const h = scanner.health();
      expect(h.status).toBe('healthy');
      expect(h.errorCount).toBe(0);
    });

    it('should become degraded after 1 error', async () => {
      const scanner = makeFailScanner();
      await scanner.scan();
      const h = scanner.health();
      expect(h.status).toBe('degraded');
      expect(h.errorCount).toBe(1);
    });

    it('should become down after 3 consecutive errors', async () => {
      const scanner = makeFailScanner();
      await scanner.scan();
      await scanner.scan();
      await scanner.scan();
      const h = scanner.health();
      expect(h.status).toBe('down');
      expect(h.errorCount).toBe(3);
    });

    it('should reset errorCount on successful scan', async () => {
      // Use a scanner that fails first, then succeeds to test reset behavior
      const mixedScanner = new (class extends BaseScanner {
        private failCount = 2;
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          if (this.failCount > 0) {
            this.failCount--;
            return err(new Error('fail'));
          }
          return ok([makeEvent()]);
        }
      })({
        name: 'mixed',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      await mixedScanner.scan(); // fail
      await mixedScanner.scan(); // fail
      expect(mixedScanner.health().errorCount).toBe(2);

      await mixedScanner.scan(); // success
      expect(mixedScanner.health().errorCount).toBe(0);
      expect(mixedScanner.health().status).toBe('healthy');
    });

    it('should track health for thrown errors', async () => {
      const scanner = makeThrowScanner();
      await scanner.scan();
      const h = scanner.health();
      expect(h.status).toBe('degraded');
      expect(h.errorCount).toBe(1);
      expect(h.lastScanAt).not.toBeNull();
    });
  });

  describe('start/stop lifecycle', () => {
    it('should not be running initially', () => {
      const scanner = makeSuccessScanner();
      expect(scanner.running).toBe(false);
    });

    it('should poll immediately on start()', async () => {
      const scanner = makeSuccessScanner() as SuccessScanner;
      scanner.start();
      expect(scanner.running).toBe(true);
      expect(scanner.callCount).toBe(1);

      await Promise.resolve();
      expect(scanner.health().lastScanAt).not.toBeNull();
      expect(scanner.callCount).toBe(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(scanner.callCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(scanner.callCount).toBe(2);

      scanner.stop();
    });

    it('should stop polling on stop()', async () => {
      const scanner = makeSuccessScanner() as SuccessScanner;
      scanner.start();

      await vi.advanceTimersByTimeAsync(1000);
      const countAfterFirst = scanner.callCount;

      scanner.stop();
      expect(scanner.running).toBe(false);

      await vi.advanceTimersByTimeAsync(5000);
      expect(scanner.callCount).toBe(countAfterFirst);
    });

    it('should be idempotent for start()', () => {
      const scanner = makeSuccessScanner();
      scanner.start();
      scanner.start(); // second call should be no-op
      expect(scanner.running).toBe(true);
      scanner.stop();
    });

    it('should be idempotent for stop()', () => {
      const scanner = makeSuccessScanner();
      scanner.stop(); // not running, should be no-op
      expect(scanner.running).toBe(false);
    });
  });

  describe('error isolation', () => {
    it('should continue polling after poll failure', async () => {
      let calls = 0;
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          calls++;
          if (calls === 1) return err(new Error('first fail'));
          return ok([makeEvent()]);
        }
      })({
        name: 'resilient',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      scanner.start();
      await Promise.resolve(); // first poll (fails immediately)
      expect(scanner.health().errorCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000); // second poll (succeeds)
      expect(scanner.health().errorCount).toBe(0);
      expect(scanner.health().status).toBe('healthy');

      scanner.stop();
    });

    it('should continue polling after poll throws', async () => {
      let calls = 0;
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          calls++;
          if (calls === 1) throw new Error('crash');
          return ok([makeEvent()]);
        }
      })({
        name: 'crash-resilient',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      scanner.start();
      await Promise.resolve(); // first poll (throws immediately)
      expect(scanner.health().errorCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000); // second poll (succeeds)
      expect(scanner.health().errorCount).toBe(0);

      scanner.stop();
    });
  });

  describe('scanner name in health', () => {
    it('should include the scanner name in health', () => {
      const scanner = makeSuccessScanner();
      expect(scanner.health().scanner).toBe('test-success');
    });
  });

  describe('backoff on consecutive errors', () => {
    it('should not be in backoff with fewer than 5 consecutive errors', async () => {
      const scanner = makeFailScanner();
      for (let i = 0; i < 4; i++) {
        await scanner.scan();
      }
      const h = scanner.health();
      expect(h.consecutiveErrors).toBe(4);
      expect(h.inBackoff).toBe(false);
      expect(h.currentIntervalMs).toBe(1000);
    });

    it('should enter backoff after 5 consecutive errors', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const scanner = makeFailScanner();
      for (let i = 0; i < 5; i++) {
        await scanner.scan();
      }
      const h = scanner.health();
      expect(h.consecutiveErrors).toBe(5);
      expect(h.inBackoff).toBe(true);
      expect(h.currentIntervalMs).toBe(2000); // 1000 * 2^1
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-fail] Entering backoff: 5 consecutive errors'),
      );
      logSpy.mockRestore();
    });

    it('should double interval with each additional error after backoff threshold', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const scanner = makeFailScanner();
      // 5 errors => 2x, 6 => 4x, 7 => 8x
      for (let i = 0; i < 7; i++) {
        await scanner.scan();
      }
      const h = scanner.health();
      expect(h.consecutiveErrors).toBe(7);
      // doublings = 7 - 5 + 1 = 3 => 1000 * 2^3 = 8000
      expect(h.currentIntervalMs).toBe(8000);
      vi.restoreAllMocks();
    });

    it('should cap backoff at 30 minutes', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const scanner = makeFailScanner();
      // Enough errors to exceed 30 minutes
      for (let i = 0; i < 30; i++) {
        await scanner.scan();
      }
      const h = scanner.health();
      expect(h.currentIntervalMs).toBe(1_800_000);
      vi.restoreAllMocks();
    });

    it('should reset backoff after successful poll', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      let shouldFail = true;
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          if (shouldFail) return err(new Error('fail'));
          return ok([makeEvent()]);
        }
      })({
        name: 'backoff-reset',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      // Trigger backoff
      for (let i = 0; i < 6; i++) {
        await scanner.scan();
      }
      expect(scanner.health().inBackoff).toBe(true);

      // Succeed once
      shouldFail = false;
      await scanner.scan();
      const h = scanner.health();
      expect(h.consecutiveErrors).toBe(0);
      expect(h.inBackoff).toBe(false);
      expect(h.currentIntervalMs).toBe(1000);
      expect(logSpy).toHaveBeenCalledWith(
        '[backoff-reset] Backoff reset after successful poll',
      );
      logSpy.mockRestore();
    });

    it('should use backoff interval in timer scheduling', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      let calls = 0;
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          calls++;
          return err(new Error('always fail'));
        }
      })({
        name: 'timer-backoff',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      scanner.start();

      expect(calls).toBe(1); // immediate first poll

      // Next 4 polls at 1000ms each
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(calls).toBe(5);
      expect(scanner.health().inBackoff).toBe(true);

      // 6th poll should be at 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(5); // not yet
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(6);

      scanner.stop();
      vi.restoreAllMocks();
    });

    it('should reset timer to normal interval after backoff recovery', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      let shouldFail = true;
      let calls = 0;
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          calls++;
          if (shouldFail) return err(new Error('fail'));
          return ok([makeEvent()]);
        }
      })({
        name: 'recovery',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      scanner.start();

      expect(calls).toBe(1); // immediate first failure

      // 4 more failures at normal interval
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(calls).toBe(5);
      expect(scanner.health().inBackoff).toBe(true);

      // Next poll at 2000ms - make it succeed
      shouldFail = false;
      await vi.advanceTimersByTimeAsync(2000);
      expect(calls).toBe(6);
      expect(scanner.health().inBackoff).toBe(false);

      // Next poll should be back to 1000ms
      const callsBefore = calls;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(callsBefore + 1);

      scanner.stop();
      vi.restoreAllMocks();
    });

    it('should track consecutiveErrors separately from errorCount', async () => {
      let shouldFail = false;
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          if (shouldFail) return err(new Error('fail'));
          return ok([makeEvent()]);
        }
      })({
        name: 'tracking',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      // Success resets both
      await scanner.scan();
      expect(scanner.health().errorCount).toBe(0);
      expect(scanner.health().consecutiveErrors).toBe(0);

      // Errors increment both
      shouldFail = true;
      await scanner.scan();
      await scanner.scan();
      expect(scanner.health().errorCount).toBe(2);
      expect(scanner.health().consecutiveErrors).toBe(2);

      // Success resets both
      shouldFail = false;
      await scanner.scan();
      expect(scanner.health().errorCount).toBe(0);
      expect(scanner.health().consecutiveErrors).toBe(0);
    });

    it('should log backoff entry only once', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const scanner = makeFailScanner();

      for (let i = 0; i < 10; i++) {
        await scanner.scan();
      }

      const backoffLogs = logSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Entering backoff'),
      );
      expect(backoffLogs).toHaveLength(1);
      logSpy.mockRestore();
    });

    it('should not enter backoff before 3 consecutive timeouts', async () => {
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          return err(makeAbortError());
        }
      })({
        name: 'timeout-threshold',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      await scanner.scan();
      await scanner.scan();

      const h = scanner.health();
      expect(h.consecutiveErrors).toBe(2);
      expect(h.inBackoff).toBe(false);
      expect(h.currentIntervalMs).toBe(1000);
    });

    it('should enter backoff after 3 consecutive timeouts', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const scanner = new (class extends BaseScanner {
        protected async poll(): Promise<Result<RawEvent[], Error>> {
          return err(makeAbortError('Request timed out after 15000ms'));
        }
      })({
        name: 'timeout-backoff',
        source: 'test',
        pollIntervalMs: 1000,
        eventBus,
      });

      await scanner.scan();
      await scanner.scan();
      await scanner.scan();

      const h = scanner.health();
      expect(h.consecutiveErrors).toBe(3);
      expect(h.inBackoff).toBe(true);
      expect(h.currentIntervalMs).toBe(2000);
      expect(console.warn).toHaveBeenCalledWith(
        '[timeout-backoff] request timed out after 15000ms',
      );
      vi.restoreAllMocks();
    });
  });
});
