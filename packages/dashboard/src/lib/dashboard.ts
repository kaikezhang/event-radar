import type {
  Alert,
  AuditDeliveryChannel,
  AuditEvent,
  ScannerDetail,
  ScannerHealth,
} from '../types/api.js';
import { timeAgo } from './utils.js';

export function buildScannerCards(
  dashboardScanners: ScannerDetail[],
  healthScanners?: ScannerHealth[],
): ScannerDetail[] {
  if (!healthScanners || healthScanners.length === 0) {
    return dashboardScanners;
  }

  const healthByName = new Map(healthScanners.map((scanner) => [scanner.scanner, scanner]));

  return dashboardScanners.map((scanner) => {
    const healthScanner = healthByName.get(scanner.name);
    if (!healthScanner) {
      return scanner;
    }

    return {
      name: scanner.name,
      status: healthScanner.status,
      last_scan: timeAgo(healthScanner.lastScanAt),
      error_count: healthScanner.errorCount,
      consecutive_errors: healthScanner.consecutiveErrors,
      in_backoff: healthScanner.inBackoff,
      poll_interval_ms: healthScanner.currentIntervalMs,
      message: healthScanner.message,
    };
  });
}

export function buildScannerAlerts(
  scanners: ScannerDetail[],
  options?: {
    gracePeriodActive?: boolean;
    gracePeriodRemainingSeconds?: number;
  },
): Alert[] {
  const alerts: Alert[] = [];

  for (const scanner of scanners) {
    if (scanner.status === 'down') {
      alerts.push({ level: 'error', message: `${scanner.name} scanner is DOWN` });
      continue;
    }

    if (scanner.in_backoff) {
      alerts.push({
        level: 'warn',
        message: `${scanner.name} in backoff (${scanner.consecutive_errors ?? scanner.error_count} errors)`,
      });
    }
  }

  if (options?.gracePeriodActive) {
    alerts.push({
      level: 'info',
      message: `Startup grace period (${Math.max(options.gracePeriodRemainingSeconds ?? 0, 0)}s left)`,
    });
  }

  return alerts;
}

export function normalizeSeverity(severity: string | null): string | null {
  return severity?.toLowerCase() ?? null;
}

export function formatDeliveryChannels(channels: AuditDeliveryChannel[] | null): string {
  if (!channels || channels.length === 0) {
    return '—';
  }

  return channels
    .map((channel) => `${channel.channel} (${channel.ok ? 'ok' : 'failed'})`)
    .join(', ');
}

export function buildAuditSourceOptions(
  events: AuditEvent[],
  scanners: Array<Pick<ScannerDetail, 'name'>>,
): string[] {
  const sources = new Set<string>();

  for (const scanner of scanners) {
    if (scanner.name) {
      sources.add(scanner.name);
    }
  }

  for (const event of events) {
    if (event.source) {
      sources.add(event.source);
    }
  }

  return Array.from(sources).sort((left, right) => left.localeCompare(right));
}

export function formatPollInterval(intervalMs?: number): string | null {
  if (!intervalMs || intervalMs <= 0) {
    return null;
  }

  const minutes = Math.round(intervalMs / 60_000);
  return `${minutes}m cadence`;
}
