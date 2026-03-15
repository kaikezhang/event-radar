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
const BACKOFF_THRESHOLD = 5;
const TIMEOUT_BACKOFF_THRESHOLD = 3;
const MAX_BACKOFF_MS = 1_800_000; // 30 minutes

function isTimeoutError(error: Error): boolean {
  return error.name === 'AbortError';
}

export abstract class BaseScanner implements Scanner {
  readonly name: string;
  readonly source: string;
  readonly pollIntervalMs: number;

  protected readonly eventBus: EventBus;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private _lastScanAt: Date | null = null;
  private _errorCount = 0;
  private _consecutiveErrors = 0;
  private _consecutiveNonTimeoutErrors = 0;
  private _timeoutErrors = 0;
  private _running = false;
  private _inBackoff = false;

  constructor(options: BaseScannerOptions) {
    this.name = options.name;
    this.source = options.source;
    this.pollIntervalMs = options.pollIntervalMs;
    this.eventBus = options.eventBus;
  }

  protected abstract poll(): Promise<Result<RawEvent[], Error>>;

  private get currentIntervalMs(): number {
    if (this._timeoutErrors >= TIMEOUT_BACKOFF_THRESHOLD) {
      const doublings = this._timeoutErrors - TIMEOUT_BACKOFF_THRESHOLD + 1;
      const backoff = this.pollIntervalMs * Math.pow(2, doublings);
      return Math.min(backoff, MAX_BACKOFF_MS);
    }

    if (this._consecutiveNonTimeoutErrors < BACKOFF_THRESHOLD) {
      return this.pollIntervalMs;
    }

    const doublings =
      this._consecutiveNonTimeoutErrors - BACKOFF_THRESHOLD + 1;
    const backoff = this.pollIntervalMs * Math.pow(2, doublings);
    return Math.min(backoff, MAX_BACKOFF_MS);
  }

  private scheduleNext(): void {
    if (!this._running) return;
    this.timer = setTimeout(() => void this.tick(), this.currentIntervalMs);
  }

  private async tick(): Promise<void> {
    await this.scan();
    this.scheduleNext();
  }

  async scan(): Promise<Result<RawEvent[], Error>> {
    try {
      const result = await this.poll();
      this._lastScanAt = new Date();

      if (result.ok) {
        this.handleSuccess();

        for (const event of result.value) {
          await this.eventBus.publish(event);
        }
      } else {
        this.handleFailure(result.error);
      }

      return result;
    } catch (e) {
      this._lastScanAt = new Date();
      const error = e instanceof Error ? e : new Error(String(e));
      this.handleFailure(error);
      return err(error);
    }
  }

  private handleSuccess(): void {
    if (this._inBackoff) {
      console.log(`[${this.name}] Backoff reset after successful poll`);
    }
    this._errorCount = 0;
    this._consecutiveErrors = 0;
    this._consecutiveNonTimeoutErrors = 0;
    this._timeoutErrors = 0;
    this._inBackoff = false;
  }

  private handleFailure(error: Error): void {
    this._errorCount++;
    this._consecutiveErrors++;

    if (isTimeoutError(error)) {
      this._timeoutErrors++;
      this._consecutiveNonTimeoutErrors = 0;
      const timeoutMessage = error.message.replace(/^Request/, 'request');
      console.warn(`[${this.name}] ${timeoutMessage}`);
    } else {
      this._timeoutErrors = 0;
      this._consecutiveNonTimeoutErrors++;
      console.warn(`[${this.name}] network error: ${error.message}`);
    }

    this.checkBackoff();
  }

  private checkBackoff(): void {
    const enteringTimeoutBackoff =
      this._timeoutErrors >= TIMEOUT_BACKOFF_THRESHOLD;
    const enteringErrorBackoff =
      this._consecutiveNonTimeoutErrors >= BACKOFF_THRESHOLD;

    if ((enteringTimeoutBackoff || enteringErrorBackoff) && !this._inBackoff) {
      this._inBackoff = true;
      const description = enteringTimeoutBackoff
        ? `${this._timeoutErrors} consecutive timeouts`
        : `${this._consecutiveNonTimeoutErrors} consecutive errors`;
      console.log(
        `[${this.name}] Entering backoff: ${description}, next poll in ${this.currentIntervalMs}ms`,
      );
    }
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    void this.tick();
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this.timer) {
      clearTimeout(this.timer);
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
      consecutiveErrors: this._consecutiveErrors,
      currentIntervalMs: this.currentIntervalMs,
      inBackoff: this._inBackoff,
    };
  }
}
