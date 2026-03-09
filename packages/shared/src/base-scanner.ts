import type { Scanner } from './schemas/scanner.js';
import type { ScannerHealth } from './schemas/scanner-health.js';
import type { EventBus } from './schemas/event-bus.js';
import type { RawEvent } from './schemas/raw-event.js';
import type { Result } from './schemas/result.js';
import { err } from './schemas/result.js';

export interface BaseScannerOptions {
  name: string;
  source: string;
  pollIntervalMs: number;
  eventBus: EventBus;
}

const DEGRADED_THRESHOLD = 1;
const DOWN_THRESHOLD = 3;

export abstract class BaseScanner implements Scanner {
  readonly name: string;
  readonly source: string;
  readonly pollIntervalMs: number;

  protected readonly eventBus: EventBus;

  private timer: ReturnType<typeof setInterval> | null = null;
  private _lastScanAt: Date | null = null;
  private _errorCount = 0;
  private _running = false;

  constructor(options: BaseScannerOptions) {
    this.name = options.name;
    this.source = options.source;
    this.pollIntervalMs = options.pollIntervalMs;
    this.eventBus = options.eventBus;
  }

  protected abstract poll(): Promise<Result<RawEvent[], Error>>;

  async scan(): Promise<Result<RawEvent[], Error>> {
    try {
      const result = await this.poll();

      if (result.ok) {
        this._errorCount = 0;
        this._lastScanAt = new Date();

        for (const event of result.value) {
          await this.eventBus.publish(event);
        }
      } else {
        this._errorCount++;
        this._lastScanAt = new Date();
      }

      return result;
    } catch (e) {
      this._errorCount++;
      this._lastScanAt = new Date();
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.timer = setInterval(() => void this.scan(), this.pollIntervalMs);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get running(): boolean {
    return this._running;
  }

  health(): ScannerHealth {
    let status: ScannerHealth['status'];

    if (this._errorCount >= DOWN_THRESHOLD) {
      status = 'down';
    } else if (this._errorCount >= DEGRADED_THRESHOLD) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      scanner: this.name,
      status,
      lastScanAt: this._lastScanAt,
      errorCount: this._errorCount,
    };
  }
}
