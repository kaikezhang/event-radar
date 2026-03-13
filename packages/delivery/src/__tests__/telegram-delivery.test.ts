import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramDelivery } from '../telegram.js';
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

describe('TelegramDelivery', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);
  });

  const defaultConfig = {
    botToken: 'test-bot-token',
    chatId: '12345',
    minSeverity: 'LOW' as const,
    enabled: true,
    retryDelays: [0, 0, 0],
  };

  it('should format message with MarkdownV2 and correct emoji for CRITICAL', async () => {
    const telegram = new TelegramDelivery(defaultConfig);

    await telegram.send(makeAlert({ severity: 'CRITICAL' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.parse_mode).toBe('MarkdownV2');
    expect(payload.text).toContain('\u{1F534}'); // 🔴
    expect(payload.text).toContain('*CRITICAL*');
  });

  it('should format message with severity emoji prefix for each level', async () => {
    const telegram = new TelegramDelivery(defaultConfig);
    const emojis: Record<string, string> = {
      CRITICAL: '\u{1F534}',
      HIGH: '\u{1F7E0}',
      MEDIUM: '\u{1F7E1}',
      LOW: '\u{1F535}',
    };

    for (const [severity, emoji] of Object.entries(emojis)) {
      fetchSpy.mockClear();
      await telegram.send(
        makeAlert({ severity: severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' }),
      );
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(options.body as string);
      expect(payload.text).toContain(emoji);
    }
  });

  it('should add inline keyboard with filing URL', async () => {
    const telegram = new TelegramDelivery(defaultConfig);

    await telegram.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.reply_markup).toBeDefined();
    expect(payload.reply_markup.inline_keyboard).toHaveLength(1);
    expect(payload.reply_markup.inline_keyboard[0][0]).toEqual({
      text: 'View Filing',
      url: 'https://www.sec.gov/filing/123',
    });
  });

  it('should not include inline keyboard when event has no URL', async () => {
    const telegram = new TelegramDelivery(defaultConfig);
    const alert = makeAlert();
    (alert.event as { url?: string }).url = undefined;

    await telegram.send(alert);

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.reply_markup).toBeUndefined();
  });

  it('should respect minSeverity filter', async () => {
    const telegram = new TelegramDelivery({
      ...defaultConfig,
      minSeverity: 'HIGH',
    });

    await telegram.send(makeAlert({ severity: 'MEDIUM' }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should send events at or above minSeverity', async () => {
    const telegram = new TelegramDelivery({
      ...defaultConfig,
      minSeverity: 'HIGH',
    });

    await telegram.send(makeAlert({ severity: 'HIGH' }));
    expect(fetchSpy).toHaveBeenCalledOnce();

    fetchSpy.mockClear();
    await telegram.send(makeAlert({ severity: 'CRITICAL' }));
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('should POST to the correct Telegram API URL', async () => {
    const telegram = new TelegramDelivery(defaultConfig);

    await telegram.send(makeAlert());

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.telegram.org/bottest-bot-token/sendMessage',
    );
  });

  it('should retry on failure with exponential backoff', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error',
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '' });

    const telegram = new TelegramDelivery(defaultConfig);
    await telegram.send(makeAlert());

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should throw after all retries exhausted', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });

    const telegram = new TelegramDelivery(defaultConfig);

    await expect(telegram.send(makeAlert())).rejects.toThrow(
      'Telegram API failed (500)',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('should truncate body to 200 chars before escaping', async () => {
    const telegram = new TelegramDelivery(defaultConfig);
    const longBody = 'a'.repeat(300);
    const alert = makeAlert();
    (alert.event as { body: string }).body = longBody;

    await telegram.send(alert);

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    // The text should NOT contain the full 300-char string
    // Body was truncated to 200 chars (197 + "...") before markdown escaping
    // "..." becomes "\.\.\." after markdown escaping
    expect(payload.text).not.toContain('a'.repeat(300));
    expect(payload.text).toContain('\\.\\.\\.'); // escaped "..."
  });

  it('should include ticker, source, and timestamp in message', async () => {
    const telegram = new TelegramDelivery(defaultConfig);

    await telegram.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.text).toContain('`AAPL`');
    expect(payload.text).toContain('sec\\-edgar');
    expect(payload.text).toContain('2024-01-15T10:00:00.000Z');
  });

  it('should append historical context to the markdown body', async () => {
    const telegram = new TelegramDelivery(defaultConfig);

    await telegram.send(
      makeAlert({
        historicalContext: {
          matchCount: 18,
          confidence: 'medium',
          avgAlphaT5: 0.05,
          avgAlphaT20: 0.12,
          winRateT20: 68,
          medianAlphaT20: 0.1,
          bestCase: null,
          worstCase: null,
          topMatches: [],
          patternSummary: 'Technology earnings beat in correction: +12.0% avg alpha T+20, 68% win rate (18 cases)',
        },
      }),
    );

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.text).toContain('📊 18 similar cases \\(medium\\): avg alpha \\+12\\.0%, win rate 68%');
    expect(payload.text).toContain('Technology earnings beat in correction');
  });

  it('should not send when disabled', async () => {
    const telegram = new TelegramDelivery({
      ...defaultConfig,
      enabled: false,
    });

    await telegram.send(makeAlert());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
