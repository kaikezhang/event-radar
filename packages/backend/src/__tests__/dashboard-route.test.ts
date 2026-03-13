import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { RegimeSnapshot } from '@event-radar/shared';
import { buildApp } from '../app.js';
import type { Database } from '../db/connection.js';
import { deliveriesSentTotal, resetMetrics } from '../metrics.js';
import { createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';
import type { PGlite } from '@electric-sql/pglite';

describe('GET /api/v1/dashboard', () => {
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
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await safeClose(client);
  });

  it('returns the full regime snapshot and delivery control metadata', async () => {
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

    const ctx = buildApp({
      logger: false,
      db,
      killSwitch: killSwitch as never,
      marketRegimeService: {
        getRegimeSnapshot: vi.fn().mockResolvedValue(snapshot),
        getAmplificationFactor: vi.fn(),
      } as never,
    });
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
      delivery_control: {
        enabled: true,
        last_operation_at: '2026-03-13T11:55:00.000Z',
        operator: 'api_key',
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
    await safeCloseServer(ctx.server);
  });
});
