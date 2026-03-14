import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScannerRegistry } from '../scanner-registry.js';
import { BaseScanner } from '../base-scanner.js';
import { InMemoryEventBus } from '../in-memory-event-bus.js';
import { ok } from '../schemas/result.js';
import type { RawEvent } from '../schemas/raw-event.js';
import type { Result } from '../schemas/result.js';

function makeEvent(): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'test',
    type: 'test-event',
    title: 'Test Event',
    body: 'body',
    timestamp: new Date(),
  };
}

class TestScanner extends BaseScanner {
  protected async poll(): Promise<Result<RawEvent[], Error>> {
    return ok([makeEvent()]);
  }
}

describe('ScannerRegistry', () => {
  let registry: ScannerRegistry;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new ScannerRegistry();
    eventBus = new InMemoryEventBus();
  });

  afterEach(() => {
    registry.stopAll();
    vi.useRealTimers();
  });

  function createScanner(name: string) {
    return new TestScanner({
      name,
      source: 'test',
      pollIntervalMs: 1000,
      eventBus,
    });
  }

  describe('register', () => {
    it('should register a scanner', () => {
      const scanner = createScanner('scanner-1');
      registry.register(scanner);
      expect(registry.getById('scanner-1')).toBe(scanner);
    });

    it('should throw on duplicate registration', () => {
      registry.register(createScanner('dup'));
      expect(() => registry.register(createScanner('dup'))).toThrow(
        'Scanner "dup" is already registered',
      );
    });
  });

  describe('unregister', () => {
    it('should remove scanner and stop it', () => {
      const scanner = createScanner('to-remove');
      registry.register(scanner);
      scanner.start();
      expect(scanner.running).toBe(true);

      registry.unregister('to-remove');
      expect(scanner.running).toBe(false);
      expect(registry.getById('to-remove')).toBeUndefined();
    });

    it('should be safe for unknown scanner name', () => {
      expect(() => registry.unregister('unknown')).not.toThrow();
    });
  });

  describe('getById', () => {
    it('should return undefined for unknown name', () => {
      expect(registry.getById('nonexistent')).toBeUndefined();
    });

    it('should return the registered scanner', () => {
      const scanner = createScanner('findme');
      registry.register(scanner);
      expect(registry.getById('findme')).toBe(scanner);
    });

    it('should normalize legacy aliases', () => {
      const xScanner = createScanner('x-elonmusk');
      const secScanner = createScanner('sec-edgar');
      registry.register(xScanner);
      registry.register(secScanner);
      expect(registry.getById('x')).toBe(xScanner);
      expect(registry.getById('twitter')).toBe(xScanner);
      expect(registry.getById('  X  ')).toBe(xScanner);
      expect(registry.getById('form-4')).toBe(secScanner);
      expect(registry.getById('8-k')).toBe(secScanner);
    });
  });

  describe('startAll / stopAll', () => {
    it('should start all registered scanners', () => {
      const s1 = createScanner('s1');
      const s2 = createScanner('s2');
      registry.register(s1);
      registry.register(s2);

      registry.startAll();
      expect(s1.running).toBe(true);
      expect(s2.running).toBe(true);
    });

    it('should stop all registered scanners', () => {
      const s1 = createScanner('s1');
      const s2 = createScanner('s2');
      registry.register(s1);
      registry.register(s2);

      registry.startAll();
      registry.stopAll();
      expect(s1.running).toBe(false);
      expect(s2.running).toBe(false);
    });
  });

  describe('healthAll', () => {
    it('should return empty array when no scanners', () => {
      expect(registry.healthAll()).toEqual([]);
    });

    it('should return health for all scanners', async () => {
      const s1 = createScanner('alpha');
      const s2 = createScanner('beta');
      registry.register(s1);
      registry.register(s2);

      await s1.scan();

      const healths = registry.healthAll();
      expect(healths).toHaveLength(2);

      const names = healths.map((h) => h.scanner);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');

      const alphaHealth = healths.find((h) => h.scanner === 'alpha');
      expect(alphaHealth?.status).toBe('healthy');
      expect(alphaHealth?.lastScanAt).not.toBeNull();
    });
  });
});
