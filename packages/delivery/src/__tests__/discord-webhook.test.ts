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

  it('includes ticker, severity, and source fields in the embed', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const embed = getEmbedFromLastCall(fetchSpy);
    const tickerField = embed.fields?.find((field: { name: string }) => field.name === 'Ticker');
    const severityField = embed.fields?.find((field: { name: string }) => field.name === 'Severity');
    const sourceField = embed.fields?.find((field: { name: string }) => field.name === 'Source');

    expect(tickerField?.value).toBe('AAPL');
    expect(severityField?.value).toBe('HIGH');
    expect(sourceField?.value).toContain('SEC Filing');
  });

  it('includes a one-line analysis field when enrichment summary is available', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({
      enrichment: {
        summary: 'Leadership change raises execution risk into the next product cycle.',
        impact: 'Impact text',
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
      },
    }));

    const embed = getEmbedFromLastCall(fetchSpy);
    const analysisField = embed.fields?.find((field: { name: string }) => field.name === 'Analysis');

    expect(analysisField?.value).toContain('Leadership change raises execution risk');
  });

  it('includes an event detail link field and prefers storedEventId when present', async () => {
    process.env.APP_URL = 'https://eventradar.app';
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert({
      storedEventId: 'db-event-123',
    }));

    const embed = getEmbedFromLastCall(fetchSpy);
    const detailField = embed.fields?.find((field: { name: string }) => field.name === 'Event Detail');

    expect(detailField?.value).toContain('https://eventradar.app/event/db-event-123');
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

  // ── Default template description tests ─────────────────────────

  it('uses default template with "Why it matters" for unknown sources', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'analyst',
          type: 'upgrade',
          title: 'AAPL upgraded by Goldman Sachs',
          body: 'Price target raised to $250',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
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

  it('includes compact historical stats for critical tier (default template)', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'analyst',
          type: 'upgrade',
          title: 'BA upgraded',
          body: 'Defense contract',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
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
    // Historical stats
    expect(embed.description).toContain('Similar events');
    expect(embed.description).toContain('12 cases');
    expect(embed.description).toContain('+3.2% avg 5d');
    expect(embed.description).toContain('75% win rate');
    // Risk shown for critical
    expect(embed.description).toContain('**Risk:**');
    expect(embed.description).toContain('Contract execution delays');
  });

  it('includes historical stats but NOT risk for high tier (default template)', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'analyst',
          type: 'upgrade',
          title: 'BA upgraded',
          body: 'Defense contract',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
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
    expect(embed.description).toContain('Similar events');
    expect(embed.description).not.toContain('**Risk:**');
  });

  it('shows only headline + why it matters for feed tier (default template)', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'analyst',
          type: 'upgrade',
          title: 'AAPL upgraded',
          body: 'Upgrade',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
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
    expect(embed.description).toContain('AAPL upgraded');
    expect(embed.description).toContain('**Why it matters:**');
    // Feed tier: no historical stats, no risk
    expect(embed.description).not.toContain('Similar events');
    expect(embed.description).not.toContain('**Risk:**');
  });

  it('hides historical stats when all values are zero', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(
      makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'analyst',
          type: 'upgrade',
          title: 'AAPL upgraded',
          body: 'Upgrade',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
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
    expect(embed.description).not.toContain('Similar events');
  });

  it('appends event price to description for single ticker (default template)', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
    const baseAlert = makeAlert();

    await webhook.send(
      makeAlert({
        event: {
          ...baseAlert.event,
          source: 'analyst',
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

  it('does not duplicate severity text in the title when a structured severity field is present', async () => {
    const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

    await webhook.send(makeAlert());

    const embed = getEmbedFromLastCall(fetchSpy);
    const severityField = embed.fields?.find(
      (field: { name: string }) => field.name === 'Severity',
    );
    expect(severityField?.value).toBe('HIGH');
    expect(embed.title).not.toContain('HIGH');
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

  // ── Breaking News template tests ──────────────────────────────

  describe('breaking-news template', () => {
    function makeBreakingNewsAlert(overrides?: Partial<AlertEvent>): AlertEvent {
      return makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'breaking-news',
          type: 'news',
          title: 'Lululemon Reports Weak Guidance as Tariffs Weigh',
          body: 'Lululemon reported Q4 earnings that beat estimates but issued weak guidance citing tariff uncertainty.',
          url: 'https://cnbc.com/article/123',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          metadata: {
            ticker: 'LULU',
            source_feed: 'CNBC',
          },
        },
        ticker: 'LULU',
        enrichment: {
          summary: 'Weak guidance from tariff pressure',
          impact: 'Weak forward guidance signals margin pressure from tariffs. Stock already down 15% YTD.',
          risks: 'Better-than-expected tariff resolution could reverse the selloff.',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'LULU', direction: 'bearish' }],
        },
        classificationConfidence: 0.85,
        ...overrides,
      });
    }

    it('includes source header with publisher name', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📰 Breaking News · CNBC');
    });

    it('includes quoted original text from body', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('> Lululemon reported Q4 earnings');
    });

    it('includes direction badge', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('▼ BEARISH');
    });

    it('includes "Why it matters" from enrichment', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**Why it matters:**');
      expect(embed.description).toContain('margin pressure from tariffs');
    });

    it('includes risk for critical tier', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert({ deliveryTier: 'critical' }));

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**Risk:**');
      expect(embed.description).toContain('tariff resolution');
    });

    it('includes risk for high tier', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert({ deliveryTier: 'high' }));

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**Risk:**');
    });

    it('omits risk for feed tier', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeBreakingNewsAlert({ deliveryTier: 'feed' }));

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).not.toContain('**Risk:**');
    });

    it('includes historical stats for critical/high tier', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeBreakingNewsAlert({
          deliveryTier: 'critical',
          historicalContext: {
            matchCount: 8,
            confidence: 'high',
            avgAlphaT5: -0.042,
            avgAlphaT20: -0.08,
            winRateT20: 75,
            medianAlphaT20: -0.06,
            topMatches: [
              { ticker: 'LULU', headline: 'Prior weak guidance', source: 'breaking-news', eventDate: '2023-06-01', alphaT20: -0.12, score: 10 },
            ],
            patternSummary: 'Weak guidance pattern',
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('Similar events');
      expect(embed.description).toContain('8 cases');
      expect(embed.description).toContain('-4.2% avg 5d');
      expect(embed.description).toContain('75% win rate');
    });

    it('works without source_feed metadata', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeBreakingNewsAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'breaking-news',
            type: 'news',
            title: 'Test headline',
            body: 'Test body',
            timestamp: new Date('2024-01-15T10:00:00Z'),
            metadata: {},
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      // Should still have the header without publisher
      expect(embed.description).toContain('📰 Breaking News');
      expect(embed.description).not.toContain('· undefined');
    });
  });

  // ── SEC Filing template tests ─────────────────────────────────

  describe('sec-edgar template', () => {
    function makeSecAlert(overrides?: Partial<AlertEvent>): AlertEvent {
      return makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'sec-edgar',
          type: '8-K',
          title: '8-K: Moderna Inc. (MRNA)',
          body: 'Entry into Material Definitive Agreement',
          url: 'https://www.sec.gov/filing/456',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          metadata: {
            ticker: 'MRNA',
            form_type: '8-K',
            item_types: ['1.01', '5.02'],
            item_descriptions: ['Item 1.01: Material Agreement', 'Item 5.02: Officer Departure/Appointment'],
            company_name: 'Moderna Inc',
            cik: '0001682852',
          },
        },
        ticker: 'MRNA',
        enrichment: {
          summary: 'Material agreement and officer change',
          impact: 'New partnership agreement could expand revenue pipeline. Officer change suggests strategic reorganization.',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'MRNA', direction: 'bullish' }],
        },
        classificationConfidence: 0.72,
        ...overrides,
      });
    }

    it('includes SEC Filing header with form type', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeSecAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📋 SEC Filing · 8-K');
    });

    it('lists item descriptions', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeSecAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📄 Item 1.01: Material Agreement');
      expect(embed.description).toContain('📄 Item 5.02: Officer Departure/Appointment');
    });

    it('falls back to item_types when no item_descriptions', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeSecAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'sec-edgar',
            type: '8-K',
            title: '8-K: Test Corp',
            body: 'Filing',
            timestamp: new Date('2024-01-15T10:00:00Z'),
            metadata: {
              form_type: '8-K',
              item_types: ['2.01', '5.07'],
            },
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📄 Item 2.01');
      expect(embed.description).toContain('📄 Item 5.07');
    });

    it('includes company name and CIK', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeSecAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('Company: Moderna Inc (CIK: 0001682852)');
    });

    it('includes direction badge', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeSecAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('▲ BULLISH');
    });

    it('uses "What this means" instead of "Why it matters"', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeSecAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**What this means:**');
      expect(embed.description).not.toContain('**Why it matters:**');
      expect(embed.description).toContain('partnership agreement');
    });

    it('works with Form 4 filing', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeSecAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'sec-edgar',
            type: 'Form 4',
            title: 'Form 4: Insider Purchase at AAPL',
            body: 'CEO purchased 50,000 shares',
            timestamp: new Date('2024-01-15T10:00:00Z'),
            metadata: {
              form_type: 'Form 4',
              company_name: 'Apple Inc',
            },
          },
          enrichment: {
            summary: 'Large insider purchase',
            impact: 'CEO buying shares signals confidence in upcoming product cycle.',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📋 SEC Filing · Form 4');
      expect(embed.description).toContain('Company: Apple Inc');
    });
  });

  // ── Trading Halt template tests ───────────────────────────────

  describe('trading-halt template', () => {
    function makeHaltAlert(overrides?: Partial<AlertEvent>): AlertEvent {
      return makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'trading-halt',
          type: 'halt',
          title: 'MRLN — Trading HALTED',
          body: 'Trading halted pending news',
          timestamp: new Date('2024-01-15T10:32:00Z'),
          metadata: {
            ticker: 'MRLN',
            haltReasonCode: 'T1',
            haltReasonDescription: 'News Pending',
            haltTime: '10:32 AM ET',
            market: 'NYSE',
            event_price: 45.20,
          },
        },
        ticker: 'MRLN',
        enrichment: {
          summary: 'Trading halted for news pending',
          impact: 'Trading halts for news pending average -8% on resume. 12 similar cases, 75% moved in predicted direction.',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'MRLN', direction: 'bearish' }],
        },
        classificationConfidence: 0.8,
        ...overrides,
      });
    }

    it('includes Trading Halt header with market', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeHaltAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('🔒 Trading Halt · NYSE · NOW');
    });

    it('includes halt reason with code', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeHaltAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('⏸ Reason: News Pending (T1)');
    });

    it('includes halt time', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeHaltAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('⏱ Halted at: 10:32 AM ET');
    });

    it('includes last price from event_price metadata', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeHaltAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📊 Last price: $45.20');
    });

    it('includes resume time when available', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeHaltAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'trading-halt',
            type: 'halt',
            title: 'MRLN — Trading HALTED',
            body: 'Trading halted',
            timestamp: new Date('2024-01-15T10:32:00Z'),
            metadata: {
              haltReasonCode: 'T1',
              haltReasonDescription: 'News Pending',
              haltTime: '10:32 AM ET',
              resumeTime: '11:15 AM ET',
              market: 'NYSE',
            },
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('▶️ Resume: 11:15 AM ET');
    });

    it('shows LULD indicator when isLULD is true', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeHaltAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'trading-halt',
            type: 'halt',
            title: 'TEST — Trading HALTED',
            body: 'LULD halt',
            timestamp: new Date('2024-01-15T10:32:00Z'),
            metadata: {
              haltReasonCode: 'LUDP',
              haltTime: '10:32 AM ET',
              isLULD: true,
              market: 'NASDAQ',
            },
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('⚡ LULD Circuit Breaker');
    });

    it('includes direction badge', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeHaltAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('▼ BEARISH');
    });

    it('uses "What typically happens" for impact', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeHaltAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**What typically happens:**');
      expect(embed.description).toContain('average -8% on resume');
    });

    it('renders resume events with RESUMED header and resume time', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeHaltAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'trading-halt',
            type: 'resume',
            title: 'MRLN trading RESUMED',
            body: 'MRLN on NYSE resumed trading at 11:15 AM ET.',
            timestamp: new Date('2024-01-15T11:15:00Z'),
            metadata: {
              ticker: 'MRLN',
              haltReasonCode: 'T1',
              haltReasonDescription: 'News Pending',
              haltTime: '10:32 AM ET',
              resumeTime: '11:15 AM ET',
              market: 'NYSE',
            },
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('🔓 Trading Resumed · NYSE · 11:15 AM ET');
      expect(embed.description).not.toContain('🔒 Trading Halt');
      expect(embed.description).toContain('▶️ Resumed at: 11:15 AM ET');
    });
  });

  // ── Economic Data template tests ──────────────────────────────

  describe('econ-calendar template', () => {
    function makeEconAlert(overrides?: Partial<AlertEvent>): AlertEvent {
      return makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'econ-calendar',
          type: 'economic-release',
          title: 'Non-Farm Payrolls — Data Released',
          body: 'Non-Farm Payrolls data has been released. Check official source for actual values.',
          timestamp: new Date('2024-01-15T13:30:00Z'),
          metadata: {
            indicator: 'nfp',
            indicator_name: 'Non-Farm Payrolls',
            scheduled_time: '2024-01-15T13:30:00.000Z',
            frequency: 'monthly',
            tags: ['employment', 'fed-watch'],
          },
        },
        enrichment: {
          summary: 'Stronger than expected jobs report',
          impact: 'Stronger-than-expected jobs data supports Fed hawkish stance. Bond yields likely to rise, growth stocks may face pressure.',
          action: '🔴 High-Quality Setup',
          tickers: [{ symbol: 'SPY', direction: 'bullish' }],
        },
        classificationConfidence: 0.75,
        ...overrides,
      });
    }

    it('includes Economic Data header', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📊 Economic Data');
    });

    it('shows indicator name', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📋 Indicator: Non-Farm Payrolls');
    });

    it('shows scheduled time', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('⏱ Scheduled:');
    });

    it('shows frequency', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('🔄 Frequency: monthly');
    });

    it('shows tags', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('🏷️ Tags: employment, fed-watch');
    });

    it('uses "Market impact" instead of "Why it matters"', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**Market impact:**');
      expect(embed.description).not.toContain('**Why it matters:**');
      expect(embed.description).toContain('Fed hawkish stance');
    });

    it('includes direction badge', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeEconAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('▲ BULLISH');
    });

    it('handles missing optional metadata gracefully', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(
        makeEconAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'econ-calendar',
            type: 'economic-release-upcoming',
            title: 'FOMC Rate Decision — releasing in 15 min',
            body: 'FOMC Rate Decision is scheduled for release.',
            timestamp: new Date('2024-01-15T14:00:00Z'),
            metadata: {
              indicator: 'fomc',
              indicator_name: 'FOMC Rate Decision',
            },
          },
        }),
      );

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📋 Indicator: FOMC Rate Decision');
      // No frequency or tags when not provided
      expect(embed.description).not.toContain('🔄 Frequency');
      expect(embed.description).not.toContain('🏷️ Tags');
    });
  });

  // ── Social template tests ─────────────────────────────────────

  describe('social template (reddit/stocktwits)', () => {
    function makeStocktwitsAlert(overrides?: Partial<AlertEvent>): AlertEvent {
      return makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'stocktwits',
          type: 'social-volume',
          title: 'PLTR StockTwits volume spike (847 vs 200)',
          body: 'StockTwits message volume for PLTR spiked to 847 (previous: 200). Sentiment ratio: 1.35.',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          metadata: {
            ticker: 'PLTR',
            tickers: ['PLTR'],
            current_volume: 847,
            previous_volume: 200,
            ratio: 1.35,
            event_subtype: 'volume-spike',
          },
        },
        ticker: 'PLTR',
        enrichment: {
          summary: 'Social volume spike',
          impact: 'Social volume spike often precedes short-term momentum. Historical accuracy: 48%.',
          action: '🟡 Monitor',
          tickers: [{ symbol: 'PLTR', direction: 'bullish' }],
        },
        ...overrides,
      });
    }

    function makeRedditAlert(overrides?: Partial<AlertEvent>): AlertEvent {
      return makeAlert({
        event: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          source: 'reddit',
          type: 'reddit_trending',
          title: 'PLTR trending on r/wallstreetbets',
          body: 'PLTR is seeing unusual engagement on Reddit',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          metadata: {
            subreddit: 'wallstreetbets',
            upvotes: 1523,
            comments: 342,
            high_engagement: true,
            ticker: 'PLTR',
            tickers: ['PLTR'],
            author: 'test_user',
          },
        },
        ticker: 'PLTR',
        enrichment: {
          summary: 'Reddit trending post',
          impact: 'Social volume spike often precedes short-term momentum. Historical accuracy: 48%.',
          action: '🟡 Monitor',
          tickers: [{ symbol: 'PLTR', direction: 'bullish' }],
        },
        ...overrides,
      });
    }

    it('includes Social Buzz header with StockTwits platform', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeStocktwitsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('💬 Social Buzz · StockTwits');
    });

    it('includes Social Buzz header with Reddit platform', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeRedditAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('💬 Social Buzz · Reddit');
    });

    it('shows StockTwits volume with current and previous', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeStocktwitsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('🔥 Volume: 847 messages (prev: 200)');
    });

    it('shows StockTwits sentiment ratio', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeStocktwitsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('📈 Sentiment ratio: 1.35');
    });

    it('shows Reddit upvotes and comments', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeRedditAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('⬆️ Upvotes: 1523');
      expect(embed.description).toContain('💬 Comments: 342');
    });

    it('shows Reddit high engagement indicator', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeRedditAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('🔥 High engagement');
    });

    it('uses "Speculative" confidence label', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeRedditAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('▲ BULLISH · Speculative');
    });

    it('uses "Context" instead of "Why it matters"', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      await webhook.send(makeStocktwitsAlert());

      const embed = getEmbedFromLastCall(fetchSpy);
      expect(embed.description).toContain('**Context:**');
      expect(embed.description).not.toContain('**Why it matters:**');
      expect(embed.description).toContain('Historical accuracy: 48%');
    });
  });

  // ── Template produces valid Discord embed ─────────────────────

  describe('embed size limits', () => {
    it('all templates produce descriptions under 2048 chars', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });
      const longImpact = 'x'.repeat(2000);

      const sources = [
        { source: 'breaking-news', type: 'news' },
        { source: 'sec-edgar', type: '8-K' },
        { source: 'trading-halt', type: 'halt' },
        { source: 'econ-calendar', type: 'economic_data' },
        { source: 'reddit', type: 'social_volume_spike' },
        { source: 'analyst', type: 'upgrade' },
      ];

      for (const { source, type } of sources) {
        await webhook.send(
          makeAlert({
            event: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              source,
              type,
              title: 'Test title',
              body: 'Test body '.repeat(200),
              timestamp: new Date('2024-01-15T10:00:00Z'),
              metadata: {},
            },
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
      }
    });

    it('total embed size stays under 6000 chars', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          deliveryTier: 'critical',
          enrichment: {
            summary: 'S'.repeat(200),
            impact: 'I'.repeat(500),
            risks: 'R'.repeat(500),
            action: '🔴 High-Quality Setup',
            tickers: [
              { symbol: 'AAPL', direction: 'bearish' },
              { symbol: 'MSFT', direction: 'bearish' },
              { symbol: 'GOOG', direction: 'bearish' },
            ],
          },
          confirmationCount: 3,
          confirmedSources: ['sec-edgar', 'breaking-news', 'analyst'],
          historicalContext: {
            matchCount: 15,
            confidence: 'high',
            avgAlphaT5: 0.05,
            avgAlphaT20: 0.1,
            winRateT20: 80,
            medianAlphaT20: 0.09,
            topMatches: [
              { ticker: 'AAPL', headline: 'H'.repeat(100), source: 'test', eventDate: '2024-01-01', alphaT20: 0.15, score: 12 },
            ],
            patternSummary: 'P'.repeat(200),
          },
        }),
      );

      const [, options] = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
      const payload = JSON.parse(options.body as string);
      const embed = payload.embeds[0];

      const totalSize =
        (embed.title?.length ?? 0) +
        (embed.description?.length ?? 0) +
        (embed.fields ?? []).reduce(
          (sum: number, f: { name: string; value: string }) => sum + f.name.length + f.value.length,
          0,
        ) +
        (embed.footer?.text?.length ?? 0);

      expect(totalSize).toBeLessThanOrEqual(5500);
    });

    it('truncates description when fields push total over 5500', async () => {
      const webhook = new DiscordWebhook({ webhookUrl: 'https://example.com' });

      await webhook.send(
        makeAlert({
          event: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'breaking-news',
            type: 'news',
            title: 'T'.repeat(256),
            body: 'B'.repeat(2000),
            url: 'https://example.com/very-long-article',
            timestamp: new Date('2024-01-15T10:00:00Z'),
            metadata: { source_feed: 'CNBC' },
          },
          enrichment: {
            summary: 'S'.repeat(300),
            impact: 'I'.repeat(2000),
            risks: 'R'.repeat(500),
            action: '🔴 High-Quality Setup',
            tickers: [
              { symbol: 'AAPL', direction: 'bearish' },
              { symbol: 'MSFT', direction: 'bearish' },
            ],
          },
          deliveryTier: 'critical',
          confirmationCount: 3,
          confirmedSources: ['breaking-news', 'analyst', 'sec-edgar'],
        }),
      );

      const [, options] = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
      const payload = JSON.parse(options.body as string);
      const embed = payload.embeds[0];

      const totalSize =
        (embed.title?.length ?? 0) +
        (embed.description?.length ?? 0) +
        (embed.fields ?? []).reduce(
          (sum: number, f: { name: string; value: string }) => sum + f.name.length + f.value.length,
          0,
        ) +
        (embed.footer?.text?.length ?? 0);

      expect(totalSize).toBeLessThanOrEqual(5500);
    });
  });
});
