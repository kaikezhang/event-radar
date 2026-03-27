import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { ScannerHealth } from '@event-radar/shared';
import { buildApp } from '../app.js';
import { resetMetrics } from '../metrics.js';
import {
  registerAiObservabilityRoutes,
  isWithinSchedule,
  normalizeObservabilityScannerName,
  getSourceNamesForScanner,
} from '../routes/ai-observability.js';
import {
  getRuntimeScannerStatus,
} from '../utils/scanner-runtime-status.js';
import { createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';

const TEST_API_KEY = 'test-key-123';

describe('AI Observability — /api/v1/ai/pulse', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    const app = buildApp({ apiKey: TEST_API_KEY });
    server = app.server;
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns 401 without API key', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/pulse',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong API key', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/pulse',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid window parameter', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/pulse?window=99h',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Invalid window');
  });

  it('returns 503 when database is not available', async () => {
    // buildApp without db → no DB
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/pulse',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(res.statusCode).toBe(503);
  });

  it('accepts valid window parameters', async () => {
    // Without DB, it returns 503, but we can verify the window validation passes
    for (const w of ['5m', '15m', '30m', '1h', '6h', '24h']) {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/ai/pulse?window=${w}`,
        headers: { 'x-api-key': TEST_API_KEY },
      });
      // Should be 503 (no DB) not 400 (invalid window)
      expect(res.statusCode).toBe(503);
    }
  });
});

// ---- Helper unit tests ----

describe('normalizeObservabilityScannerName', () => {
  it('maps known aliases to canonical names', () => {
    expect(normalizeObservabilityScannerName('pr-newswire')).toBe('newswire');
    expect(normalizeObservabilityScannerName('businesswire')).toBe('newswire');
    expect(normalizeObservabilityScannerName('globenewswire')).toBe('newswire');
    expect(normalizeObservabilityScannerName('x')).toBe('x-elonmusk');
    expect(normalizeObservabilityScannerName('twitter')).toBe('x-elonmusk');
    expect(normalizeObservabilityScannerName('company-ir')).toBe('ir-monitor');
    expect(normalizeObservabilityScannerName('doj')).toBe('doj-antitrust');
  });

  it('returns the name unchanged when there is no alias', () => {
    expect(normalizeObservabilityScannerName('stocktwits')).toBe('stocktwits');
    expect(normalizeObservabilityScannerName('trading-halt')).toBe('trading-halt');
  });

  it('trims and lowercases input', () => {
    expect(normalizeObservabilityScannerName('  PR-Newswire  ')).toBe('newswire');
    expect(normalizeObservabilityScannerName('X')).toBe('x-elonmusk');
  });
});

describe('getSourceNamesForScanner', () => {
  it('returns all aliases plus the canonical name for newswire', () => {
    const sources = getSourceNamesForScanner('newswire');
    expect(sources).toContain('newswire');
    expect(sources).toContain('pr-newswire');
    expect(sources).toContain('businesswire');
    expect(sources).toContain('globenewswire');
  });

  it('returns aliases for x-elonmusk', () => {
    const sources = getSourceNamesForScanner('x-elonmusk');
    expect(sources).toContain('x-elonmusk');
    expect(sources).toContain('x');
    expect(sources).toContain('twitter');
  });

  it('returns just the name when no aliases exist', () => {
    const sources = getSourceNamesForScanner('stocktwits');
    expect(sources).toEqual(['stocktwits']);
  });
});

describe('getRuntimeScannerStatus — schedule-aware', () => {
  it('returns down when stale and within schedule', () => {
    const nowMs = new Date('2026-03-16T14:00:00Z').getTime(); // Monday market hours
    const status = getRuntimeScannerStatus(
      {
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T20:00:00Z'), // Friday — very stale
        errorCount: 0,
        currentIntervalMs: 5 * 60 * 1000,
      },
      nowMs,
      { withinSchedule: true },
    );
    expect(status).toBe('down');
  });

  it('returns original status when stale but outside schedule', () => {
    const nowMs = new Date('2026-03-15T18:00:00Z').getTime(); // Sunday
    const status = getRuntimeScannerStatus(
      {
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T20:00:00Z'), // Friday
        errorCount: 0,
        currentIntervalMs: 5 * 60 * 1000,
      },
      nowMs,
      { withinSchedule: false },
    );
    expect(status).toBe('healthy');
  });

  it('returns down when explicitly reported down regardless of schedule', () => {
    const nowMs = new Date('2026-03-15T18:00:00Z').getTime();
    const status = getRuntimeScannerStatus(
      {
        status: 'down',
        lastScanAt: new Date('2026-03-15T17:58:00Z'), // recent, not stale
        errorCount: 3,
        currentIntervalMs: 5 * 60 * 1000,
      },
      nowMs,
      { withinSchedule: false },
    );
    // Not stale, so returns health.status which is 'down'
    expect(status).toBe('down');
  });

  it('returns down when no lastScanAt and errors > 0 even if outside schedule', () => {
    const nowMs = Date.now();
    const status = getRuntimeScannerStatus(
      {
        status: 'healthy',
        lastScanAt: null,
        errorCount: 1,
        currentIntervalMs: 5 * 60 * 1000,
      },
      nowMs,
      { withinSchedule: false },
    );
    expect(status).toBe('down');
  });

  it('defaults withinSchedule to true for backwards compat', () => {
    const nowMs = new Date('2026-03-15T18:00:00Z').getTime();
    const status = getRuntimeScannerStatus(
      {
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T20:00:00Z'),
        errorCount: 0,
        currentIntervalMs: 5 * 60 * 1000,
      },
      nowMs,
    );
    expect(status).toBe('down');
  });
});

describe('AI Observability runtime and alias handling', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterEach(async () => {
    resetMetrics();
    await db.execute(sql`DELETE FROM pipeline_audit`);
    await db.execute(sql`DELETE FROM events`);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await safeClose(client);
  });

  async function seedAuditRow(
    source: string,
    createdAt: string,
    overrides: Partial<{
      outcome: string;
      stopped_at: string;
      severity: string;
      ticker: string;
      confidence: number;
      reason: string;
      reason_category: string;
      historical_match: boolean;
    }> = {},
  ) {
    const {
      outcome = 'delivered',
      stopped_at = 'delivery',
      severity = null,
      ticker = null,
      confidence = null,
      reason = null,
      reason_category = null,
      historical_match = null,
    } = overrides;
    await db.execute(sql`
      INSERT INTO pipeline_audit (
        event_id, source, title, outcome, stopped_at, severity, ticker,
        confidence, reason, reason_category, historical_match, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${source}, ${`${source} event`},
        ${outcome}, ${stopped_at}, ${severity}, ${ticker},
        ${confidence}, ${reason}, ${reason_category}, ${historical_match},
        ${createdAt}
      )
    `);
  }

  async function seedStoredEvent(
    source: string,
    createdAt: string,
    receivedAt: string,
  ) {
    await db.execute(sql`
      INSERT INTO events (
        id,
        source,
        source_event_id,
        title,
        metadata,
        created_at,
        received_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${source},
        ${crypto.randomUUID()},
        ${`${source} stored event`},
        ${JSON.stringify({ publication_date: receivedAt })}::jsonb,
        ${createdAt},
        ${receivedAt}
      )
    `);
  }

  function buildServer(healthList: ScannerHealth[]) {
    const server = Fastify({ logger: false });
    registerAiObservabilityRoutes(server, {
      apiKey: TEST_API_KEY,
      db,
      scannerRegistry: {
        healthAll: () => healthList,
      } as never,
      startTime: Date.now() - 12 * 3_600_000,
    });
    return server;
  }

  async function requestPulse(healthList: ScannerHealth[]) {
    const server = buildServer(healthList);
    await server.ready();

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/ai/pulse',
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      return response.json();
    } finally {
      await safeCloseServer(server);
    }
  }

  it('groups newswire aliases under the runtime scanner entry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    await seedAuditRow('pr-newswire', '2026-03-15T11:50:00.000Z');
    await seedAuditRow('businesswire', '2026-03-15T11:55:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'newswire',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toContainEqual(
      expect.objectContaining({
        name: 'newswire',
        eventsInWindow: 2,
        status: 'active',
        activityStatus: 'active',
        runtimeStatus: 'healthy',
        sources: ['businesswire', 'pr-newswire'],
      }),
    );
    expect(body.scanners.map((scanner: { name: string }) => scanner.name)).not.toContain('pr-newswire');
    expect(body.scanners.map((scanner: { name: string }) => scanner.name)).not.toContain('businesswire');
    expect(body.health.alerts).not.toContainEqual(
      expect.objectContaining({ code: 'scanner_silent', scanner: 'newswire' }),
    );
  });

  it('keeps healthy registered scanners silent rather than down when they have no source activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestPulse([
      {
        scanner: 'fedwatch',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:45:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 15 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toContainEqual(
      expect.objectContaining({
        name: 'fedwatch',
        eventsInWindow: 0,
        lastSeenAt: null,
        status: 'silent',
        activityStatus: 'silent',
        runtimeStatus: 'healthy',
      }),
    );
  });

  it('exposes runtime health separately when a quiet scanner is actually down', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const body = await requestPulse([
      {
        scanner: 'fedwatch',
        status: 'down',
        lastScanAt: new Date('2026-03-15T11:15:00.000Z'),
        errorCount: 3,
        consecutiveErrors: 3,
        currentIntervalMs: 15 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toContainEqual(
      expect.objectContaining({
        name: 'fedwatch',
        eventsInWindow: 0,
        status: 'down',
        activityStatus: 'silent',
        runtimeStatus: 'down',
        runtimeLastScanAt: '2026-03-15T11:15:00.000Z',
      }),
    );
  });

  it('groups x alias activity under x-elonmusk for observability', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    await seedAuditRow('x', '2026-03-15T11:50:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'x-elonmusk',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:58:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 2 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toContainEqual(
      expect.objectContaining({
        name: 'x-elonmusk',
        eventsInWindow: 1,
        status: 'active',
        activityStatus: 'active',
        runtimeStatus: 'healthy',
        sources: ['x'],
      }),
    );
    expect(body.scanners.map((scanner: { name: string }) => scanner.name)).not.toContain('x');
  });

  it('treats future-dated stored federal-register events as active based on row creation time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    await seedStoredEvent(
      'federal-register',
      '2026-03-15T11:40:00.000Z',
      '2026-03-16T00:00:00.000Z',
    );

    const body = await requestPulse([
      {
        scanner: 'federal-register',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T11:58:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 15 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    expect(body.scanners).toContainEqual(
      expect.objectContaining({
        name: 'federal-register',
        eventsInWindow: 1,
        lastSeenAt: '2026-03-15T11:40:00.000Z',
        status: 'active',
        activityStatus: 'active',
        runtimeStatus: 'healthy',
        sources: ['federal-register'],
      }),
    );
    expect(body.health.alerts).not.toContainEqual(
      expect.objectContaining({ code: 'scanner_silent', scanner: 'federal-register' }),
    );
  });

  // ---- Schedule-aware runtime stale handling ----

  it('does NOT mark off-schedule scanners as down due to staleness', async () => {
    vi.useFakeTimers();
    // Sunday March 15 2026 2pm ET = 18:00 UTC
    vi.setSystemTime(new Date('2026-03-15T18:00:00.000Z'));

    await seedAuditRow('stocktwits', '2026-03-15T17:50:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'stocktwits',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T17:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
      {
        scanner: 'trading-halt',
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T20:00:00.000Z'), // Friday close — very stale
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    const tradingHalt = body.scanners.find(
      (s: { name: string }) => s.name === 'trading-halt',
    );
    // runtimeStatus should NOT be 'down' — it's outside schedule
    expect(tradingHalt.runtimeStatus).toBe('healthy');
    expect(tradingHalt.withinSchedule).toBe(false);
    // status should not be forced to 'down'
    expect(tradingHalt.status).not.toBe('down');

    // No scanner_runtime_down alert for trading-halt
    expect(body.health.alerts).not.toContainEqual(
      expect.objectContaining({ code: 'scanner_runtime_down', scanner: 'trading-halt' }),
    );
    expect(body.anomalies).not.toContainEqual(
      expect.objectContaining({ type: 'scanner_runtime_down', scanner: 'trading-halt' }),
    );
  });

  it('marks stale in-schedule scanners as down normally', async () => {
    vi.useFakeTimers();
    // Monday March 16 2026, 10am ET = 14:00 UTC
    vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

    await seedAuditRow('stocktwits', '2026-03-16T13:50:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'stocktwits',
        status: 'healthy',
        lastScanAt: new Date('2026-03-16T13:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
      {
        scanner: 'trading-halt',
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T20:00:00.000Z'), // Friday — stale during Monday market hours
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    const tradingHalt = body.scanners.find(
      (s: { name: string }) => s.name === 'trading-halt',
    );
    expect(tradingHalt.runtimeStatus).toBe('down');
    expect(tradingHalt.withinSchedule).toBe(true);

    expect(body.anomalies).toContainEqual(
      expect.objectContaining({ type: 'scanner_runtime_down', scanner: 'trading-halt' }),
    );
  });

  // ---- /api/v1/ai/scanner/:name alias normalization ----

  describe('/api/v1/ai/scanner/:name', () => {
    it('returns 401 without API key', async () => {
      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/scanner/newswire',
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await safeCloseServer(server);
      }
    });

    it('normalizes alias names so pr-newswire returns newswire data', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

      await seedAuditRow('pr-newswire', '2026-03-16T13:00:00.000Z', { ticker: 'AAPL' });
      await seedAuditRow('businesswire', '2026-03-16T13:30:00.000Z', { ticker: 'MSFT' });

      const server = buildServer([]);
      await server.ready();
      try {
        // Query via alias 'pr-newswire' — should normalize to 'newswire'
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/scanner/pr-newswire?days=1',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.scanner).toBe('newswire');
        expect(body.stats.totalEvents).toBe(2);
      } finally {
        await safeCloseServer(server);
      }
    });

    it('returns same results when queried by canonical name', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

      await seedAuditRow('pr-newswire', '2026-03-16T13:00:00.000Z');
      await seedAuditRow('businesswire', '2026-03-16T13:30:00.000Z');
      await seedAuditRow('globenewswire', '2026-03-16T13:45:00.000Z');

      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/scanner/newswire?days=1',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.scanner).toBe('newswire');
        expect(body.stats.totalEvents).toBe(3);
      } finally {
        await safeCloseServer(server);
      }
    });

    it('normalizes x to x-elonmusk', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

      await seedAuditRow('x', '2026-03-16T13:00:00.000Z');

      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/scanner/x?days=1',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.scanner).toBe('x-elonmusk');
        expect(body.stats.totalEvents).toBe(1);
      } finally {
        await safeCloseServer(server);
      }
    });

    it('returns empty stats for a scanner with no data', async () => {
      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/scanner/stocktwits?days=1',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.scanner).toBe('stocktwits');
        expect(body.stats.totalEvents).toBe(0);
        expect(body.timeline).toEqual([]);
        expect(body.topTickers).toEqual([]);
      } finally {
        await safeCloseServer(server);
      }
    });
  });

  // ---- /api/v1/ai/daily-report ----

  describe('/api/v1/ai/daily-report', () => {
    it('returns 401 without API key', async () => {
      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/daily-report',
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await safeCloseServer(server);
      }
    });

    it('returns 400 for invalid date format', async () => {
      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/daily-report?date=not-a-date',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toContain('Invalid date');
      } finally {
        await safeCloseServer(server);
      }
    });

    it('returns report structure for a valid date', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T20:00:00.000Z'));

      await seedAuditRow('stocktwits', '2026-03-16T13:00:00.000Z', {
        outcome: 'delivered',
        severity: 'HIGH',
        ticker: 'AAPL',
      });
      await seedAuditRow('stocktwits', '2026-03-16T14:00:00.000Z', {
        outcome: 'filtered',
        stopped_at: 'llm_judge',
        severity: 'LOW',
        confidence: 0.3,
        reason: 'low relevance',
        reason_category: 'low_relevance',
      });

      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/daily-report?date=2026-03-16',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.date).toBe('2026-03-16');
        expect(body.summary).toBeDefined();
        expect(body.summary.eventsTotal).toBe(2);
        expect(body.summary.delivered).toBe(1);
        expect(body.scannerBreakdown).toBeDefined();
        expect(Array.isArray(body.scannerBreakdown)).toBe(true);
        expect(body.judgeAnalysis).toBeDefined();
      } finally {
        await safeCloseServer(server);
      }
    });

    it('defaults to current date when no date param', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T15:00:00.000Z'));

      await seedAuditRow('stocktwits', '2026-03-16T14:00:00.000Z');

      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/daily-report',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.date).toBe('2026-03-16');
        expect(body.summary.eventsTotal).toBeGreaterThanOrEqual(1);
      } finally {
        await safeCloseServer(server);
      }
    });
  });

  // ---- /api/v1/ai/trace/:eventId ----

  describe('/api/v1/ai/trace/:eventId', () => {
    it('returns 401 without API key', async () => {
      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/trace/some-event-id',
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await safeCloseServer(server);
      }
    });

    it('returns 404 for non-existent event', async () => {
      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/ai/trace/non-existent-event-id',
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toContain('not found');
      } finally {
        await safeCloseServer(server);
      }
    });

    it('returns trace data for a known event', async () => {
      const eventId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO pipeline_audit (
          event_id, source, title, outcome, stopped_at, severity, ticker,
          confidence, created_at
        ) VALUES (
          ${eventId}, 'stocktwits', 'Test trace event',
          'delivered', 'delivery', 'HIGH', 'TSLA',
          ${0.95}, '2026-03-16T14:00:00.000Z'
        )
      `);

      const server = buildServer([]);
      await server.ready();
      try {
        const res = await server.inject({
          method: 'GET',
          url: `/api/v1/ai/trace/${eventId}`,
          headers: { 'x-api-key': TEST_API_KEY },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.eventId).toBe(eventId);
        expect(body.source).toBe('stocktwits');
        expect(body.title).toBe('Test trace event');
        expect(body.outcome).toBe('delivered');
        expect(body.severity).toBe('HIGH');
        expect(body.ticker).toBe('TSLA');
        expect(body.timeline).toBeDefined();
        expect(Array.isArray(body.timeline)).toBe(true);
        // Should have at least the final outcome stage
        expect(body.timeline).toContainEqual(
          expect.objectContaining({ stage: 'delivered' }),
        );
      } finally {
        await safeCloseServer(server);
      }
    });
  });
});

