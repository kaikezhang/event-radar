import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Overview } from './Overview.js';

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

describe('Overview', () => {
  beforeEach(() => {
    useDashboardMock.mockReturnValue({
      data: {
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
          total: 1,
          healthy: 1,
          degraded: 0,
          down: 0,
          details: [
            { name: 'sec-edgar', status: 'healthy', last_scan: '1m ago', error_count: 0 },
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
        delivery: {
          discord: { sent: 12, errors: 1 },
        },
        db: {
          total_events: 120,
          last_event: '20s ago',
        },
        alerts: [],
      },
      isLoading: false,
      error: null,
    });
    useHealthMock.mockReturnValue({
      data: {
        status: 'ok',
        version: '1.0.0',
        startedAt: '2026-03-13T11:00:00.000Z',
        uptimeSeconds: 3600,
        scanners: [],
        db: { status: 'connected' },
        lastEventTime: '2026-03-13T11:59:40.000Z',
        uptime: 3600,
      },
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it('renders the judge card inside the overview page', () => {
    render(<Overview />);

    expect(screen.getByText('Mock Judge Card')).toBeTruthy();
    expect(screen.getByText(/pipeline funnel/i)).toBeTruthy();
  });
});
