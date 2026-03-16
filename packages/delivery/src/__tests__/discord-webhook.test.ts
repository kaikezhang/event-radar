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

function getEmbedFromLastCall(fetchSpy: ReturnType<typeof vi.fn>) {
  const [, options] = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(options.body as string).embeds[0];
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

  it('should send a compact embed with event title in description', async () => {
    const webhook = new DiscordWebhook({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    });

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.username).toBe('Event Radar');
    expect(payload.embeds).toHaveLength(1);
    const embed = payload.embeds[0];

    // Title uses severity emoji + event title (no enrichment)
    expect(embed.title).toContain('🟠');
    expect(embed.title).toContain('8-K: Apple Inc. (AAPL)');
    // Description contains the headline
    expect(embed.description).toContain('8-K: Apple Inc. (AAPL)');
    expect(embed.timestamp).toBe('2024-01-15T10:00:00.000Z');
    // Footer is the source badge
    expect(embed.footer.text).toContain('SEC Filing');
  });

  it('should use color 0xed4245 (red) for CRITICAL severity', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({ severity: 'CRITICAL' }));

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.color).toBe(0xed4245);
  });

  it('should use tier-based color when deliveryTier is set', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({ deliveryTier: 'critical' }));
    expect(getEmbedFromLastCall(fetchSpy).color).toBe(0xed4245);

    await webhook.send(makeAlert({ deliveryTier: 'high' }));
    expect(getEmbedFromLastCall(fetchSpy).color).toBe(0xf57c00);

    await webhook.send(makeAlert({ deliveryTier: 'feed' }));
    expect(getEmbedFromLastCall(fetchSpy).color).toBe(0xfee75c);
  });

  it('should include Source link field', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const embed = getEmbedFromLastCall(fetchSpy);
    const linkField = embed.fields?.find(
      (f: { name: string }) => f.name === '🔗 Source',
    );

    expect(linkField).toBeDefined();
    expect(linkField.value).toContain('https://www.sec.gov/filing/123');
  });

  it('renders a confirmation field when multiple sources confirm the event', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        confirmationCount: 3,
        confirmedSources: ['sec-edgar', 'pr-newswire', 'reuters'],
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    const confirmationField = embed.fields?.find(
      (field: { name: string }) => field.name.includes('Confirmed by'),
    );

    expect(confirmationField).toBeDefined();
    expect(confirmationField.name).toContain('3 sources');
    expect(confirmationField.value).toContain('sec-edgar');
    expect(confirmationField.value).toContain('reuters');
  });

  it('should truncate long descriptions to 2048 chars', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
    const longImpact = 'x'.repeat(3000);

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Summary',
          impact: longImpact,
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.description.length).toBeLessThanOrEqual(2048);
    expect(embed.description).toMatch(/\.\.\.$/);
  });

  // ── Compact title tests ──────────────────────────────────────

  it('uses direction emoji + ticker + action label as title when enrichment has tickers', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Apple CEO departure triggers uncertainty',
          impact: 'Leadership vacuum at critical time for iPhone launch',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.title).toBe('📉 AAPL — Bearish Setup');
  });

  it('uses bullish label for bullish direction', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Boeing wins defense contract',
          impact: 'Largest defense contract in 6 months',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'BA', direction: 'bullish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.title).toBe('📈 BA — Bullish Setup');
  });

  it('uses Monitor label for monitor action', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Potential catalyst',
          impact: 'Needs confirmation',
          action: '🟡 Monitor',
          tickers: [{ symbol: 'TSLA', direction: 'neutral' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.title).toBe('➡️ TSLA — Monitor');
  });

  it('falls back to severity emoji + event title when no enrichment tickers', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({ ticker: 'AAPL' }));

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.title).toBe('🟠 8-K: Apple Inc. (AAPL)');
  });

  // ── Compact description / body tests ─────────────────────────

  it('includes "Why it matters" from enrichment impact in description', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Summary text',
          impact: 'Leadership vacuum at critical time for iPhone launch',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.description).toContain('**Why it matters:**');
    expect(embed.description).toContain('Leadership vacuum');
  });

  it('includes compact historical stats for critical tier', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        deliveryTier: 'critical',
        enrichment: {
          summary: 'Summary',
          impact: 'Impact text',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'BA', direction: 'bullish' }],
          risks: 'Contract execution delays; defense sector rotation.',
        },
        historicalContext: {
          matchCount: 12,
          confidence: 'high',
          avgAlphaT5: 0.032,
          avgAlphaT20: 0.083,
          winRateT20: 75,
          medianAlphaT20: 0.071,
          topMatches: [
            {
              ticker: 'BA',
              headline: 'Prior defense contract',
              source: 'breaking-news',
              eventDate: '2025-06-01T10:00:00.000Z',
              alphaT20: 0.16,
              score: 11,
            },
          ],
          patternSummary: 'Defense contract wins for large-cap',
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    // Compact historical one-liner
    expect(embed.description).toContain('**Similar events:**');
    expect(embed.description).toContain('12 cases');
    expect(embed.description).toContain('+3.2% avg 5d');
    expect(embed.description).toContain('75% win rate');
    // Risk shown for critical
    expect(embed.description).toContain('**Risk:**');
    expect(embed.description).toContain('Contract execution delays');
  });

  it('includes historical stats but NOT risk for high tier', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        deliveryTier: 'high',
        enrichment: {
          summary: 'Summary',
          impact: 'Impact text',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'BA', direction: 'bullish' }],
          risks: 'Contract execution delays.',
        },
        historicalContext: {
          matchCount: 12,
          confidence: 'high',
          avgAlphaT5: 0.032,
          avgAlphaT20: 0.083,
          winRateT20: 75,
          medianAlphaT20: 0.071,
          topMatches: [
            {
              ticker: 'BA',
              headline: 'Prior defense contract',
              source: 'breaking-news',
              eventDate: '2025-06-01T10:00:00.000Z',
              alphaT20: 0.16,
              score: 11,
            },
          ],
          patternSummary: 'Defense contract wins',
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.description).toContain('**Similar events:**');
    expect(embed.description).not.toContain('**Risk:**');
  });

  it('shows only headline + why it matters for feed tier', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        deliveryTier: 'feed',
        enrichment: {
          summary: 'Summary',
          impact: 'Impact text here',
          action: '🟡 Monitor',
          tickers: [{ symbol: 'AAPL', direction: 'neutral' }],
          risks: 'Some risk info',
        },
        historicalContext: {
          matchCount: 8,
          confidence: 'high',
          avgAlphaT5: 0.024,
          avgAlphaT20: 0.083,
          winRateT20: 62,
          medianAlphaT20: 0.071,
          topMatches: [
            {
              ticker: 'NVDA',
              headline: 'Prior event',
              source: 'earnings',
              eventDate: '2025-02-21T21:00:00.000Z',
              alphaT20: 0.16,
              score: 11,
            },
          ],
          patternSummary: 'Pattern summary',
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.description).toContain('8-K: Apple Inc. (AAPL)');
    expect(embed.description).toContain('**Why it matters:**');
    // Feed tier: no historical stats, no risk
    expect(embed.description).not.toContain('**Similar events:**');
    expect(embed.description).not.toContain('**Risk:**');
  });

  it('hides historical stats when all values are zero', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        deliveryTier: 'critical',
        enrichment: {
          summary: 'Summary',
          impact: 'Impact',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
        historicalContext: {
          matchCount: 3,
          confidence: 'medium',
          avgAlphaT5: 0,
          avgAlphaT20: 0,
          winRateT20: 0,
          medianAlphaT20: 0,
          topMatches: [
            {
              ticker: 'AAPL',
              headline: 'Prior flat event',
              source: 'earnings',
              eventDate: '2025-01-01T10:00:00.000Z',
              alphaT20: 0,
              score: 8,
            },
          ],
          similarEvents: [
            {
              title: 'Prior flat event',
              ticker: 'AAPL',
              source: 'earnings',
              eventTime: '2025-01-01T10:00:00.000Z',
              change1d: null,
              change1w: null,
              change1m: null,
              score: 8,
            },
          ],
          patternSummary: 'No meaningful edge',
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.description).not.toContain('**Similar events:**');
  });

  it('appends event price to description for single ticker', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
    const baseAlert = makeAlert();

    await webhook.send(
      makeAlert({
        event: {
          ...baseAlert.event,
          metadata: {
            ...baseAlert.event.metadata,
            event_price: 187.34,
          },
        },
        enrichment: {
          summary: 'Summary',
          impact: 'Impact',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.description).toContain('@ $187.34');
  });

  it('shows multiple tickers as a field instead of in description', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Broad market impact',
          impact: 'Multiple sectors affected',
          action: '🔴 High-Quality Setup',
          tickers: [
            { symbol: 'AAPL', direction: 'bearish' },
            { symbol: 'MSFT', direction: 'bearish' },
          ],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    const tickerField = embed.fields?.find(
      (f: { name: string }) => f.name === 'Tickers',
    );

    expect(tickerField).toBeDefined();
    expect(tickerField.value).toContain('AAPL');
    expect(tickerField.value).toContain('MSFT');
    expect(tickerField.value).toContain('📉');
  });

  // ── Footer tests ─────────────────────────────────────────────

  it('shows source badge in footer instead of "Event Radar"', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.footer.text).toContain('SEC Filing');
    expect(embed.footer.text).not.toContain('AI Enhanced');
  });

  it('shows breaking news badge in footer for breaking-news source', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
    const baseAlert = makeAlert();

    await webhook.send(
      makeAlert({
        event: { ...baseAlert.event, source: 'breaking-news' },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    expect(embed.footer.text).toContain('Breaking News');
  });

  // ── Removed sections tests ───────────────────────────────────

  it('does not include verbose AI Analysis field', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Apple CEO departure triggers uncertainty',
          impact: 'Leadership vacuum at critical time for iPhone launch',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    const aiField = embed.fields?.find(
      (field: { name: string }) => field.name === '🤖 AI Analysis',
    );
    expect(aiField).toBeUndefined();
  });

  it('does not include Market Regime field', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        regimeSnapshot: {
          score: 65,
          label: 'overbought',
          factors: {
            vix: { value: 18.0, zscore: 0.0 },
            spyRsi: { value: 50.0, signal: 'neutral' },
            spy52wPosition: { pctFromHigh: -5.0, pctFromLow: 15.0 },
            maSignal: { sma20: 450.0, sma50: 448.0, signal: 'neutral' },
            yieldCurve: { spread: 0.5, inverted: false },
          },
          amplification: { bullish: 0.7, bearish: 1.5 },
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    const regimeField = embed.fields?.find(
      (field: { name: string }) => field.name === '📈 Market Regime',
    );
    expect(regimeField).toBeUndefined();
  });

  it('does not include Disclaimer field', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        enrichment: {
          summary: 'Summary',
          impact: 'Impact',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
        },
      }),
    );

    const embed = getEmbedFromLastCall(fetchSpy);
    const disclaimerField = embed.fields?.find(
      (field: { name: string }) => field.name.includes('Disclaimer'),
    );
    expect(disclaimerField).toBeUndefined();
  });

  it('does not include Severity field', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const embed = getEmbedFromLastCall(fetchSpy);
    const severityField = embed.fields?.find(
      (field: { name: string }) => field.name === 'Severity',
    );
    expect(severityField).toBeUndefined();
  });

  it('does not include raw event body as description', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const embed = getEmbedFromLastCall(fetchSpy);
    // Description should NOT be the raw body
    expect(embed.description).not.toBe('Item 5.02 Departure of CEO');
    // Description should contain the title as the headline
    expect(embed.description).toContain('8-K: Apple Inc. (AAPL)');
  });

  // ── Error handling ───────────────────────────────────────────

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