// ---- isWithinSchedule unit tests ----

describe('isWithinSchedule', () => {
  // Helper: create a Date that corresponds to a specific ET time
  // Note: America/New_York is UTC-5 in winter (EST), UTC-4 in summer (EDT)
  // March 15 2026 is EDT (UTC-4), so 10am ET = 14:00 UTC

  it('returns true for always-on scanners at any time', () => {
    // Sunday 3am ET
    expect(isWithinSchedule('stocktwits', new Date('2026-03-15T07:00:00Z'))).toBe(true);
    expect(isWithinSchedule('breaking-news', new Date('2026-03-15T07:00:00Z'))).toBe(true);
    expect(isWithinSchedule('reddit', new Date('2026-03-15T07:00:00Z'))).toBe(true);
  });

  it('returns false for manual scanners at any time', () => {
    expect(isWithinSchedule('manual', new Date('2026-03-16T15:00:00Z'))).toBe(false);
    expect(isWithinSchedule('dummy', new Date('2026-03-16T15:00:00Z'))).toBe(false);
  });

  it('returns true for market-hours scanners during weekday market hours', () => {
    // Monday March 16 2026, 10am ET = 14:00 UTC (EDT)
    const mondayMarketHours = new Date('2026-03-16T14:00:00Z');
    expect(isWithinSchedule('trading-halt', mondayMarketHours)).toBe(true);
    expect(isWithinSchedule('sec-edgar', mondayMarketHours)).toBe(true);
    expect(isWithinSchedule('newswire', mondayMarketHours)).toBe(true);
  });

  it('returns false for market-hours scanners on weekends', () => {
    // Sunday March 15 2026, 10am ET = 14:00 UTC
    const sundayMarketHours = new Date('2026-03-15T14:00:00Z');
    expect(isWithinSchedule('trading-halt', sundayMarketHours)).toBe(false);
    expect(isWithinSchedule('sec-edgar', sundayMarketHours)).toBe(false);
  });

  it('returns false for market-hours scanners outside market hours on weekday', () => {
    // Monday March 16 2026, 11pm ET = 03:00 UTC March 17
    const mondayLateNight = new Date('2026-03-17T03:00:00Z');
    expect(isWithinSchedule('trading-halt', mondayLateNight)).toBe(false);
  });

  it('returns true for government scanners during weekday business hours', () => {
    // Monday March 16 2026, 10am ET = 14:00 UTC
    const mondayBusinessHours = new Date('2026-03-16T14:00:00Z');
    expect(isWithinSchedule('federal-register', mondayBusinessHours)).toBe(true);
    expect(isWithinSchedule('fda', mondayBusinessHours)).toBe(true);
  });

  it('returns false for government scanners on weekends', () => {
    // Saturday March 14 2026, 10am ET = 14:00 UTC (EST, still before DST on Mar 8... wait)
    // Actually March 8 2026 is DST start, so March 14 is EDT. 10am ET = 14:00 UTC
    const saturdayBusinessHours = new Date('2026-03-14T14:00:00Z');
    expect(isWithinSchedule('federal-register', saturdayBusinessHours)).toBe(false);
  });

  it('returns false for government scanners outside business hours on weekday', () => {
    // Monday March 16 2026, 7pm ET = 23:00 UTC (after 6pm cutoff)
    const mondayEvening = new Date('2026-03-16T23:00:00Z');
    expect(isWithinSchedule('federal-register', mondayEvening)).toBe(false);
  });

  it('returns true for unknown scanners (defaults to always)', () => {
    expect(isWithinSchedule('some-unknown-scanner', new Date('2026-03-15T07:00:00Z'))).toBe(true);
  });
});

