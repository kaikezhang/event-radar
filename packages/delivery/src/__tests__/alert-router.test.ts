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
  it('should route CRITICAL to both bark and discord', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const router = new AlertRouter({ bark, discord });

    const results = await router.route(makeAlert('CRITICAL'));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('should route HIGH to both bark and discord', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const router = new AlertRouter({ bark, discord });

    await router.route(makeAlert('HIGH'));

    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();
  });

  it('should route MEDIUM to discord only', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const router = new AlertRouter({ bark, discord });

    await router.route(makeAlert('MEDIUM'));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
  });

  it('should route LOW to discord only', async () => {
    const bark = mockService('bark');
    const discord = mockService('discord');
    const router = new AlertRouter({ bark, discord });

    await router.route(makeAlert('LOW'));

    expect(bark.send).not.toHaveBeenCalled();
    expect(discord.send).toHaveBeenCalledOnce();
  });

  it('should skip channels that are not configured', async () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });

    // CRITICAL targets bark+discord, but bark isn't configured — only discord fires
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
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });
    expect(router.enabled).toBe(true);
  });

  it('should capture errors per channel without failing others', async () => {
    const bark = mockService('bark');
    bark.send.mockRejectedValue(new Error('Bark down'));
    const discord = mockService('discord');
    const router = new AlertRouter({ bark, discord });

    const results = await router.route(makeAlert('CRITICAL'));

    // Both channels attempted
    expect(bark.send).toHaveBeenCalledOnce();
    expect(discord.send).toHaveBeenCalledOnce();

    const barkResult = results.find((r) => r.channel === 'bark');
    const discordResult = results.find((r) => r.channel === 'discord');

    expect(barkResult?.ok).toBe(false);
    expect(barkResult?.error?.message).toBe('Bark down');
    expect(discordResult?.ok).toBe(true);
  });

  it('should pass the alert to services unchanged', async () => {
    const discord = mockService('discord');
    const router = new AlertRouter({ discord });
    const alert = makeAlert('LOW');

    await router.route(alert);

    expect(discord.send).toHaveBeenCalledWith(alert);
  });
});
