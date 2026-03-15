import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { ScannerHealth } from '@event-radar/shared';
import { registerScannerRoutes } from '../routes/scanners.js';
import { safeCloseServer } from './helpers/test-db.js';

describe('GET /api/scanners/status', () => {
  async function requestScannerStatus(healthList: ScannerHealth[]) {
    const server = Fastify({ logger: false });
    registerScannerRoutes(server, {
      healthAll: () => healthList,
    } as never);
    await server.ready();

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/scanners/status',
      });

      expect(response.statusCode).toBe(200);
      return response.json();
    } finally {
      await safeCloseServer(server);
    }
  }

  it('keeps low-frequency scanners healthy when they are within their interval-derived threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestScannerStatus([
      {
        scanner: 'fedwatch',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:40:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 15 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toEqual([
      {
        name: 'fedwatch',
        status: 'healthy',
        lastSuccessAt: '2026-03-15T11:40:00.000Z',
        errorCount: 0,
        message: undefined,
        alert: false,
      },
    ]);
    expect(body.summary).toMatchObject({
      healthy: 1,
      down: 0,
      alert: false,
    });
  });

  it('marks scanners down once they exceed the interval-derived threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestScannerStatus([
      {
        scanner: 'fedwatch',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:29:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 15 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toEqual([
      {
        name: 'fedwatch',
        status: 'down',
        lastSuccessAt: '2026-03-15T11:29:00.000Z',
        errorCount: 0,
        message: undefined,
        alert: true,
      },
    ]);
    expect(body.summary).toMatchObject({
      healthy: 0,
      down: 1,
      alert: true,
    });
  });

  it('preserves degraded status when the scanner is recent but has runtime errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestScannerStatus([
      {
        scanner: 'breaking-news',
        status: 'degraded',
        lastScanAt: new Date('2026-03-15T11:58:00.000Z'),
        errorCount: 1,
        consecutiveErrors: 1,
        currentIntervalMs: 60_000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toEqual([
      {
        name: 'breaking-news',
        status: 'degraded',
        lastSuccessAt: '2026-03-15T11:58:00.000Z',
        errorCount: 1,
        message: undefined,
        alert: false,
      },
    ]);
    expect(body.summary).toMatchObject({
      healthy: 0,
      degraded: 1,
      down: 0,
    });
  });

  it('falls back to a 5 minute stale threshold when interval metadata is missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestScannerStatus([
      {
        scanner: 'reddit',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:54:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        inBackoff: false,
      },
    ]);

    expect(body.scanners[0]).toMatchObject({
      name: 'reddit',
      status: 'down',
      alert: true,
    });
  });
});
