import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventChart, buildEventMarkers } from './EventChart.js';
import { renderWithRouter } from '../test/render.js';
import type { AlertSummary } from '../types/index.js';

const chartMock = vi.hoisted(() => {
  let clickHandler: ((param: { time?: string | number }) => void) | undefined;
  const seriesApi = {
    setData: vi.fn(),
  };
  const chartApi = {
    addSeries: vi.fn(() => seriesApi),
    applyOptions: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
    subscribeClick: vi.fn((handler: (param: { time?: string | number }) => void) => {
      clickHandler = handler;
    }),
    unsubscribeClick: vi.fn(() => {
      clickHandler = undefined;
    }),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
    })),
  };
  const markersApi = {
    setMarkers: vi.fn(),
  };

  return {
    createChart: vi.fn(() => chartApi),
    createSeriesMarkers: vi.fn(() => markersApi),
    chartApi,
    seriesApi,
    markersApi,
    reset() {
      clickHandler = undefined;
      this.createChart.mockClear();
      this.createSeriesMarkers.mockClear();
      chartApi.addSeries.mockClear();
      chartApi.applyOptions.mockClear();
      chartApi.resize.mockClear();
      chartApi.remove.mockClear();
      chartApi.subscribeClick.mockClear();
      chartApi.unsubscribeClick.mockClear();
      chartApi.timeScale.mockClear();
      seriesApi.setData.mockClear();
      markersApi.setMarkers.mockClear();
    },
    triggerClick(param: { time?: string | number }) {
      clickHandler?.(param);
    },
  };
});

vi.mock('lightweight-charts', () => ({
  createChart: chartMock.createChart,
  createSeriesMarkers: chartMock.createSeriesMarkers,
  CandlestickSeries: Symbol('CandlestickSeries'),
}));

const events: AlertSummary[] = [
  {
    id: 'evt-critical-nvda-1',
    severity: 'HIGH',
    source: 'SEC Filing',
    title: 'NVDA export filing flags China exposure risk',
    summary: 'NVIDIA Corporation flagged heightened export exposure tied to China demand.',
    tickers: ['NVDA'],
    time: '2026-03-12T20:05:00.000Z',
    direction: 'bearish',
  },
  {
    id: 'evt-medium-nvda-2',
    severity: 'MEDIUM',
    source: 'Breaking News',
    title: 'NVDA supplier update points to data-center demand',
    summary: 'Follow-on alert for Nvidia demand trends.',
    tickers: ['NVDA'],
    time: '2026-03-11T18:00:00.000Z',
    direction: 'bullish',
  },
  {
    id: 'evt-low-nvda-3',
    severity: 'LOW',
    source: 'Analyst',
    title: 'Analyst reiterates hold into channel check',
    summary: 'Signal remains mixed.',
    tickers: ['NVDA'],
    time: '2026-03-09T12:00:00.000Z',
    direction: 'neutral',
  },
];

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

beforeEach(() => {
  chartMock.reset();
});

describe('buildEventMarkers', () => {
  it('maps bullish, bearish, and neutral events into marker styles', () => {
    const markers = buildEventMarkers(
      [
        { time: '2026-03-10', open: 118.2, high: 121.1, low: 117.4, close: 120.6, volume: 41000000 },
        { time: '2026-03-11', open: 120.6, high: 123.8, low: 119.7, close: 122.9, volume: 45200000 },
        { time: '2026-03-12', open: 122.9, high: 125.2, low: 121.9, close: 124.7, volume: 48700000 },
      ],
      events,
    );

    expect(markers.map((marker) => ({
      time: marker.time,
      shape: marker.shape,
      position: marker.position,
      color: marker.color,
    }))).toEqual([
      {
        time: '2026-03-12',
        shape: 'arrowDown',
        position: 'aboveBar',
        color: '#ef4444',
      },
      {
        time: '2026-03-11',
        shape: 'arrowUp',
        position: 'belowBar',
        color: '#22c55e',
      },
      {
        time: '2026-03-10',
        shape: 'circle',
        position: 'inBar',
        color: '#94a3b8',
      },
    ]);
  });

  it('pins events to the closest prior candle when the exact date is missing', () => {
    const markers = buildEventMarkers(
      [
        { time: '2026-03-06', open: 110, high: 112, low: 108, close: 111, volume: 1000 },
        { time: '2026-03-09', open: 111, high: 113, low: 109, close: 112, volume: 1100 },
      ],
      [
        {
          id: 'evt-weekend',
          severity: 'MEDIUM',
          source: 'Breaking News',
          title: 'Weekend policy rumor',
          summary: 'Weekend event.',
          tickers: ['NVDA'],
          time: '2026-03-08T09:00:00.000Z',
          direction: 'neutral',
        },
      ],
    );

    expect(markers).toHaveLength(1);
    expect(markers[0]?.time).toBe('2026-03-06');
  });
});

describe('EventChart', () => {
  function renderChart() {
    return renderWithRouter(
      [
        {
          path: '/ticker/:symbol',
          element: <EventChart symbol="NVDA" events={events} />,
        },
        {
          path: '/event/:id',
          element: <div>Event detail route</div>,
        },
      ],
      ['/ticker/NVDA'],
    );
  }

  it('renders the range selector and loads candlestick data into the chart', async () => {
    renderChart();

    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1W' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1Y' })).toBeInTheDocument();

    await waitFor(() => {
      expect(chartMock.createChart).toHaveBeenCalledTimes(1);
      expect(chartMock.seriesApi.setData).toHaveBeenCalledWith([
        {
          time: '2026-03-10',
          open: 118.2,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
        {
          time: '2026-03-11',
          open: 120.6,
          high: 123.8,
          low: 119.7,
          close: 122.9,
          volume: 45200000,
        },
        {
          time: '2026-03-12',
          open: 122.9,
          high: 125.2,
          low: 121.9,
          close: 124.7,
          volume: 48700000,
        },
      ]);
    });
  });

  it('shows a tooltip when a marker time is clicked', async () => {
    renderChart();

    await waitFor(() => {
      expect(chartMock.createSeriesMarkers).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      chartMock.triggerClick({ time: '2026-03-12' });
    });

    expect(await screen.findByRole('button', { name: /open event nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('navigates to the event detail page when the tooltip is clicked', async () => {
    renderChart();

    await waitFor(() => {
      expect(chartMock.createSeriesMarkers).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      chartMock.triggerClick({ time: '2026-03-12' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /open event nvda export filing flags china exposure risk/i }));

    expect(await screen.findByText('Event detail route')).toBeInTheDocument();
  });

  it('refetches data when the selected range changes', async () => {
    renderChart();

    await waitFor(() => {
      expect(chartMock.createChart).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '1Y' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute('aria-pressed', 'true');
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/price/NVDA?range=1y',
      expect.objectContaining({
        headers: { 'X-Api-Key': 'er-dev-2026' },
      }),
    );
  });
});
