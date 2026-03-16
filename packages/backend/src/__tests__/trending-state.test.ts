import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TrendingStateTracker } from '../scanners/trending-state.js';

const TEST_DIR = '/tmp/event-radar-seen-test';
const TEST_FILE = join(TEST_DIR, 'test-trending.json');

describe('TrendingStateTracker', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  function createTracker(cooldownMs = 24 * 60 * 60 * 1000) {
    return new TrendingStateTracker({
      name: 'test-trending',
      cooldownMs,
      nopersist: true,
    });
  }

  function createPersistedTracker(cooldownMs = 24 * 60 * 60 * 1000) {
    // Force persistence even in test env by providing persistDir
    return new TrendingStateTracker({
      name: 'test-trending',
      cooldownMs,
      persistDir: TEST_DIR,
      nopersist: false,
    });
  }

  it('should emit all tickers on first poll (fresh install)', () => {
    const tracker = createTracker();
    const entered = tracker.update(['AAPL', 'TSLA', 'SPY']);
    expect(entered).toEqual(['AAPL', 'TSLA', 'SPY']);
  });

  it('should emit nothing on second poll with same tickers', () => {
    const tracker = createTracker();
    const now = Date.now();
    tracker.update(['AAPL', 'TSLA', 'SPY'], now);
    const entered = tracker.update(['AAPL', 'TSLA', 'SPY'], now + 60_000);
    expect(entered).toEqual([]);
  });

  it('should emit only new tickers when list changes', () => {
    const tracker = createTracker();
    const now = Date.now();
    tracker.update(['AAPL', 'TSLA'], now);
    const entered = tracker.update(['AAPL', 'TSLA', 'NVDA'], now + 60_000);
    expect(entered).toEqual(['NVDA']);
  });

  it('should NOT emit re-entry within cooldown period', () => {
    const tracker = createTracker(24 * 60 * 60 * 1000); // 24h
    const now = Date.now();

    // Poll 1: AAPL enters
    tracker.update(['AAPL'], now);

    // Poll 2: AAPL exits (not in list)
    tracker.update([], now + 60_000);

    // Poll 3: AAPL re-enters 1h later — within 24h cooldown
    const entered = tracker.update(['AAPL'], now + 60 * 60 * 1000);
    expect(entered).toEqual([]);
  });

  it('should emit re-entry after cooldown expires', () => {
    const tracker = createTracker(24 * 60 * 60 * 1000); // 24h
    const now = Date.now();

    // Poll 1: AAPL enters
    tracker.update(['AAPL'], now);

    // Poll 2: AAPL exits
    tracker.update([], now + 60_000);

    // Poll 3: AAPL re-enters 25h later — past cooldown
    const entered = tracker.update(
      ['AAPL'],
      now + 25 * 60 * 60 * 1000,
    );
    expect(entered).toEqual(['AAPL']);
  });

  it('should prune old tickers that exited past cooldown', () => {
    const tracker = createTracker(1000); // 1s cooldown for fast test
    const now = Date.now();

    tracker.update(['AAPL', 'TSLA'], now);
    // Both exit
    tracker.update([], now + 500);
    // 2s later — past cooldown — both should be pruned, re-entry emits
    const entered = tracker.update(['AAPL'], now + 2000);
    expect(entered).toEqual(['AAPL']);
  });

  describe('persistence', () => {
    it('should survive restart — no duplicate events for still-trending tickers', () => {
      const now = Date.now();

      // First "process" — poll once
      const tracker1 = createPersistedTracker();
      tracker1.update(['AAPL', 'TSLA'], now);
      tracker1.dispose(); // flush to disk

      // Second "process" — simulates restart
      const tracker2 = createPersistedTracker();
      const entered = tracker2.update(['AAPL', 'TSLA'], now + 60_000);
      expect(entered).toEqual([]);
      tracker2.dispose();
    });

    it('should emit new tickers after restart but not existing ones', () => {
      const now = Date.now();

      const tracker1 = createPersistedTracker();
      tracker1.update(['AAPL'], now);
      tracker1.dispose();

      const tracker2 = createPersistedTracker();
      const entered = tracker2.update(['AAPL', 'NVDA'], now + 60_000);
      expect(entered).toEqual(['NVDA']);
      tracker2.dispose();
    });

    it('should handle corrupt persisted file gracefully', () => {
      writeFileSync(TEST_FILE, 'not json!!!');

      const tracker = createPersistedTracker();
      const entered = tracker.update(['AAPL']);
      // Should treat as fresh start
      expect(entered).toEqual(['AAPL']);
      tracker.dispose();
    });
  });

  describe('dispose', () => {
    it('should flush state on dispose', () => {
      const tracker = createPersistedTracker();
      tracker.update(['AAPL']);
      tracker.dispose();
      expect(existsSync(TEST_FILE)).toBe(true);
    });
  });
});
