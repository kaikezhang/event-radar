import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscordWebhook } from '../discord-webhook.js';
import type { AlertEvent } from '../types.js';

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

describe('DiscordWebhook', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('should POST to the webhook URL', async () => {
    const webhook = new DiscordWebhook({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    });

    await webhook.send(makeAlert());

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/123/abc');
  });

  it('retries webhook sends after transient failures', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '' });

    const webhook = new DiscordWebhook({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      retryDelays: [0],
    } as never);

    await webhook.send(makeAlert());

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should send an embed with correct structure', async () => {
    const webhook = new DiscordWebhook({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    });

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.username).toBe('Event Radar');
    expect(payload.embeds).toHaveLength(1);
    const embed = payload.embeds[0];

    expect(embed.title).toContain('8-K: Apple Inc. (AAPL)');
    expect(embed.description).toBe('Item 5.02 Departure of CEO');
    expect(embed.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(embed.footer.text).toContain('Event Radar');
  });

  it('should include Source badge and Severity fields', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];
    const sourceField = embed.fields.find(
      (f: { name: string }) => f.name === 'Source',
    );
    const severityField = embed.fields.find(
      (f: { name: string }) => f.name === 'Severity',
    );

    expect(sourceField).toBeDefined();
    expect(sourceField.value).toContain('SEC Filing');
    expect(severityField).toBeDefined();
    expect(severityField.value).toContain('HIGH');
  });

  it('should use color 0xed4245 (red) for CRITICAL', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({ severity: 'CRITICAL' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];

    expect(embed.color).toBe(0xed4245);
  });

  it('should include Ticker field with bold formatting', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({ ticker: 'TSLA' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];
    const tickerField = embed.fields.find(
      (f: { name: string }) => f.name === 'Ticker',
    );

    expect(tickerField).toBeDefined();
    expect(tickerField.value).toBe('**TSLA**');
    expect(tickerField.inline).toBe(true);
  });

  it('should include Filing Items field from metadata', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];
    const itemsField = embed.fields.find(
      (f: { name: string }) => f.name === 'Filing Items',
    );

    expect(itemsField).toBeDefined();
    expect(itemsField.value).toContain('5.02');
  });

  it('should include Source link field', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];
    const linkField = embed.fields.find(
      (f: { name: string }) => f.name === '🔗 Source',
    );

    expect(linkField).toBeDefined();
    expect(linkField.value).toContain('https://www.sec.gov/filing/123');
  });

  it('should truncate long descriptions to 2048 chars', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
    const longBody = 'x'.repeat(3000);
    const alert = makeAlert();
    (alert.event as { body: string }).body = longBody;

    await webhook.send(alert);

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];

    expect(embed.description.length).toBeLessThanOrEqual(2048);
    expect(embed.description).toMatch(/\.\.\.$/);
  });

  it('renders a historical context field when historical matches are present', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        historicalContext: {
          matchCount: 8,
          confidence: 'high',
          avgAlphaT5: 0.024,
          avgAlphaT20: 0.083,
          winRateT20: 62,
          medianAlphaT20: 0.071,
          bestCase: {
            ticker: 'NVDA',
            alphaT20: 0.22,
            headline: 'Nvidia beat and raised guidance',
          },
          worstCase: {
            ticker: 'INTC',
            alphaT20: -0.12,
            headline: 'Intel beat but guided down',
          },
          topMatches: [
            {
              ticker: 'NVDA',
              headline: 'Nvidia beat and raised guidance',
              eventDate: '2025-02-21T21:00:00.000Z',
              alphaT20: 0.16,
              score: 11,
            },
          ],
          patternSummary: 'Technology earnings beat in bull market: +8.3% avg alpha T+20, 62% win rate (8 cases)',
        },
      }),
    );

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];
    const historyField = embed.fields.find(
      (field: { name: string }) => field.name.includes('Historical Pattern'),
    );

    expect(historyField).toBeDefined();
    expect(historyField.name).toContain('HIGH');
    expect(historyField.value).toContain('Technology earnings beat in bull market');
    expect(historyField.value).toContain('Win Rate T+20');
    expect(historyField.value).toContain('62');
    expect(historyField.value).toContain('Worst');
    expect(historyField.value).toContain('INTC');
  });

  it('should use enrichment fields when LLM enrichment is present', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Apple CEO departure triggers uncertainty',
          impact: 'Leadership vacuum at critical time for iPhone launch',
          action: '🔴 立即关注',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const embed = JSON.parse(options.body as string).embeds[0];

    expect(embed.title).toContain('HIGH');
    expect(embed.title).toContain('Apple CEO departure triggers uncertainty');
    expect(embed.description).toContain('Leadership vacuum');
    expect(embed.footer.text).toContain('AI Enhanced');

    const tickerField = embed.fields.find(
      (f: { name: string }) => f.name === 'Tickers',
    );
    expect(tickerField).toBeDefined();
    expect(tickerField.value).toContain('AAPL');
    expect(tickerField.value).toContain('📉');
  });

  it('should throw on non-ok response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    const webhook = new DiscordWebhook({
      webhookUrl: 'https://example.com',
      retryDelays: [0, 0, 0],
    });

    await expect(webhook.send(makeAlert())).rejects.toThrow(
      'Discord webhook failed (429): rate limited',
    );
  });
});
