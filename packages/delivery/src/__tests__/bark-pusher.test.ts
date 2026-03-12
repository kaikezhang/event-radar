import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BarkPusher } from '../bark-pusher.js';
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

describe('BarkPusher', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('should POST to the correct Bark URL with key', async () => {
    const pusher = new BarkPusher({
      key: 'test-device-key',
      serverUrl: 'https://bark.example.com',
    });

    await pusher.send(makeAlert());

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bark.example.com/test-device-key');
  });

  it('should use default server URL when not provided', async () => {
    const pusher = new BarkPusher({ key: 'my-key' });

    await pusher.send(makeAlert());

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.day.app/my-key');
  });

  it('should send title, body, level, and group in POST body', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(makeAlert({ severity: 'HIGH' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.title).toBe('8-K: Apple Inc. (AAPL)');
    expect(body.body).toBe('Item 5.02 Departure of CEO');
    expect(body.level).toBe('timeSensitive');
    expect(body.group).toBe('high');
  });

  it('should set level=critical and sound=alarm for CRITICAL alerts', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(makeAlert({ severity: 'CRITICAL' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.level).toBe('critical');
    expect(body.sound).toBe('alarm');
    expect(body.group).toBe('critical');
  });

  it('should NOT set sound for non-CRITICAL alerts', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(makeAlert({ severity: 'HIGH' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.sound).toBeUndefined();
  });

  it('should include url when event has one', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(makeAlert());

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.url).toBe('https://www.sec.gov/filing/123');
  });

  it('should omit url when event has none', async () => {
    const pusher = new BarkPusher({ key: 'k' });
    const alert = makeAlert();
    delete (alert.event as Record<string, unknown>).url;

    await pusher.send(alert);

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.url).toBeUndefined();
  });

  it('should use level=passive for LOW alerts', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(makeAlert({ severity: 'LOW' }));

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.level).toBe('passive');
  });

  it('should append historical pattern context to the Bark body', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(
      makeAlert({
        historicalContext: {
          matchCount: 18,
          confidence: 'medium',
          avgAlphaT5: 0.03,
          avgAlphaT20: 0.12,
          winRateT20: 68,
          medianAlphaT20: 0.1,
          bestCase: null,
          worstCase: null,
          topMatches: [],
          patternSummary:
            'Technology earnings beat in correction market: +12.0% avg alpha T+20, 68% win rate (18 cases)',
        },
      }),
    );

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    expect(body.body).toContain('Item 5.02 Departure of CEO');
    expect(body.body).toContain('📊 18 similar cases: +12.0% avg alpha, 68% win rate');
  });

  it('should throw on non-ok response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    const pusher = new BarkPusher({ key: 'k' });

    await expect(pusher.send(makeAlert())).rejects.toThrow(
      'Bark push failed (500): internal error',
    );
  });

  it('should strip trailing slash from server URL', async () => {
    const pusher = new BarkPusher({
      key: 'k',
      serverUrl: 'https://bark.example.com/',
    });

    await pusher.send(makeAlert());

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bark.example.com/k');
  });

  it('appends a short historical pattern summary to the body', async () => {
    const pusher = new BarkPusher({ key: 'k' });

    await pusher.send(
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
    const body = JSON.parse(options.body as string);

    expect(body.body).toContain('📊 18 similar cases: +12.0% avg alpha, 68% win rate');
  });
});
