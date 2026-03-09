import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookDelivery } from '../webhook.js';
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

describe('WebhookDelivery', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);
  });

  const defaultConfig = {
    url: 'https://example.com/webhook',
    secret: 'test-secret-key',
    minSeverity: 'LOW' as const,
    enabled: true,
    retryDelays: [0, 0, 0],
  };

  it('should send correct JSON payload', async () => {
    const webhook = new WebhookDelivery(defaultConfig);

    await webhook.send(makeAlert());

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/webhook');
    expect(options.method).toBe('POST');

    const payload = JSON.parse(options.body as string);
    expect(payload.event.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(payload.event.title).toBe('8-K: Apple Inc. (AAPL)');
    expect(payload.severity).toBe('HIGH');
    expect(payload.ticker).toBe('AAPL');
    expect(payload.deliveredAt).toBeDefined();
  });

  it('should generate valid HMAC-SHA256 signature', async () => {
    const webhook = new WebhookDelivery(defaultConfig);

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    const signature = headers['X-EventRadar-Signature'];
    const body = options.body as string;

    const expected = createHmac('sha256', 'test-secret-key')
      .update(body)
      .digest('hex');

    expect(signature).toBe(expected);
  });

  it('should include custom headers', async () => {
    const webhook = new WebhookDelivery({
      ...defaultConfig,
      headers: {
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer token123',
      },
    });

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;

    expect(headers['X-Custom-Header']).toBe('custom-value');
    expect(headers['Authorization']).toBe('Bearer token123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-EventRadar-Signature']).toBeDefined();
  });

  it('should retry on 5xx errors', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '' });

    const webhook = new WebhookDelivery(defaultConfig);
    await webhook.send(makeAlert());

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should throw after all retries exhausted', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });

    const webhook = new WebhookDelivery(defaultConfig);

    await expect(webhook.send(makeAlert())).rejects.toThrow(
      'Webhook failed (500)',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('should pass an AbortSignal with timeout to fetch', async () => {
    const webhook = new WebhookDelivery(defaultConfig);

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('should respect minSeverity filter', async () => {
    const webhook = new WebhookDelivery({
      ...defaultConfig,
      minSeverity: 'HIGH',
    });

    await webhook.send(makeAlert({ severity: 'MEDIUM' }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should not send when disabled', async () => {
    const webhook = new WebhookDelivery({
      ...defaultConfig,
      enabled: false,
    });

    await webhook.send(makeAlert());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should serialize event timestamp as ISO string', async () => {
    const webhook = new WebhookDelivery(defaultConfig);

    await webhook.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string);

    expect(payload.event.timestamp).toBe('2024-01-15T10:00:00.000Z');
  });
});