// ---- Schedule-aware health scoring integration tests ----

describe('Schedule-aware health scoring', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterEach(async () => {
    resetMetrics();
    await db.execute(sql`DELETE FROM pipeline_audit`);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await safeClose(client);
  });

  async function seedAuditRow(source: string, createdAt: string) {
    await db.execute(sql`
      INSERT INTO pipeline_audit (
        event_id, source, title, outcome, stopped_at, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${source}, ${`${source} event`},
        'delivered', 'delivery', ${createdAt}
      )
    `);
  }

  async function requestPulse(healthList: ScannerHealth[]) {
    const server = Fastify({ logger: false });
    registerAiObservabilityRoutes(server, {
      apiKey: TEST_API_KEY,
      db,
      scannerRegistry: {
        healthAll: () => healthList,
      } as never,
      startTime: Date.now() - 12 * 3_600_000,
    });
    await server.ready();

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/ai/pulse',
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      return response.json();
    } finally {
      await safeCloseServer(server);
    }
  }

  it('weekend health score is high when only market-hours/government scanners are silent', async () => {
    vi.useFakeTimers();
    // Sunday March 15 2026, 2pm ET = 18:00 UTC (EDT)
    vi.setSystemTime(new Date('2026-03-15T18:00:00.000Z'));

    // Seed activity for always-on scanners
    await seedAuditRow('stocktwits', '2026-03-15T17:50:00.000Z');
    await seedAuditRow('reddit', '2026-03-15T17:55:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'stocktwits',
        status: 'healthy',
        lastScanAt: new Date('2026-03-15T17:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
      {
        scanner: 'trading-halt',
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T20:00:00.000Z'), // Friday close
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
      {
        scanner: 'federal-register',
        status: 'healthy',
        lastScanAt: new Date('2026-03-13T18:00:00.000Z'), // Friday close
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 15 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    // Health score should be high — silent market/government scanners are outside schedule
    expect(body.health.score).toBeGreaterThanOrEqual(80);
    expect(body.health.status).toBe('healthy');

    // Scanner silence anomalies should be info severity, not critical/warning
    const silentAlerts = body.health.alerts.filter(
      (a: { code: string }) => a.code === 'scanner_silent',
    );
    for (const alert of silentAlerts) {
      if (alert.scanner === 'trading-halt' || alert.scanner === 'federal-register') {
        expect(alert.severity).toBe('info');
        expect(alert.message).toContain('outside schedule');
      }
    }

    // No scanner_runtime_down alerts for off-schedule scanners
    expect(body.health.alerts).not.toContainEqual(
      expect.objectContaining({ code: 'scanner_runtime_down', scanner: 'trading-halt' }),
    );
    expect(body.health.alerts).not.toContainEqual(
      expect.objectContaining({ code: 'scanner_runtime_down', scanner: 'federal-register' }),
    );

    // runtimeStatus should be healthy, not down
    const tradingHalt = body.scanners.find(
      (s: { name: string }) => s.name === 'trading-halt',
    );
    expect(tradingHalt.runtimeStatus).toBe('healthy');
    const fedReg = body.scanners.find(
      (s: { name: string }) => s.name === 'federal-register',
    );
    expect(fedReg.runtimeStatus).toBe('healthy');
  });

  it('weekday market-hours health score penalizes silent market scanners', async () => {
    vi.useFakeTimers();
    // Monday March 16 2026, 10am ET = 14:00 UTC (EDT)
    vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

    // Only always-on scanner has data, market scanner is silent (no events)
    await seedAuditRow('stocktwits', '2026-03-16T13:50:00.000Z');
    // Seed a trading-halt event from 2 hours ago so lastSeenAt triggers silence alert
    await seedAuditRow('trading-halt', '2026-03-16T12:00:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'stocktwits',
        status: 'healthy',
        lastScanAt: new Date('2026-03-16T13:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
      {
        scanner: 'trading-halt',
        status: 'healthy',
        lastScanAt: new Date('2026-03-16T13:58:00.000Z'), // recent scan, but no events in window
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    // trading-halt is within schedule
    const tradingHalt = body.scanners.find(
      (s: { name: string }) => s.name === 'trading-halt',
    );
    expect(tradingHalt.schedule).toBe('market-hours');
    expect(tradingHalt.withinSchedule).toBe(true);

    expect(body.health.alerts).toContainEqual(
      expect.objectContaining({
        code: 'scanner_silent',
        scanner: 'trading-halt',
        severity: 'warning',
      }),
    );
  });

  it('manual/dummy scanners never affect health score', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

    await seedAuditRow('stocktwits', '2026-03-16T13:50:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'stocktwits',
        status: 'healthy',
        lastScanAt: new Date('2026-03-16T13:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
      {
        scanner: 'manual',
        status: 'healthy',
        lastScanAt: new Date('2026-03-10T12:00:00.000Z'), // Very old
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 60 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    const manualScanner = body.scanners.find(
      (s: { name: string }) => s.name === 'manual',
    );
    expect(manualScanner.schedule).toBe('manual');
    expect(manualScanner.withinSchedule).toBe(false);

    // No scanner_silent anomaly for manual scanner
    expect(body.anomalies).not.toContainEqual(
      expect.objectContaining({ scanner: 'manual', type: 'scanner_silent' }),
    );
  });

  it('scanners include schedule and withinSchedule fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T14:00:00.000Z'));

    await seedAuditRow('stocktwits', '2026-03-16T13:50:00.000Z');

    const body = await requestPulse([
      {
        scanner: 'stocktwits',
        status: 'healthy',
        lastScanAt: new Date('2026-03-16T13:59:00.000Z'),
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: 5 * 60 * 1000,
        inBackoff: false,
      },
    ]);

    const st = body.scanners.find((s: { name: string }) => s.name === 'stocktwits');
    expect(st.schedule).toBe('always');
    expect(st.withinSchedule).toBe(true);
  });
});
