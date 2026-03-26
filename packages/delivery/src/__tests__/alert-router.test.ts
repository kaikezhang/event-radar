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

function mockService(name: string): DeliveryService & { send: ReturnType<typeof vi.fn> } {
  return { name, send: vi.fn().mockResolvedValue(undefined) };
}

describe('AlertRouter', () => {
  it('should produce a loud high-tier push decision for high-confidence ACT NOW alerts with strong support', async () => {
    const router = new AlertRouter({});

    const result = await router.route(makeAlert('HIGH', {
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
    }));

    expect(result.decision).toEqual({
      tier: 'high',
      shouldPush: true,
      pushMode: 'loud',
      reason: 'act_now_high_confidence_strong_support',
    });
    expect(result.deliveries).toEqual([]);
  });

  it('should produce a silent medium-tier push decision for WATCH alerts with meaningful support', async () => {
    const router = new AlertRouter({});

    const result = await router.route(makeAlert('MEDIUM', {
      confidenceBucket: 'medium',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🟡 Monitor',
        tickers: [],
      },
      historicalContext: {
        matchCount: 11,
        confidence: 'medium',
        avgAlphaT5: 0.01,
        avgAlphaT20: 0.04,
        winRateT20: 57,
        medianAlphaT20: 0.03,
        topMatches: [],
        patternSummary: '11 similar events',
      },
    }));

    expect(result.decision).toEqual({
      tier: 'medium',
      shouldPush: true,
      pushMode: 'silent',
      reason: 'watch_meaningful_support',
    });
  });

  it('should produce a feed-only decision for routine low-confidence alerts', async () => {
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

  it('should keep alerts feed-only when historical support is missing', async () => {
    const router = new AlertRouter({});

    const result = await router.route(makeAlert('HIGH', {
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
    }));

    expect(result.decision).toEqual({
      tier: 'low',
      shouldPush: false,
      pushMode: 'none',
      reason: 'insufficient_historical_support',
    });
  });

  it('routes CRITICAL alerts to discord only when no push channel is configured', async () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });

    const result = await router.route(makeAlert('CRITICAL'));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toEqual([{ channel: 'discord', ok: true }]);
  });

  it('routes HIGH alerts to discord and web push when the push policy allows it', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makeAlert('HIGH', {
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
    }));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(2);
  });

  it('routes MEDIUM alerts to discord and web push when the push policy allows it', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makeAlert('MEDIUM', {
      confidenceBucket: 'medium',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🟡 Monitor',
        tickers: [],
      },
      historicalContext: {
        matchCount: 11,
        confidence: 'medium',
        avgAlphaT5: 0.01,
        avgAlphaT20: 0.04,
        winRateT20: 57,
        medianAlphaT20: 0.03,
        topMatches: [],
        patternSummary: '11 similar events',
      },
    }));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(2);
  });

  it('keeps web push disabled when the push policy downgrades an alert to feed-only', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makeAlert('HIGH', {
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
    }));

    expect(result.decision).toEqual({
      tier: 'low',
      shouldPush: false,
      pushMode: 'none',
      reason: 'insufficient_historical_support',
    });
    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).not.toHaveBeenCalled();
    expect(result.deliveries).toEqual([{ channel: 'discord', ok: true }]);
  });

  it('routes LOW alerts to discord only', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makeAlert('LOW'));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).not.toHaveBeenCalled();
    expect(result.deliveries).toEqual([{ channel: 'discord', ok: true }]);
  });

  it('uses delivery tiers to keep feed alerts on discord only', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    await router.route(makeAlert('HIGH', { deliveryTier: 'feed' }));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).not.toHaveBeenCalled();
  });

  it('uses delivery tiers to add web push when a high-tier alert still qualifies for push', async () => {
    const discord = mockService('discord');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    await router.route(makeAlert('HIGH', {
      deliveryTier: 'high',
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
    }));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
  });

  it('reports enabled=false when no channels are configured', () => {
    const router = new AlertRouter({});
    expect(router.enabled).toBe(false);
  });

  it('reports enabled=true when at least one channel is configured', () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });
    expect(router.enabled).toBe(true);
  });

  it('captures per-channel errors without failing the other channel', async () => {
    const discord = mockService('discord');
    discord.send.mockRejectedValue(new Error('Discord down'));
    const webPush = mockService('webPush');
    const router = new AlertRouter({ discord, webPush });

    const result = await router.route(makeAlert('HIGH', {
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
    }));

    const discordResult = result.deliveries.find((delivery) => delivery.channel === 'discord');
    const webPushResult = result.deliveries.find((delivery) => delivery.channel === 'webPush');

    expect(discordResult?.ok).toBe(false);
    expect(discordResult?.error?.message).toBe('Discord down');
    expect(webPushResult).toEqual({ channel: 'webPush', ok: true });
  });

  it('passes alerts to configured services unchanged', async () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });
    const alert = makeAlert('LOW');

    await router.route(alert);

    expect(discord.send).toHaveBeenCalledWith(alert);
  });
});
