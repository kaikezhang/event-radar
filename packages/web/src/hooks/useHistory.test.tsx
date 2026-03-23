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
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
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
    }) as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to HIGH and CRITICAL severity on first load', async () => {
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.filters.severity).toBe('HIGH,CRITICAL');
    });
    expect(result.current.isDefaultSeverity).toBe(true);
  });

  it('restores a saved history severity preference from localStorage', async () => {
    localStorage.setItem('er-history-severity', 'LOW');

    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.filters.severity).toBe('LOW');
    });
    expect(result.current.isDefaultSeverity).toBe(false);
  });

  it('persists explicit severity changes to localStorage', async () => {
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.filters.severity).toBe('HIGH,CRITICAL');
    });

    act(() => {
      result.current.setFilter('severity', '');
    });

    await waitFor(() => {
      expect(localStorage.getItem('er-history-severity')).toBe('');
    });
  });
});
