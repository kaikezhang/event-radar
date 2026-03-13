import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { TickerProfile } from './TickerProfile.js';
import { renderWithRouter } from '../test/render.js';

const tickerResponse = {
  data: [
    {
      id: 'evt-nvda-1',
      source: 'sec-edgar',
      title: 'NVDA export filing flags China exposure risk',
      summary: 'An SEC filing highlighted export exposure and supply-chain risk.',
      severity: 'HIGH',
      receivedAt: '2026-03-03T16:35:00.000Z',
      createdAt: '2026-03-03T16:35:00.000Z',
      metadata: {
        ticker: 'NVDA',
      },
    },
    {
      id: 'evt-nvda-2',
      source: 'whitehouse',
      title: 'White House order tightens AI chip controls',
      summary: 'A new executive action widened AI chip export restrictions.',
      severity: 'CRITICAL',
      receivedAt: '2026-03-02T14:00:00.000Z',
      createdAt: '2026-03-02T14:00:00.000Z',
      metadata: {
        ticker: 'NVDA',
      },
    },
  ],
};

describe('TickerProfile page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/api/events?ticker=NVDA&limit=20') {
        return {
          ok: true,
          status: 200,
          json: async () => tickerResponse,
        } satisfies Partial<Response>;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found' }),
      } satisfies Partial<Response>;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the ticker heading and related alerts', async () => {
    renderWithRouter(
      [{ path: '/ticker/:symbol', element: <TickerProfile /> }],
      ['/ticker/NVDA'],
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /\$NVDA/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/2 events tracked/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /recent events for \$NVDA/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
  });

  it('shows the watchlist action and both related alerts', async () => {
    renderWithRouter(
      [{ path: '/ticker/:symbol', element: <TickerProfile /> }],
      ['/ticker/NVDA'],
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /watchlist/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /white house order tightens ai chip controls/i })).toBeInTheDocument();
  });
});
