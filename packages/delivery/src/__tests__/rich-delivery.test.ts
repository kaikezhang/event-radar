import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscordWebhook } from '../discord-webhook.js';
import { BarkPusher } from '../bark-pusher.js';
import { TelegramDelivery } from '../telegram.js';
import { WebhookDelivery } from '../webhook.js';
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

  // ---- Discord Tests ----

  describe('Discord — AI Analysis field', () => {
    it('should include AI Analysis field when enrichment is present', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'Apple CEO departure triggers uncertainty',
            impact: 'Leadership vacuum at critical time for iPhone launch',
            action: '🔴 立即关注',
            tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
            regimeContext: 'In a neutral market, leadership changes have standard impact',
          },
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const aiField = embed.fields.find(
        (f: { name: string }) => f.name === '🤖 AI Analysis',
      );

      expect(aiField).toBeDefined();
      expect(aiField.value).toContain('Apple CEO departure triggers uncertainty');
      expect(aiField.value).toContain('Leadership vacuum');
      expect(aiField.value).not.toContain('neutral market');
      expect(aiField.inline).toBe(false);
    });
  });

  describe('Discord — Market Regime field', () => {
    it('should include Market Regime field when regimeSnapshot is present', async () => {
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
      const regimeField = embed.fields.find(
        (f: { name: string }) => f.name === '📈 Market Regime',
      );

      expect(regimeField).toBeDefined();
      expect(regimeField.value).toContain('Overbought');
      expect(regimeField.value).toContain('Score: 65');
      expect(regimeField.value).toContain('VIX: 14.2');
      expect(regimeField.value).toContain('SPY RSI: 72.5');
      expect(regimeField.value).toContain('INVERTED');
      expect(regimeField.value).toContain('Bearish amp: 1.5x');
    });
  });

  describe('Discord — Disclaimer field', () => {
    it('should include disclaimer when enrichment is present', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'Summary',
            impact: 'Impact',
            action: '🟢 仅供参考',
            tickers: [],
          },
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const disclaimer = embed.fields.find(
        (f: { name: string }) => f.name === '⚖️ Disclaimer',
      );

      expect(disclaimer).toBeDefined();
      expect(disclaimer.value).toContain('Not financial advice');
    });

    it('should NOT include disclaimer when no enrichment/regime/history', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(makeAlert());

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];
      const disclaimer = embed.fields.find(
        (f: { name: string }) => f.name === '⚖️ Disclaimer',
      );

      expect(disclaimer).toBeUndefined();
    });
  });

  describe('Discord — title format with enrichment', () => {
    it('should format title with severity emoji and event title', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'NVDA files 8-K restructuring',
            impact: 'Major impact',
            action: '🔴 立即关注',
            tickers: [{ symbol: 'NVDA', direction: 'bearish' }],
          },
          ticker: 'NVDA',
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const embed = JSON.parse(options.body as string).embeds[0];

      expect(embed.title).toBe('🟠 8-K: Apple Inc. (AAPL)');
      expect(embed.description).toContain('NVDA files 8-K restructuring');
      expect(embed.description).toContain('Major impact');
    });
  });

  // ---- Bark Tests ----

  describe('Bark — regime label in body', () => {
    it('should append regime label to body text', async () => {
      const pusher = new BarkPusher({ key: 'k' });

      await pusher.send(
        makeAlert({
          regimeSnapshot: makeRegimeSnapshot({
            score: -55,
            label: 'oversold',
          }),
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);

      expect(body.body).toContain('Regime');
      expect(body.body).toContain('🟢OS');
      expect(body.body).toContain('-55');
    });
  });

  // ---- Telegram Tests ----

  describe('Telegram — AI Analysis and Regime sections', () => {
    it('should include AI Analysis, regime, and disclaimer in message', async () => {
      const telegram = new TelegramDelivery({
        botToken: 'tok',
        chatId: '123',
        minSeverity: 'LOW',
        enabled: true,
        retryDelays: [0],
      });

      await telegram.send(
        makeAlert({
          enrichment: {
            summary: '12 similar restructuring events: 67% positive at T+20',
            impact: 'Cost-cutting viewed favorably',
            action: '🟡 持续观察',
            tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
          },
          regimeSnapshot: makeRegimeSnapshot({ score: 10, label: 'neutral' }),
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(options.body as string);

      expect(payload.text).toContain('AI Analysis');
      expect(payload.text).toContain('12 similar restructuring events');
      expect(payload.text).toContain('Market Regime');
      expect(payload.text).toContain('Neutral');
      expect(payload.text).toContain('Not financial advice');
    });
  });

  // ---- Webhook Tests ----

  describe('Webhook — enrichment and regime in payload', () => {
    const webhookConfig = {
      url: 'https://example.com/webhook',
      secret: 'test-secret',
      minSeverity: 'LOW' as const,
      enabled: true,
      retryDelays: [0],
    };

    it('should include enrichment, historicalContext, and regimeSnapshot in JSON payload', async () => {
      const webhook = new WebhookDelivery(webhookConfig);

      await webhook.send(
        makeAlert({
          enrichment: {
            summary: 'CEO departure',
            impact: 'Leadership gap',
            action: '🔴 立即关注',
            tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
            regimeContext: 'Neutral market context',
          },
          historicalContext: {
            matchCount: 5,
            confidence: 'medium',
            avgAlphaT5: 0.02,
            avgAlphaT20: 0.08,
            winRateT20: 60,
            medianAlphaT20: 0.07,
            topMatches: [],
            patternSummary: 'Leadership change pattern',
          },
          regimeSnapshot: makeRegimeSnapshot({ score: 0, label: 'neutral' }),
        }),
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(options.body as string);

      expect(payload.enrichment).toBeDefined();
      expect(payload.enrichment.summary).toBe('CEO departure');
      expect(payload.enrichment.regimeContext).toBe('Neutral market context');
      expect(payload.historicalContext).toBeDefined();
      expect(payload.historicalContext.matchCount).toBe(5);
      expect(payload.historicalContext.winRateT20).toBe(60);
      expect(payload.regimeSnapshot).toBeDefined();
      expect(payload.regimeSnapshot.score).toBe(0);
      expect(payload.regimeSnapshot.label).toBe('neutral');
      expect(payload.regimeSnapshot.amplification).toEqual({ bullish: 1.0, bearish: 1.0 });
    });

    it('should omit enrichment/regime/history when not present', async () => {
      const webhook = new WebhookDelivery(webhookConfig);

      await webhook.send(makeAlert());

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(options.body as string);

      expect(payload.enrichment).toBeUndefined();
      expect(payload.historicalContext).toBeUndefined();
      expect(payload.regimeSnapshot).toBeUndefined();
      expect(payload.event).toBeDefined();
      expect(payload.severity).toBe('HIGH');
    });
  });
});
