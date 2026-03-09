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

    it('should start polling on start()', async () => {
      const scanner = makeSuccessScanner();
      scanner.start();
      expect(scanner.running).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);
      expect(scanner.health().lastScanAt).not.toBeNull();

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
      await vi.advanceTimersByTimeAsync(1000); // first poll (fails)
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
      await vi.advanceTimersByTimeAsync(1000); // first poll (throws)
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
});
