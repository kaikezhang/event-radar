import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistory } from './useHistory.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useHistory', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events') {
        return jsonResponse({
          data: [
            {
              id: 'evt-1',
              severity: 'HIGH',
              source: 'sec-edgar',
              title: 'History alert',
              summary: 'History summary',
              receivedAt: '2026-03-12T20:05:00.000Z',
              metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
            },
          ],
          total: 1,
        });
      }

      if (url.pathname === '/api/events/sources') {
        return jsonResponse({ sources: ['dummy', 'sec-edgar'] });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    });

    vi.stubGlobal('fetch', fetchMock as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads history without a saved severity preference', async () => {
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.alerts).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/events?limit=50&offset=0', expect.any(Object));
  });

  it('starts with the first page and reports when more items are available', async () => {
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.total).toBe(1);
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('requests the next page when loadMore is called', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events') {
        const offset = url.searchParams.get('offset');
        return jsonResponse({
          data: [
            {
              id: offset === '50' ? 'evt-2' : 'evt-1',
              severity: 'HIGH',
              source: 'sec-edgar',
              title: 'History alert',
              summary: 'History summary',
              receivedAt: '2026-03-12T20:05:00.000Z',
              metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
            },
          ],
          total: 100,
        });
      }

      if (url.pathname === '/api/events/sources') {
        return jsonResponse({ sources: ['dummy', 'sec-edgar'] });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    });

    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.alerts.map((alert) => alert.id)).toEqual(['evt-1', 'evt-2']);
    });
  });
});
