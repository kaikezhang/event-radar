import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../../app.js';
import { AlertRouter } from '@event-radar/delivery';
import type { DeliveryService, AlertEvent } from '@event-radar/delivery';
import { resetMetrics } from '../../metrics.js';
import {
  InMemoryEventBus,
  BaseScanner,
  err,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { safeCloseServer } from '../helpers/test-db.js';

/* ── helpers ─────────────────────────────────────────────────────── */

function mockService(name: string): DeliveryService & { send: ReturnType<typeof vi.fn> } {
  return { name, send: vi.fn().mockResolvedValue(undefined) };
}

function make8KEvent(
  itemType: string,
  overrides?: Partial<RawEvent>,
): RawEvent {
  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: `8-K: TestCorp — ${itemType}`,
    body: `Filing body for item ${itemType}`,
    url: 'https://www.sec.gov/filing/test',
    timestamp: new Date(),
    metadata: { ticker: 'TEST', item_types: [itemType] },
    ...overrides,
  };
}

function makeForm4Event(
  variant: 'Purchase' | 'Sale' | 'Sale (10b5-1)',
  overrides?: Partial<RawEvent>,
): RawEvent {
  const title =
    variant === 'Sale (10b5-1)'
      ? 'Form 4 — CEO Sale under 10b5-1 plan'
      : `Form 4 — CEO ${variant} of 50,000 shares`;

  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: 'form-4',
    title,
    body: `Insider ${variant.toLowerCase()} transaction`,
    url: 'https://www.sec.gov/filing/form4',
    timestamp: new Date(),
    metadata: { ticker: 'AAPL', shares: 50000 },
    ...overrides,
  };
}

/* ── 1. Full pipeline: 8-K events ────────────────────────────────── */

describe('Integration: 8-K scanner → classify → delivery', () => {
  let ctx: AppContext;
  let bark: ReturnType<typeof mockService>;
  let discord: ReturnType<typeof mockService>;

  beforeAll(async () => {
    bark = mockService('bark');
    discord = mockService('discord');
    ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ bark, discord }),
    });
    await ctx.server.ready();
  });

  beforeEach(() => {
    bark.send.mockClear();
    discord.send.mockClear();
    resetMetrics();
    ctx.deduplicator.reset();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('8-K 1.03 (Bankruptcy/CRITICAL) → bark + discord, severity CRITICAL', async () => {
    const event = make8KEvent('1.03');

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    expect(res.statusCode).toBe(201);
    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = bark.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.ticker).toBe('TEST');
    expect(alert.event.id).toBe(event.id);
  });

  it('8-K 5.02 (Leadership change/HIGH) → bark + discord, severity HIGH', async () => {
    const event = make8KEvent('5.02');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = bark.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('HIGH');
  });

  it('8-K 2.02 (Earnings/MEDIUM) → discord only, severity MEDIUM', async () => {
    const event = make8KEvent('2.02');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = discord.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('MEDIUM');
  });

  it('8-K 7.01 (Reg FD/LOW) → discord only, severity LOW', async () => {
    const event = make8KEvent('7.01');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = discord.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('LOW');
  });
});

/* ── 2. Full pipeline: Form 4 events ────────────────────────────── */

describe('Integration: Form 4 → classify → delivery', () => {
  let ctx: AppContext;
  let bark: ReturnType<typeof mockService>;
  let discord: ReturnType<typeof mockService>;

  beforeAll(async () => {
    bark = mockService('bark');
    discord = mockService('discord');
    ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ bark, discord }),
    });
    await ctx.server.ready();
  });

  beforeEach(() => {
    bark.send.mockClear();
    discord.send.mockClear();
    resetMetrics();
    ctx.deduplicator.reset();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('Form 4 insider Purchase (HIGH) → bark + discord', async () => {
    const event = makeForm4Event('Purchase');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = bark.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('HIGH');
  });

  it('Form 4 insider Sale (MEDIUM) → discord only', async () => {
    const event = makeForm4Event('Sale');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = discord.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('MEDIUM');
  });

  it('Form 4 routine 10b5-1 Sale → MEDIUM (generic sale rule wins on severity)', async () => {
    // Both form4-insider-sale (MEDIUM) and form4-routine-10b5-1 (LOW) match.
    // Severity uses "highest wins" → MEDIUM beats LOW.
    const event = makeForm4Event('Sale (10b5-1)');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = discord.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('MEDIUM');
  });
});

/* ── 3. Metrics integration after pipeline run ───────────────────── */

