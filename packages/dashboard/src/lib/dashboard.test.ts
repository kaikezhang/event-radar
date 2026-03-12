import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuditDeliveryChannel,
  AuditEvent,
  ScannerDetail,
  ScannerHealth,
} from '../types/api.js';
import {
  buildAuditSourceOptions,
  buildScannerAlerts,
  buildScannerCards,
  formatDeliveryChannels,
  formatPollInterval,
  normalizeSeverity,
} from './dashboard.js';

describe('dashboard data helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T22:30:00.000Z'));
  });

  it('prefers health scanner status over dashboard summary status', () => {
    const dashboardScanners: ScannerDetail[] = [
      { name: 'whitehouse', status: 'down', last_scan: '14m ago', error_count: 0 },
    ];
    const healthScanners: ScannerHealth[] = [
      {
        scanner: 'whitehouse',
        status: 'healthy',
        lastScanAt: '2026-03-12T22:14:51.280Z',
        errorCount: 0,
        currentIntervalMs: 900000,
        inBackoff: false,
      },
    ];

    const [scanner] = buildScannerCards(dashboardScanners, healthScanners);

    expect(scanner.status).toBe('healthy');
  });

  it('keeps dashboard scanner details when health data is missing', () => {
    const dashboardScanners: ScannerDetail[] = [
      { name: 'reddit', status: 'healthy', last_scan: '11s ago', error_count: 0 },
    ];

    const [scanner] = buildScannerCards(dashboardScanners, []);

    expect(scanner).toMatchObject(dashboardScanners[0]);
  });

  it('formats last scan time from health timestamps', () => {
    const dashboardScanners: ScannerDetail[] = [
      { name: 'fedwatch', status: 'degraded', last_scan: '1m ago', error_count: 16 },
    ];
    const healthScanners: ScannerHealth[] = [
      {
        scanner: 'fedwatch',
        status: 'down',
        lastScanAt: '2026-03-12T22:25:00.000Z',
        errorCount: 16,
        consecutiveErrors: 16,
        currentIntervalMs: 1800000,
        inBackoff: true,
      },
    ];

    const [scanner] = buildScannerCards(dashboardScanners, healthScanners);

    expect(scanner.last_scan).toBe('5m ago');
  });

  it('carries poll interval and backoff details from health data', () => {
    const dashboardScanners: ScannerDetail[] = [
      { name: 'fedwatch', status: 'degraded', last_scan: '1m ago', error_count: 16 },
    ];
    const healthScanners: ScannerHealth[] = [
      {
        scanner: 'fedwatch',
        status: 'down',
        lastScanAt: '2026-03-12T22:25:00.000Z',
        errorCount: 16,
        consecutiveErrors: 16,
        currentIntervalMs: 1800000,
        inBackoff: true,
      },
    ];

    const [scanner] = buildScannerCards(dashboardScanners, healthScanners);

    expect(scanner.poll_interval_ms).toBe(1800000);
    expect(scanner.in_backoff).toBe(true);
    expect(scanner.consecutive_errors).toBe(16);
  });

  it('builds down alerts from the displayed scanner cards', () => {
    const alerts = buildScannerAlerts([
      { name: 'congress', status: 'down', last_scan: '30m ago', error_count: 10 },
    ]);

    expect(alerts).toEqual([{ level: 'error', message: 'congress scanner is DOWN' }]);
  });

  it('builds backoff alerts when a scanner is not down', () => {
    const alerts = buildScannerAlerts([
      {
        name: 'fedwatch',
        status: 'degraded',
        last_scan: '5m ago',
        error_count: 16,
        in_backoff: true,
        consecutive_errors: 16,
      },
    ]);

    expect(alerts).toEqual([{ level: 'warn', message: 'fedwatch in backoff (16 errors)' }]);
  });

  it('normalizes uppercase severity values for styling', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSeverity('MEDIUM')).toBe('medium');
  });

  it('formats null delivery channel payloads safely', () => {
    expect(formatDeliveryChannels(null)).toBe('—');
  });

  it('formats object delivery channel payloads without object leakage', () => {
    const channels: AuditDeliveryChannel[] = [
      { channel: 'discord', ok: true },
      { channel: 'telegram', ok: false },
    ];

    expect(formatDeliveryChannels(channels)).toBe('discord (ok), telegram (failed)');
  });

  it('builds source filter options from scanners and audit events', () => {
    const dashboardScanners: ScannerDetail[] = [
      { name: 'breaking-news', status: 'healthy', last_scan: '10s ago', error_count: 0 },
      { name: 'congress', status: 'down', last_scan: '30m ago', error_count: 10 },
    ];
    const events: AuditEvent[] = [
      {
        id: 1,
        event_id: 'evt-1',
        source: 'stocktwits',
        title: 'Title',
        severity: 'MEDIUM',
        ticker: 'TSLA',
        outcome: 'filtered',
        stopped_at: 'alert_filter',
        reason: null,
        reason_category: null,
        delivery_channels: null,
        historical_match: null,
        historical_confidence: null,
        duration_ms: null,
        at: '2026-03-12T22:25:00.000Z',
      },
    ];

    expect(buildAuditSourceOptions(events, dashboardScanners)).toEqual([
      'breaking-news',
      'congress',
      'stocktwits',
    ]);
  });

  it('formats poll intervals for scanner cards', () => {
    expect(formatPollInterval(60000)).toBe('1m cadence');
    expect(formatPollInterval(1800000)).toBe('30m cadence');
  });
});
