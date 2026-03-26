import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { AlertRouter } from '@event-radar/delivery';
import type { DeliveryService, AlertEvent } from '@event-radar/delivery';
import { safeCloseServer } from './helpers/test-db.js';

function mockService(name: string): DeliveryService & { send: ReturnType<typeof vi.fn> } {
  return { name, send: vi.fn().mockResolvedValue(undefined) };
}

describe('EventBus → delivery integration', () => {
  let ctx: AppContext;
  let bark: ReturnType<typeof mockService>;
  let discord: ReturnType<typeof mockService>;
  let historicalEnricher: { enrich: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    bark = mockService('bark');
    discord = mockService('discord');
    const alertRouter = new AlertRouter({ bark, discord });

    historicalEnricher = {
      enrich: vi.fn().mockResolvedValue({
        matchCount: 12,
        confidence: 'medium',
        avgAlphaT5: 0.02,
        avgAlphaT20: 0.08,
        winRateT20: 63,
        medianAlphaT20: 0.07,
        bestCase: null,
        worstCase: null,
        topMatches: [],
        patternSummary:
          'Technology earnings beat in bull market: +8.0% avg alpha T+20, 63% win rate (12 cases)',
      }),
    };

    ctx = buildApp({
      logger: false,
      alertRouter,
      historicalEnricher,
    });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  const criticalEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K: XYZ Corp — 1.03 (Bankruptcy)',
    body: 'XYZ Corp has filed for Chapter 11.',
    url: 'https://www.sec.gov/filing/xyz',
    timestamp: new Date().toISOString(),
    metadata: {
      ticker: 'XYZ',
      item_types: ['1.03'],
    },
  };

  const mediumEvent = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K: ABC Corp — 2.02 (Earnings)',
    body: 'ABC Corp reported Q4 earnings.',
    timestamp: new Date().toISOString(),
    metadata: {
      ticker: 'ABC',
      item_types: ['2.02'],
    },
  };

  it('should route CRITICAL event to both bark and discord on ingest', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: criticalEvent,
    });

    // Allow async subscriber to run
    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = bark.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.ticker).toBe('XYZ');
  });

  it('should route MEDIUM event to discord only', async () => {
    bark.send.mockClear();
    discord.send.mockClear();
    historicalEnricher.enrich.mockClear();

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: mediumEvent,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();

    const alert = discord.send.mock.calls[0][0] as AlertEvent;
    expect(alert.severity).toBe('MEDIUM');
    expect(alert.ticker).toBe('ABC');
    expect(alert.historicalContext?.matchCount).toBe(12);
    expect(historicalEnricher.enrich).toHaveBeenCalledOnce();
  });

  it('should not call the historical enricher when alert filter blocks delivery', async () => {
    bark.send.mockClear();
    discord.send.mockClear();
    historicalEnricher.enrich.mockClear();

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: {
        id: '880e8400-e29b-41d4-a716-446655440003',
        source: 'reddit',
        type: 'reddit-post',
        title: 'Low quality post about ABC',
        body: 'not much here',
        timestamp: new Date().toISOString(),
        metadata: {
          ticker: 'ABC',
          upvotes: 5,
          comments: 1,
        },
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(discord.send).not.toHaveBeenCalled();
    expect(bark.send).not.toHaveBeenCalled();
    expect(historicalEnricher.enrich).not.toHaveBeenCalled();
  });

  it('should still accept events when no delivery is configured', async () => {
    const noDeliveryCtx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({}),
    });
    await noDeliveryCtx.server.ready();

    const response = await noDeliveryCtx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: {
        ...criticalEvent,
        id: '770e8400-e29b-41d4-a716-446655440002',
      },
    });

    expect(response.statusCode).toBe(201);
    await safeCloseServer(noDeliveryCtx.server);
  });
});
