import { describe, it, expect, vi } from 'vitest';
import { AlertRouter } from '../alert-router.js';
import type { AlertEvent, DeliveryService } from '../types.js';
import type { Severity } from '@event-radar/shared';

function makeAlert(severity: Severity): AlertEvent {
  return {
    severity,
    event: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'sec-edgar',
      type: '8-K',
      title: `Test event (${severity})`,
      body: 'Test body',
      timestamp: new Date('2024-01-15T10:00:00Z'),
    },
  };
}

function mockService(name: string): DeliveryService & { send: ReturnType<typeof vi.fn> } {
  return { name, send: vi.fn().mockResolvedValue(undefined) };
}

describe('AlertRouter', () => {
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
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('should route HIGH to bark, discord, telegram, and webhook', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    await router.route(makeAlert('HIGH'));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
  });

  it('should route MEDIUM to discord, telegram, and webhook (not bark)', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    await router.route(makeAlert('MEDIUM'));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(telegram.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
  });

  it('should route LOW to discord and webhook only', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const telegram = mockService('telegram');
    const webhook = mockService('webhook');
    const router = new AlertRouter({ bark, discord, telegram, webhook });

    await router.route(makeAlert('LOW'));

    expect(bark.send).not.toHaveBeenCalled();
    expect(telegram.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(webhook.send).toHaveBeenCalledOnce();
  });

  it('should skip channels that are not configured', async () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });

    // CRITICAL targets bark+discord+telegram+webhook, but only discord configured
    const results = await router.route(makeAlert('CRITICAL'));

    expect(discord.send).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe('discord');
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

    const barkResult = results.find((r) => r.channel === 'bark');
    const discordResult = results.find((r) => r.channel === 'discord');
    const telegramResult = results.find((r) => r.channel === 'telegram');
    const webhookResult = results.find((r) => r.channel === 'webhook');

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

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);
    expect(failures[0].channel).toBe('discord');
  });
});
