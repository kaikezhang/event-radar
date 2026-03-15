import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { RegimeSnapshot, ScannerHealth } from '@event-radar/shared';
import { buildApp } from '../app.js';
import type { Database } from '../db/connection.js';
import { deliveriesSentTotal, resetMetrics } from '../metrics.js';
import { registerDashboardRoutes } from '../routes/dashboard.js';
import { createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';
import type { PGlite } from '@electric-sql/pglite';

describe('GET /api/v1/dashboard', () => {
  const TEST_API_KEY = 'dashboard-test-key';
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  afterEach(async () => {
    resetMetrics();
    await db.execute(sql`DELETE FROM pipeline_audit`);
    await db.execute(sql`DELETE FROM events`);
    await db.execute(sql`DELETE FROM delivery_kill_switch`);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await safeClose(client);
  });

  async function seedDashboardDeliveryData() {
    await db.execute(sql`
      INSERT INTO events (id, source, title, summary, metadata, source_urls, created_at, received_at)
      VALUES (
        '00000000-0000-0000-0000-000000000101',
        'sec-edgar',
        'Delivery test event',
        'Body',
        '{"ticker":"SPY"}'::jsonb,
        '["https://example.com"]'::jsonb,
        '2026-03-13T11:00:00.000Z',
        '2026-03-13T11:00:00.000Z'
      )
    `);
    await db.execute(sql`
      INSERT INTO pipeline_audit (
        event_id, source, title, severity, ticker, outcome, stopped_at, delivery_channels, created_at
      )
      VALUES (
        '00000000-0000-0000-0000-000000000101',
        'sec-edgar',
        'Delivery test event',
        'HIGH',
        'SPY',
        'delivered',
        'delivered',
        '[{"channel":"discord","ok":true},{"channel":"telegram","ok":true}]'::jsonb,
        '2026-03-13T11:58:00.000Z'
      )
    `);

    deliveriesSentTotal.inc({ channel: 'discord', status: 'success' });
    deliveriesSentTotal.inc({ channel: 'discord', status: 'success' });
    deliveriesSentTotal.inc({ channel: 'discord', status: 'failure' });
    deliveriesSentTotal.inc({ channel: 'telegram', status: 'success' });
  }

  function buildDashboardContext(snapshot: RegimeSnapshot) {
    const killSwitch = {
      isActive: vi.fn().mockResolvedValue(true),
      activate: vi.fn(),
      deactivate: vi.fn(),
      getStatus: vi.fn().mockResolvedValue({
        enabled: true,
        activatedAt: '2026-03-13T11:55:00.000Z',
        reason: 'Manual pause',
        updatedAt: '2026-03-13T11:55:00.000Z',
        updatedBy: 'api_key',
      }),
    };

    return buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      db,
      killSwitch: killSwitch as never,
      marketRegimeService: {
        getRegimeSnapshot: vi.fn().mockResolvedValue(snapshot),
        getAmplificationFactor: vi.fn(),
      } as never,
    });
  }

  it('omits delivery control metadata without a valid api key', async () => {
    const snapshot: RegimeSnapshot = {
      score: 72,
      label: 'overbought',
      spy: 604.8,
      factors: {
        vix: { value: 13.2, zscore: -0.85 },
        spyRsi: { value: 68.4, signal: 'overbought' },
        spy52wPosition: { pctFromHigh: -1.1, pctFromLow: 23.7 },
        maSignal: { sma20: 604.2, sma50: 592.5, signal: 'golden_cross' },
        yieldCurve: { spread: 1.1, inverted: false },
      },
      amplification: {
        bullish: 0.7,
        bearish: 1.5,
      },
      updatedAt: '2026-03-13T12:00:00.000Z',
    };
    await seedDashboardDeliveryData();

    const ctx = buildDashboardContext(snapshot);
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      regime: {
        score: 72,
        label: 'overbought',
        spy: 604.8,
        market_regime: 'bull',
        factors: {
          vix: { value: 13.2, zscore: -0.85 },
          spyRsi: { value: 68.4, signal: 'overbought' },
        },
      },
      delivery: {
        discord: {
          sent: 2,
          errors: 1,
          last_success_at: '2026-03-13T11:58:00.000Z',
        },
        telegram: {
          sent: 1,
          errors: 0,
          last_success_at: '2026-03-13T11:58:00.000Z',
        },
      },
    });
    expect(response.json()).not.toHaveProperty('delivery_control');
    await safeCloseServer(ctx.server);
  });

  it('returns delivery control metadata when the dashboard request has a valid api key', async () => {
    const snapshot: RegimeSnapshot = {
      score: 72,
      label: 'overbought',
      spy: 604.8,
      factors: {
        vix: { value: 13.2, zscore: -0.85 },
        spyRsi: { value: 68.4, signal: 'overbought' },
        spy52wPosition: { pctFromHigh: -1.1, pctFromLow: 23.7 },
        maSignal: { sma20: 604.2, sma50: 592.5, signal: 'golden_cross' },
        yieldCurve: { spread: 1.1, inverted: false },
      },
      amplification: {
        bullish: 0.7,
        bearish: 1.5,
      },
      updatedAt: '2026-03-13T12:00:00.000Z',
    };
    await seedDashboardDeliveryData();

    const ctx = buildDashboardContext(snapshot);
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      delivery_control: {
        enabled: true,
        last_operation_at: '2026-03-13T11:55:00.000Z',
        operator: 'api_key',
      },
    });
    await safeCloseServer(ctx.server);
  });

  async function requestDashboardWithHealth(healthList: ScannerHealth[]) {
    const server = Fastify({ logger: false });
    registerDashboardRoutes(server, {
      apiKey: TEST_API_KEY,
      scannerRegistry: {
        healthAll: () => healthList,
      } as never,
      startTime: Date.now() - 3_600_000,
      version: '1.0.0',
      marketRegimeService: {
        getRegimeSnapshot: vi.fn().mockResolvedValue(null),
      } as never,
    });
    await server.ready();

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard',
      });

      expect(response.statusCode).toBe(200);
      return response.json();
    } finally {
      await safeCloseServer(server);
    }
  }

  it('keeps low-frequency scanners healthy when their last scan is within an interval-derived threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestDashboardWithHealth([
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

    expect(body.scanners).toMatchObject({
      total: 1,
      healthy: 1,
      down: 0,
      details: [
        {
          name: 'fedwatch',
          status: 'healthy',
        },
      ],
    });
    expect(body.alerts).not.toContainEqual(
      expect.objectContaining({ message: 'fedwatch scanner is DOWN' }),
    );
  });

  it('marks scanners down once they exceed the interval-derived stale threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestDashboardWithHealth([
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

    expect(body.scanners.details).toContainEqual(
      expect.objectContaining({
        name: 'fedwatch',
        status: 'down',
      }),
    );
    expect(body.alerts).toContainEqual(
      expect.objectContaining({ message: 'fedwatch scanner is DOWN' }),
    );
  });

  it('falls back to a 5 minute stale threshold when the scanner interval is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestDashboardWithHealth([
      {
        scanner: 'reddit',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:54:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        inBackoff: false,
      },
    ]);

    expect(body.scanners.details).toContainEqual(
      expect.objectContaining({
        name: 'reddit',
        status: 'down',
      }),
    );
  });
});
