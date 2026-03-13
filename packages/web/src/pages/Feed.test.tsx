import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Feed } from './Feed.js';
import { renderWithRouter } from '../test/render.js';

const feedResponse = {
  events: [
    {
      id: 'evt-nvda',
      severity: 'HIGH',
      source: 'sec-edgar',
      title: 'NVDA export filing flags China exposure risk',
      tickers: ['NVDA'],
      summary: 'An SEC filing highlighted export exposure and supply-chain risk.',
      time: '2026-03-03T16:35:00.000Z',
    },
  ],
  cursor: null,
  total: 1,
};

describe('Feed page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/api/v1/feed?limit=50') {
        return {
          ok: true,
          status: 200,
          json: async () => feedResponse,
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

  it('shows skeleton cards while loading', () => {
    const { getAllByTestId } = renderWithRouter(
      [{ path: '/', element: <Feed /> }],
      ['/'],
    );

    expect(getAllByTestId('skeleton-card')).toHaveLength(5);
  });

  it('renders alert cards after the feed query resolves', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith('/api/v1/feed?limit=50', {
      headers: { 'X-Api-Key': 'er-dev-2026' },
    });
  });
});