describe('Integration: metrics counters after pipeline', () => {
  let ctx: AppContext;
  let bark: ReturnType<typeof mockService>;
  let discord: ReturnType<typeof mockService>;

  beforeAll(async () => {
    bark = mockService('bark');
    discord = mockService('discord');
    ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ bark, discord }),
    });
    await ctx.server.ready();
  });

  beforeEach(() => {
    bark.send.mockClear();
    discord.send.mockClear();
    resetMetrics();
    ctx.deduplicator.reset();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('events_processed_total increments after ingest', async () => {
    const event = make8KEvent('1.03');

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).toContain('events_processed_total{source="sec-edgar",event_type="8-K"} 1');
  });

  it('events_by_severity increments with correct severity', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('1.03'), // CRITICAL
    });

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('2.02'), // MEDIUM
    });

    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).toContain('events_by_severity{severity="CRITICAL"} 1');
    expect(metricsRes.body).toContain('events_by_severity{severity="MEDIUM"} 1');
  });

  it('deliveries_sent_total increments per channel after successful delivery', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('1.03'), // CRITICAL → bark + discord
    });

    await new Promise((r) => setTimeout(r, 50));

    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).toContain('deliveries_sent_total{channel="bark",status="success"} 1');
    expect(metricsRes.body).toContain('deliveries_sent_total{channel="discord",status="success"} 1');
    expect(metricsRes.body).toContain('deliveries_by_channel{channel="bark"} 1');
    expect(metricsRes.body).toContain('deliveries_by_channel{channel="discord"} 1');
  });

  it('processing_duration_seconds histogram is populated', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('8.01'),
    });

    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).toContain('processing_duration_seconds_count{operation="classify"} 1');
  });
});

/* ── 4. Error scenarios ──────────────────────────────────────────── */

describe('Integration: error scenarios', () => {
  it('delivery failure → error metrics recorded, no crash', async () => {
    const bark = mockService('bark');
    bark.send.mockRejectedValue(new Error('Bark server down'));
    const discord = mockService('discord');

    const ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ bark, discord }),
    });
    await ctx.server.ready();
    resetMetrics();

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('1.03'), // CRITICAL → tries bark (fail) + discord (ok)
    });

    expect(res.statusCode).toBe(201);
    await new Promise((r) => setTimeout(r, 50));

    // Discord still delivered
    expect(discord.send).toHaveBeenCalledOnce();

    // Metrics should show bark failure and discord success
    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).toContain('deliveries_sent_total{channel="bark",status="failure"} 1');
    expect(metricsRes.body).toContain('deliveries_sent_total{channel="discord",status="success"} 1');

    await safeCloseServer(ctx.server);
  });

  it('invalid event data → rejected with 400, not published to bus', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');

    const ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ bark, discord }),
    });
    await ctx.server.ready();
    resetMetrics();

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: {
        id: 'not-a-uuid',
        source: '',
        type: '',
        title: '',
        body: '',
        timestamp: 'invalid-date',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid RawEvent');

    await new Promise((r) => setTimeout(r, 50));

    // No delivery attempted
    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).not.toHaveBeenCalled();

    // No event metrics incremented
    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).not.toContain('events_processed_total{source=');

    await safeCloseServer(ctx.server);
  });

  it('scanner poll failure → health degrades, metrics still recorded for other events', async () => {
    const eventBus = new InMemoryEventBus();

    // Create a scanner that fails on poll
    class FailingScanner extends BaseScanner {
      constructor(bus: EventBus) {
        super({
          name: 'failing-scanner',
          source: 'test-source',
          pollIntervalMs: 60_000,
          eventBus: bus,
        });
      }

      protected async poll(): Promise<Result<RawEvent[], Error>> {
        return err(new Error('SEC EDGAR API unreachable'));
      }
    }

    const scanner = new FailingScanner(eventBus);

    // Scan should return error result, not throw
    const result = await scanner.scan();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('SEC EDGAR API unreachable');
    }

    // Health should degrade
    expect(scanner.health().status).toBe('degraded');
    expect(scanner.health().errorCount).toBe(1);

    // No events published to bus
    expect(eventBus.publishedCount).toBe(0);
  });

  it('scanner exception → caught gracefully, health degrades', async () => {
    const eventBus = new InMemoryEventBus();

    class ThrowingScanner extends BaseScanner {
      constructor(bus: EventBus) {
        super({
          name: 'throwing-scanner',
          source: 'test-source',
          pollIntervalMs: 60_000,
          eventBus: bus,
        });
      }

      protected async poll(): Promise<Result<RawEvent[], Error>> {
        throw new Error('Unexpected crash in poll');
      }
    }

    const scanner = new ThrowingScanner(eventBus);

    const result = await scanner.scan();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Unexpected crash in poll');
    }

    expect(scanner.health().status).toBe('degraded');
    expect(eventBus.publishedCount).toBe(0);

    // 3 failures → down
    await scanner.scan();
    await scanner.scan();
    expect(scanner.health().status).toBe('down');
    expect(scanner.health().errorCount).toBe(3);
  });

  it('multiple events accumulate delivery metrics correctly', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');

    const ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ bark, discord }),
    });
    await ctx.server.ready();
    resetMetrics();

    // CRITICAL → bark + discord (2 deliveries)
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('4.02'),
    });

    // MEDIUM → discord only (1 delivery)
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: make8KEvent('2.02'),
    });

    await new Promise((r) => setTimeout(r, 50));

    const metricsRes = await ctx.server.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.body).toContain('deliveries_sent_total{channel="bark",status="success"} 1');
    expect(metricsRes.body).toContain('deliveries_sent_total{channel="discord",status="success"} 2');
    expect(metricsRes.body).toContain('events_processed_total{source="sec-edgar",event_type="8-K"} 2');
    expect(metricsRes.body).toContain('events_by_source{source="sec-edgar"} 2');

    await safeCloseServer(ctx.server);
  });
});
