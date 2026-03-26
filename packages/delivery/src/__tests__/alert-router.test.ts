import { describe, it, expect, vi } from 'vitest';
import { AlertRouter } from '../alert-router.js';
import type { AlertEvent, DeliveryService } from '../types.js';
import type { Severity } from '@event-radar/shared';

function makeAlert(
  severity: Severity,
  overrides: Partial<AlertEvent> = {},
): AlertEvent {
  return {
    severity,
    confidenceBucket: 'medium',
    event: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'sec-edgar',
      type: '8-K',
      title: `Test event (${severity})`,
      body: 'Test body',
      timestamp: new Date('2024-01-15T10:00:00Z'),
    },
    ...overrides,
  };
}

function makePushEligibleAlert(
  severity: Severity,
  overrides: Partial<AlertEvent> = {},
): AlertEvent {
  return makeAlert(severity, {
    confidenceBucket: 'high',
    enrichment: {
      summary: 'Summary',
      impact: 'Impact',
      whyNow: 'Why now',
      currentSetup: 'Setup',
      historicalContext: 'Historical context',
      risks: 'Risks',
      action: '🔴 High-Quality Setup',
      tickers: [],
    },
    historicalContext: {
      matchCount: 18,
      confidence: 'high',
      avgAlphaT5: 0.03,
      avgAlphaT20: 0.08,
      winRateT20: 68,
      medianAlphaT20: 0.06,
      topMatches: [],
      patternSummary: '18 similar events',
    },
    ...overrides,
  });
}

function mockService(name: string): DeliveryService & { send: ReturnType<typeof vi.fn> } {
  return { name, send: vi.fn().mockResolvedValue(undefined) };
}

describe('AlertRouter', () => {
  it('produces a loud push decision for high-confidence alerts with strong support', async () => {
    const router = new AlertRouter({});

    const result = await router.route(makePushEligibleAlert('HIGH'));

    expect(result.decision).toEqual({
      tier: 'high',
      shouldPush: true,
      pushMode: 'loud',
      reason: 'act_now_high_confidence_strong_support',
    });
    expect(result.deliveries).toEqual([]);
  });

  it('keeps routine alerts feed-only', async () => {
    const router = new AlertRouter({});

    const result = await router.route(makeAlert('LOW', {
      confidenceBucket: 'low',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🟢 Background',
        tickers: [],
      },
    }));

    expect(result.decision).toEqual({
      tier: 'low',
      shouldPush: false,
      pushMode: 'none',
      reason: 'routine_or_low_confidence',
    });
  });

  it.each(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)(
    'routes %s alerts to discord',
    async (severity) => {
      const discord = mockService('discord');
      const router = new AlertRouter({ discord });

      const result = await router.route(makeAlert(severity));

      expect(discord.send).toHaveBeenCalledOnce();
      expect(result.deliveries).toEqual([{ channel: 'discord', ok: true }]);
    },
  );

  it('adds web push when the push policy allows it', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makePushEligibleAlert('HIGH'));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(2);
  });

  it('keeps feed-tier alerts on discord only even when web push exists', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makePushEligibleAlert('HIGH', {
      deliveryTier: 'feed',
    }));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).not.toHaveBeenCalled();
    expect(result.deliveries).toEqual([{ channel: 'discord', ok: true }]);
  });

  it('skips channels that are not configured', async () => {
    const router = new AlertRouter({});

    const result = await router.route(makeAlert('CRITICAL'));

    expect(result.deliveries).toEqual([]);
  });

  it('records delivery failures without aborting other channels', async () => {
    const discord = mockService('discord');
    discord.send.mockRejectedValue(new Error('Discord down'));
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makePushEligibleAlert('CRITICAL'));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(2);
    expect(result.deliveries.find((entry) => entry.channel === 'discord')).toMatchObject({
      channel: 'discord',
      ok: false,
    });
    expect(result.deliveries.find((entry) => entry.channel === 'webPush')).toEqual({
      channel: 'webPush',
      ok: true,
    });
  });
});
