import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface TickerState {
  firstSeen: number; // epoch ms — when ticker first entered trending
  lastSeen: number;  // epoch ms — last poll where ticker was still trending
}

interface PersistedState {
  tickers: Record<string, TickerState>;
  updatedAt: number;
}

/**
 * Persisted trending state tracker.
 * Tracks which tickers are currently trending and when they were last seen.
 * Only reports genuine state changes:
 * - Ticker enters trending after not being trending for > cooldownMs
 * - NOT on restart (persisted state survives process restart)
 */
export class TrendingStateTracker {
  private tickers: Map<string, TickerState> = new Map();
  private readonly persistPath: string | null;
  private readonly cooldownMs: number;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    name: string;
    cooldownMs: number;
    persistDir?: string;
    /** Set true in tests to disable persistence */
    nopersist?: boolean;
  }) {
    this.cooldownMs = options.cooldownMs;

    const isTest = options.nopersist ?? (!!process.env.VITEST || process.env.NODE_ENV === 'test');
    if (!isTest) {
      const dir = options.persistDir ?? '/tmp/event-radar-seen';
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      this.persistPath = join(dir, `${options.name}.json`);
      this.load();
    } else {
      this.persistPath = null;
    }
  }

  /**
   * Call with current set of trending tickers each poll.
   * Returns ONLY tickers that genuinely entered trending (state change).
   */
  update(currentTrending: string[], now = Date.now()): string[] {
    const entered: string[] = [];
    const currentSet = new Set(currentTrending);

    // Check each currently trending ticker
    for (const ticker of currentTrending) {
      const existing = this.tickers.get(ticker);

      if (!existing) {
        // Never seen — new entry
        this.tickers.set(ticker, { firstSeen: now, lastSeen: now });
        entered.push(ticker);
      } else if (now - existing.lastSeen > this.cooldownMs) {
        // Was gone long enough — re-entry
        this.tickers.set(ticker, { firstSeen: now, lastSeen: now });
        entered.push(ticker);
      } else {
        // Still trending — update lastSeen
        existing.lastSeen = now;
      }
    }

    // Prune tickers not currently trending and past cooldown
    this.prune(currentSet, now);

    this.debouncedSave();
    return entered;
  }

  /** Remove tickers that exited trending > cooldownMs ago. */
  private prune(currentSet: Set<string>, now: number): void {
    for (const [ticker, state] of this.tickers) {
      if (!currentSet.has(ticker) && now - state.lastSeen > this.cooldownMs) {
        this.tickers.delete(ticker);
      }
    }
  }

  /** Flush pending state to disk immediately. Call on shutdown. */
  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      this.save();
      this.dirty = false;
    }
  }

  private debouncedSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        this.dirty = false;
        this.save();
      }
    }, 1000);
  }

  private save(): void {
    if (!this.persistPath) return;
    const state: PersistedState = {
      tickers: Object.fromEntries(this.tickers),
      updatedAt: Date.now(),
    };
    try {
      writeFileSync(this.persistPath, JSON.stringify(state));
    } catch { /* ignore write errors */ }
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.persistPath, 'utf-8')) as PersistedState;
      if (raw?.tickers && typeof raw.tickers === 'object') {
        for (const [ticker, state] of Object.entries(raw.tickers)) {
          if (
            typeof state.firstSeen === 'number' &&
            typeof state.lastSeen === 'number'
          ) {
            this.tickers.set(ticker, state);
          }
        }
      }
    } catch { /* ignore corrupt file */ }
  }
}
