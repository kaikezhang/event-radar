import type { ScannerHealth } from '@event-radar/shared';

const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;
const INTERVAL_STALE_MULTIPLIER = 2;

export function getScannerStaleThresholdMs(
  health: Pick<ScannerHealth, 'currentIntervalMs'>,
): number {
  if (
    typeof health.currentIntervalMs !== 'number'
    || !Number.isFinite(health.currentIntervalMs)
    || health.currentIntervalMs <= 0
  ) {
    return DEFAULT_STALE_THRESHOLD_MS;
  }

  return Math.max(
    DEFAULT_STALE_THRESHOLD_MS,
    health.currentIntervalMs * INTERVAL_STALE_MULTIPLIER,
  );
}

export interface RuntimeStatusOptions {
  /** When false, staleness alone does not downgrade to 'down'. */
  withinSchedule?: boolean;
}

export function getRuntimeScannerStatus(
  health: Pick<ScannerHealth, 'status' | 'lastScanAt' | 'errorCount' | 'currentIntervalMs'>,
  nowMs = Date.now(),
  options: RuntimeStatusOptions = {},
): ScannerHealth['status'] {
  const { withinSchedule = true } = options;

  if (health.lastScanAt) {
    const lastScanMs = new Date(health.lastScanAt).getTime();
    if (
      Number.isFinite(lastScanMs)
      && nowMs - lastScanMs > getScannerStaleThresholdMs(health)
    ) {
      // Off-schedule scanners are expected to be stale — don't mark down
      if (!withinSchedule) {
        return health.status;
      }
      return 'down';
    }
  } else if (health.errorCount > 0) {
    return 'down';
  }

  return health.status;
}
