import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscordWebhook } from '../discord-webhook.js';
import type { AlertEvent } from '../types.js';
import type { RegimeSnapshot } from '@event-radar/shared';

function makeRegimeSnapshot(overrides?: Partial<RegimeSnapshot>): RegimeSnapshot {
  return {
    score: 0,
    label: 'neutral',
    factors: {
      vix: { value: 18.0, zscore: 0.0 },
      spyRsi: { value: 50.0, signal: 'neutral' },
      spy52wPosition: { pctFromHigh: -5.0, pctFromLow: 15.0 },
      maSignal: { sma20: 450.0, sma50: 448.0, signal: 'neutral' },
      yieldCurve: { spread: 0.5, inverted: false },
    },
    amplification: { bullish: 1.0, bearish: 1.0 },
    updatedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeAlert(overrides?: Partial<AlertEvent>): AlertEvent {
  return {
    severity: 'HIGH',
    event: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'sec-edgar',
      type: '8-K',
      title: '8-K: Apple Inc. (AAPL)',
      body: 'Item 5.02 Departure of CEO',
      url: 'https://www.sec.gov/filing/123',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      metadata: { ticker: 'AAPL', item_types: ['5.02'] },
    },
    ticker: 'AAPL',
    ...overrides,
  };
}

describe('Rich Delivery Format', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);
  });

  describe('Discord — compact card: enrichment in description', () => {
    it('should include "Why it matters" in description instead of AI Analysis field', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'Apple CEO departure triggers uncertainty',
            impact: 'Leadership vacuum at critical time for iPhone launch',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
            regimeContext: 'In a neutral market, leadership changes have standard impact',
          },
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const aiField = embed.fields?.find(
        (field: { name: string }) => field.name === '🤖 AI Analysis',
      );

      expect(aiField).toBeUndefined();
      expect(embed.description).toContain('**What this means:**');
      expect(embed.description).toContain('Leadership vacuum');
    });
  });

  describe('Discord — compact card: no Market Regime field', () => {
    it('should NOT include Market Regime field', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          regimeSnapshot: makeRegimeSnapshot({
            score: 65,
            label: 'overbought',
            factors: {
              vix: { value: 14.2, zscore: -0.8 },
              spyRsi: { value: 72.5, signal: 'overbought' },
              spy52wPosition: { pctFromHigh: -1.0, pctFromLow: 28.0 },
              maSignal: { sma20: 460.0, sma50: 445.0, signal: 'golden_cross' },
              yieldCurve: { spread: -0.15, inverted: true },
            },
            amplification: { bullish: 0.7, bearish: 1.5 },
          }),
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const regimeField = embed.fields?.find(
        (field: { name: string }) => field.name === '📈 Market Regime',
      );

      expect(regimeField).toBeUndefined();
    });
  });

  describe('Discord — compact card: no Disclaimer field', () => {
    it('should NOT include disclaimer in compact card', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'Summary',
            impact: 'Impact',
            action: '🟢 Background',
            tickers: [],
          },
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const disclaimer = embed.fields?.find(
        (field: { name: string }) => field.name === '⚖️ Disclaimer',
      );

      expect(disclaimer).toBeUndefined();
    });

    it('should NOT include disclaimer when no enrichment, regime, or history exists', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(makeAlert());

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const disclaimer = embed.fields?.find(
        (field: { name: string }) => field.name === '⚖️ Disclaimer',
      );

      expect(disclaimer).toBeUndefined();
    });
  });

  describe('Discord — compact title with enrichment', () => {
    it('should format title with direction emoji + ticker + action label', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'NVDA files 8-K restructuring',
            impact: 'Major impact',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'NVDA', direction: 'bearish' }],
          },
          ticker: 'NVDA',
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];

      expect(embed.title).toBe('📉 NVDA — Bearish Setup');
      expect(embed.description).toContain('8-K: Apple Inc. (AAPL)');
    });
  });
});
