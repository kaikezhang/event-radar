import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { AlertRouter } from '@event-radar/delivery';
import type { DeliveryService, AlertEvent } from '@event-radar/delivery';
import type { RegimeSnapshot } from '@event-radar/shared';
import { safeCloseServer } from './helpers/test-db.js';

function mockService(name: string): DeliveryService & { send: ReturnType<typeof vi.fn> } {
  return { name, send: vi.fn().mockResolvedValue(undefined) };
}

describe('EventBus → delivery integration', () => {
  let ctx: AppContext;
  let bark: ReturnType<typeof mockService>;
  let discord: ReturnType<typeof mockService>;
  let historicalEnricher: { enrich: ReturnType<typeof vi.fn> };
  let marketRegimeService: {
    getRegimeSnapshot: ReturnType<typeof vi.fn>;
    getAmplificationFactor: ReturnType<typeof vi.fn>;
  };

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
    marketRegimeService = {
      getRegimeSnapshot: vi.fn().mockResolvedValue({
        score: 0,
        label: 'neutral',
        factors: {
          vix: { value: 18, zscore: 0 },
          spyRsi: { value: 50, signal: 'neutral' },
          spy52wPosition: { pctFromHigh: -2, pctFromLow: 18 },
          maSignal: { sma20: 500, sma50: 498, signal: 'neutral' },
          yieldCurve: { spread: 0.5, inverted: false },
        },
        amplification: {
          bullish: 1,
          bearish: 1,
        },
        updatedAt: '2026-03-13T12:00:00.000Z',
      }),
      getAmplificationFactor: vi.fn().mockReturnValue(1),
    };

    ctx = buildApp({
      logger: false,
      alertRouter,
      historicalEnricher,
      marketRegimeService: marketRegimeService as never,
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

describe('EventBus → delivery regime wiring', () => {
  let ctx: AppContext;
  let discord: ReturnType<typeof mockService>;
  let marketRegimeService: {
    getRegimeSnapshot: ReturnType<typeof vi.fn>;
    getAmplificationFactor: ReturnType<typeof vi.fn>;
  };

  const snapshot: RegimeSnapshot = {
    score: 55,
    label: 'overbought',
    factors: {
      vix: { value: 14.1, zscore: -0.74 },
      spyRsi: { value: 66.4, signal: 'overbought' },
      spy52wPosition: { pctFromHigh: -1.2, pctFromLow: 24.5 },
      maSignal: { sma20: 508.4, sma50: 492.1, signal: 'golden_cross' },
      yieldCurve: { spread: 0.92, inverted: false },
    },
    amplification: {
      bullish: 0.7,
      bearish: 1.5,
    },
    updatedAt: '2026-03-13T12:00:00.000Z',
  };

  beforeAll(async () => {
    discord = mockService('discord');
    marketRegimeService = {
      getRegimeSnapshot: vi.fn().mockResolvedValue(snapshot),
      getAmplificationFactor: vi.fn().mockReturnValue(1),
    };

    ctx = buildApp({
      logger: false,
      alertRouter: new AlertRouter({ discord }),
      marketRegimeService: marketRegimeService as never,
    });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('passes regimeSnapshot through to delivery alerts', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: {
        id: '990e8400-e29b-41d4-a716-446655440009',
        source: 'sec-edgar',
        type: '8-K',
        title: '8-K: ABC Corp — 2.02 (Earnings)',
        body: 'ABC Corp reported Q4 earnings.',
        timestamp: new Date().toISOString(),
        metadata: {
          ticker: 'ABC',
          item_types: ['2.02'],
        },
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(discord.send).toHaveBeenCalledOnce();
    const alert = discord.send.mock.calls[0][0] as AlertEvent;
    expect(alert.regimeSnapshot).toEqual(snapshot);
    expect(marketRegimeService.getRegimeSnapshot).toHaveBeenCalled();
  });
});
