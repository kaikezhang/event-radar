import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertSummary } from '../types/index.js';

const getFeedMock = vi.fn();
const playForSeverityMock = vi.fn();
let latestOnEvent: ((event: AlertSummary) => void) | undefined;

vi.mock('../lib/api.js', () => ({
  getFeed: (...args: unknown[]) => getFeedMock(...args),
}));

vi.mock('./useAlertSound.js', () => ({
  useAlertSound: () => ({
    playForSeverity: playForSeverityMock,
  }),
}));

vi.mock('./useWebSocket.js', () => ({
  useWebSocket: (options?: { onEvent?: (event: AlertSummary) => void }) => {
    latestOnEvent = options?.onEvent;
    return { status: 'connected' as const };
  },
}));

import { useAlerts } from './useAlerts.js';
import { ConnectionProvider } from '../contexts/ConnectionContext.js';

function createAlert(id: string): AlertSummary {
  return {
    id,
    severity: 'HIGH',
    source: 'SEC Filing',
    title: `Alert ${id}`,
    tickers: ['NVDA'],
    summary: 'Test alert summary',
    time: '2026-03-13T10:00:00.000Z',
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
        <ConnectionProvider>{children}</ConnectionProvider>
      </QueryClientProvider>
    );
  };
}

describe('useAlerts', () => {
  beforeEach(() => {
    getFeedMock.mockResolvedValue({
      alerts: [],
      cursor: null,
      total: 0,
    });
    playForSeverityMock.mockReset();
    latestOnEvent = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('plays a sound once for duplicate websocket events received before re-render', async () => {
    const { result } = renderHook(() => useAlerts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(getFeedMock).toHaveBeenCalledWith(50, { watchlist: false });
      expect(latestOnEvent).toBeTypeOf('function');
    });

    const alert = createAlert('evt-1');

    await act(async () => {
      latestOnEvent?.(alert);
      latestOnEvent?.(alert);
    });

    expect(playForSeverityMock).toHaveBeenCalledTimes(1);
    expect(playForSeverityMock).toHaveBeenCalledWith('HIGH');
    expect(result.current.alerts).toEqual([alert]);
  });
});
