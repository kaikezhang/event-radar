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
        action: '🔴 ACT NOW',
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
        action: '🟡 WATCH',
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
        action: '🟢 FYI',
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
        action: '🔴 ACT NOW',
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

  it('should route CRITICAL to bark, discord, telegram, and webhook', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    const results = await router.route(makeAlert('CRITICAL'));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(results.deliveries).toHaveLength(4);
    expect(results.deliveries.every((r) => r.ok)).toBe(true);
  });

  it('should route HIGH to bark, discord, telegram, and webhook', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    const result = await router.route(makeAlert('HIGH'));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(4);
  });

  it('should route HIGH to bark, discord, telegram, webhook, and web push when the push policy allows it', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ bark, discord, telegram, webhook, webPush });

    const result = await router.route(makeAlert('HIGH', {
      confidenceBucket: 'high',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🔴 ACT NOW',
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

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
    expect(result.decision).toEqual({
      tier: 'high',
      shouldPush: true,
      pushMode: 'loud',
      reason: 'act_now_high_confidence_strong_support',
    });
    expect(result.deliveries).toHaveLength(5);
  });

  it('should route MEDIUM to discord, telegram, and webhook (not bark)', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    const result = await router.route(makeAlert('MEDIUM'));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(3);
  });

  it('should route MEDIUM to discord, telegram, webhook, and web push when the push policy allows it', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ bark, discord, telegram, webhook, webPush });

    const result = await router.route(makeAlert('MEDIUM', {
      confidenceBucket: 'medium',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🟡 WATCH',
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

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(webPush.send).toHaveBeenCalledOnce();
    expect(result.decision).toEqual({
      tier: 'medium',
      shouldPush: true,
      pushMode: 'silent',
      reason: 'watch_meaningful_support',
    });
    expect(result.deliveries).toHaveLength(4);
  });

  it('should keep web push disabled when the push policy downgrades an alert to feed-only', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const webPush = mockService('webPush');
    const router = new AlertRouter({ bark, discord, telegram, webhook, webPush });

    const result = await router.route(makeAlert('HIGH', {
      confidenceBucket: 'high',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🔴 ACT NOW',
        tickers: [],
      },
    }));

    expect(result.decision).toEqual({
      tier: 'low',
      shouldPush: false,
      pushMode: 'none',
      reason: 'insufficient_historical_support',
    });
    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(webPush.send).not.toHaveBeenCalled();
    expect(result.deliveries).toHaveLength(4);
  });

  it('should route LOW to discord and webhook only', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    const result = await router.route(makeAlert('LOW'));

    expect(bark.send).not.toHaveBeenCalled();
    expect(telegram.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
    expect(result.deliveries).toHaveLength(2);
  });

  it('should skip channels that are not configured', async () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });

    // CRITICAL targets bark+discord+telegram+webhook, but only discord configured
    const results = await router.route(makeAlert('CRITICAL'));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(results.deliveries).toHaveLength(1);
    expect(results.deliveries[0].channel).toBe('discord');
  });

  it('should report enabled=false when no channels configured', () => {
    const router = new AlertRouter({});
    expect(router.enabled).toBe(false);
  });

  it('should report enabled=true when at least one channel configured', () => {
    const telegram = mockService('telegram');
    const router = new AlertRouter({ telegram });
    expect(router.enabled).toBe(true);
  });

  it('should capture errors per channel without failing others', async () => {
    const bark = mockService('bark');
    bark.send.mockRejectedValue(new Error('Bark down'));
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    telegram.send.mockRejectedValue(new Error('Telegram down'));
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    const results = await router.route(makeAlert('CRITICAL'));

    // All channels attempted
    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();

    const barkResult = results.deliveries.find((r) => r.channel === 'bark');
    const discordResult = results.deliveries.find((r) => r.channel === 'discord');
    const telegramResult = results.deliveries.find((r) => r.channel === 'telegram');
    const webhookResult = results.deliveries.find((r) => r.channel === 'webhook');

    expect(barkResult?.ok).toBe(false);
    expect(barkResult?.error?.message).toBe('Bark down');
    expect(discordResult?.ok).toBe(true);
    expect(telegramResult?.ok).toBe(false);
    expect(telegramResult?.error?.message).toBe('Telegram down');
    expect(webhookResult?.ok).toBe(true);
  });

  it('should pass the alert to services unchanged', async () => {
    const webhook = mockService('webhook');
    const router = new AlertRouter({ webhook });
    const alert = makeAlert('LOW');

    await router.route(alert);

    expect(webhook.send).toHaveBeenCalledWith(alert);
  });

  it('should handle partial failures (some channels fail, others succeed)', async () => {
    const discord = mockService('discord');
    discord.send.mockRejectedValue(new Error('Discord rate limited'));
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ discord, telegram, webhook });

    const results = await router.route(makeAlert('MEDIUM'));

    const successes = results.deliveries.filter((r) => r.ok);
    const failures = results.deliveries.filter((r) => !r.ok);

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);
    expect(failures[0].channel).toBe('discord');
  });

  it('should not change existing channel routing when the push policy downgrades an alert to feed-only', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    const result = await router.route(makeAlert('HIGH', {
      confidenceBucket: 'high',
      enrichment: {
        summary: 'Summary',
        impact: 'Impact',
        whyNow: 'Why now',
        currentSetup: 'Setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🔴 ACT NOW',
        tickers: [],
      },
    }));

    expect(result.decision).toEqual({
      tier: 'low',
      shouldPush: false,
      pushMode: 'none',
      reason: 'insufficient_historical_support',
    });
    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
  });
});
