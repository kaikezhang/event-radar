import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Overview } from './Overview.js';
import type { DashboardResponse, HealthResponse } from '../types/api.js';

const useDashboardMock = vi.fn();
const useHealthMock = vi.fn();

vi.mock('../hooks/queries.js', () => ({
  useDashboard: () => useDashboardMock(),
  useHealth: () => useHealthMock(),
  useScannerEvents: () => ({
    data: { events: [], count: 0, scanner: '' },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../components/JudgeCard.js', () => ({
  JudgeCard: () => <div>Mock Judge Card</div>,
}));

function makeDashboardData(overrides?: Partial<DashboardResponse>): DashboardResponse {
  return {
    system: {
      status: 'healthy',
      version: '1.0.0',
      uptime_seconds: 3600,
      started_at: '2026-03-13T11:00:00.000Z',
      grace_period_active: false,
      grace_period_suppressed: 0,
      db: 'connected',
      memory_mb: 256,
    },
    scanners: {
      total: 2,
      healthy: 2,
      degraded: 0,
      down: 0,
      details: [
        { name: 'sec-edgar', status: 'healthy', last_scan: '1m ago', error_count: 0 },
        { name: 'breaking-news', status: 'healthy', last_scan: '10s ago', error_count: 0 },
      ],
    },
    pipeline: {
      funnel: {
        ingested: 10,
        deduplicated: 1,
        unique: 9,
        filtered_out: 4,
        filter_passed: 5,
        delivered: 3,
      },
      filter_breakdown: {
        cooldown: 2,
        social_noise: 2,
      },
      conversion: '30.0%',
    },
    historical: {
      db_events: 120,
      enrichment: {
        hits: 80,
        misses: 20,
        timeouts: 5,
        hit_rate: '76%',
      },
      market_context: null,
    },
    regime: {
      score: 72,
      label: 'overbought',
      spy: 604.8,
      market_regime: 'bull',
      factors: {
        vix: { value: 13.2, zscore: -0.85 },
        spyRsi: { value: 68.4, signal: 'overbought' },
        spy52wPosition: { pctFromHigh: -1.1, pctFromLow: 23.7 },
        maSignal: { sma20: 604.2, sma50: 592.5, signal: 'golden_cross' },
        yieldCurve: { spread: 1.1, inverted: false },
      },
      amplification: {
        bullish: 0.7,
        bearish: 1.5,
      },
      updatedAt: '2026-03-13T12:00:00.000Z',
    },
    delivery_control: {
      enabled: true,
      last_operation_at: '2026-03-13T11:55:00.000Z',
      operator: 'api_key',
    },
    delivery: {
      discord: {
        sent: 12,
        errors: 1,
        last_success_at: '2026-03-13T11:58:00.000Z',
      },
      telegram: {
        sent: 4,
        errors: 0,
        last_success_at: null,
      },
    },
    db: {
      total_events: 120,
      last_event: '20s ago',
    },
    alerts: [],
    ...overrides,
  };
}

function makeHealthData(): HealthResponse {
  return {
    status: 'ok',
    version: '1.0.0',
    startedAt: '2026-03-13T11:00:00.000Z',
    uptimeSeconds: 3600,
    scanners: [
      {
        scanner: 'sec-edgar',
        status: 'healthy',
        lastScanAt: '2026-03-13T11:59:00.000Z',
        errorCount: 0,
      },
      {
        scanner: 'breaking-news',
        status: 'healthy',
        lastScanAt: '2026-03-13T11:59:50.000Z',
        errorCount: 0,
      },
    ],
    db: { status: 'connected' },
    lastEventTime: '2026-03-13T11:59:40.000Z',
    uptime: 3600,
  };
}

describe('Overview', () => {
  beforeEach(() => {
    useDashboardMock.mockReset();
    useHealthMock.mockReset();
    useDashboardMock.mockReturnValue({
      data: makeDashboardData(),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    useHealthMock.mockReturnValue({
      data: makeHealthData(),
      refetch: vi.fn(),
    });
    vi.unstubAllEnvs();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it('renders the judge, regime, and delivery control cards together', () => {
    render(<Overview />);

    expect(screen.getByText('Mock Judge Card')).toBeTruthy();
    expect(screen.getByText('Market Regime')).toBeTruthy();
    expect(screen.getByText('Delivery Control')).toBeTruthy();
    expect(screen.getByText(/pipeline funnel/i)).toBeTruthy();
  });

  it('renders the market regime card with badge, score, and key factors', () => {
    render(<Overview />);

    expect(screen.getByText('BULL')).toBeTruthy();
    expect(screen.getByText('72')).toBeTruthy();
    expect(screen.getByText(/VIX 13.2/i)).toBeTruthy();
    expect(screen.getByText(/SPY RSI 68.4/i)).toBeTruthy();
    expect(screen.getByText(/MA Cross golden_cross/i)).toBeTruthy();
    expect(screen.getByText(/Yield Curve 1.1%/i)).toBeTruthy();
  });

  it('shows all regime factors when expanded', async () => {
    const user = userEvent.setup();

    render(<Overview />);

    await user.click(screen.getByRole('button', { name: /show all factors/i }));

    expect(screen.getByText('SPY')).toBeTruthy();
    expect(screen.getByText('604.8')).toBeTruthy();
    expect(screen.getByText('Pct From High')).toBeTruthy();
    expect(screen.getByText('-1.1%')).toBeTruthy();
    expect(screen.getByText('Bullish Amp')).toBeTruthy();
    expect(screen.getByText('0.7x')).toBeTruthy();
    expect(screen.getByText('Bearish Amp')).toBeTruthy();
    expect(screen.getByText('1.5x')).toBeTruthy();
  });

  it('renders delivery control status and per-channel stats', () => {
    render(<Overview />);

    expect(screen.getByText(/Kill switch active/i)).toBeTruthy();
    expect(screen.getByText(/Last operator api_key/i)).toBeTruthy();
    expect(screen.getAllByText(/discord/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12 sent/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 errors/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/telegram/i).length).toBeGreaterThan(0);
  });

  it('calls resume with api key auth when the kill switch is active', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    localStorage.setItem('event-radar.api-key', 'dashboard-key');

    render(<Overview />);

    await user.click(screen.getByRole('button', { name: /resume delivery/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/delivery/resume'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'dashboard-key',
          }),
        }),
      );
    });
  });

  it('calls kill when delivery is active and an env api key is configured', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    vi.stubEnv('VITE_API_KEY', 'env-dashboard-key');
    useDashboardMock.mockReturnValue({
      data: makeDashboardData({
        delivery_control: {
          enabled: false,
          last_operation_at: '2026-03-13T11:55:00.000Z',
          operator: 'api_key',
        },
      }),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<Overview />);

    await user.click(screen.getByRole('button', { name: /pause delivery/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/delivery/kill'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'env-dashboard-key',
          }),
        }),
      );
    });
  });

  it('renders the neutral regime badge when the backend reports neutral', () => {
    const baseRegime = makeDashboardData().regime as NonNullable<DashboardResponse['regime']>;
    useDashboardMock.mockReturnValue({
      data: makeDashboardData({
        regime: {
          ...baseRegime,
          score: 10,
          market_regime: 'neutral',
        },
      }),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<Overview />);

    expect(screen.getByText('NEUTRAL')).toBeTruthy();
  });

  it('renders delivery stats even when delivery control metadata is omitted', () => {
    useDashboardMock.mockReturnValue({
      data: makeDashboardData({
        delivery_control: undefined,
      }),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<Overview />);

    expect(screen.getByText('Delivery Control')).toBeTruthy();
    expect(screen.getByText(/Delivery active/i)).toBeTruthy();
    expect(screen.getByText(/Add a valid API key to view kill switch state/i)).toBeTruthy();
  });
});
