import type { RawEvent } from './raw-event.js';
import type { ScannerHealth } from './scanner-health.js';
import type { Result } from './result.js';

export interface Scanner {
  readonly name: string;
  readonly source: string;
  readonly pollIntervalMs: number;

  scan(): Promise<Result<RawEvent[], Error>>;
  health(): ScannerHealth;
}
