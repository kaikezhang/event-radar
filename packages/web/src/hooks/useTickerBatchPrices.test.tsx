import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertSummary } from '../types/index.js';

const getTickerPricesBatchMock = vi.fn();

vi.mock('../lib/api.js', () => ({
  getTickerPricesBatch: (...args: unknown[]) => getTickerPricesBatchMock(...args),
}));

import { getViewportTickerSymbols, useTickerBatchPrices } from './useTickerBatchPrices.js';

function createAlert(id: string, ticker?: string): AlertSummary {
  return {
    id,
    severity: 'HIGH',
    source: 'sec-edgar',
    sourceKey: 'sec-edgar',
    title: `Alert ${id}`,
    summary: 'Test summary',
    tickers: ticker ? [ticker] : [],
    time: '2026-03-23T09:00:00.000Z',
    saved: false,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('getViewportTickerSymbols', () => {
  it('deduplicates primary tickers and caps to a viewport-sized batch', () => {
    const alerts = [
      createAlert('1', 'NVDA'),
      createAlert('2', 'TSLA'),
      createAlert('3', 'NVDA'),
      createAlert('4', 'AAPL'),
      createAlert('5', 'MSFT'),
      createAlert('6', 'AMD'),
      createAlert('7', 'META'),
      createAlert('8', 'AMZN'),
    ];

    expect(getViewportTickerSymbols(alerts, 0)).toEqual([
      'NVDA',
      'TSLA',
      'AAPL',
      'MSFT',
      'AMD',
    ]);
  });

  it('skips alerts that do not have a visible primary ticker', () => {
    const alerts = [
      createAlert('1'),
      createAlert('2', 'NVDA'),
      createAlert('3'),
      createAlert('4', 'TSLA'),
    ];

    expect(getViewportTickerSymbols(alerts, 0)).toEqual(['NVDA', 'TSLA']);
  });
});

describe('useTickerBatchPrices', () => {
  beforeEach(() => {
    getTickerPricesBatchMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads price quotes for viewport tickers', async () => {
    getTickerPricesBatchMock.mockResolvedValue({
      NVDA: { price: 178.5, change: 2.3, changePercent: 2.3 },
      TSLA: { price: 212.75, change: -3.4, changePercent: -3.4 },
    });

    const { result } = renderHook(
      () => useTickerBatchPrices([createAlert('1', 'NVDA'), createAlert('2', 'TSLA')], { viewportHeight: 0 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(getTickerPricesBatchMock).toHaveBeenCalledWith(['NVDA', 'TSLA']);
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        NVDA: { price: 178.5, change: 2.3, changePercent: 2.3 },
        TSLA: { price: 212.75, change: -3.4, changePercent: -3.4 },
      });
    });
  });

  it('gracefully returns an empty map when the batch request fails', async () => {
    getTickerPricesBatchMock.mockRejectedValue(new Error('batch failed'));

    const { result } = renderHook(
      () => useTickerBatchPrices([createAlert('1', 'NVDA')], { viewportHeight: 0 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(getTickerPricesBatchMock).toHaveBeenCalledWith(['NVDA']);
    });

    expect(result.current).toEqual({});
  });
});
