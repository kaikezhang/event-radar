import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { EventDetail } from './EventDetail.js';
import { renderWithRouter } from '../test/render.js';

const detailResponse = {
  data: {
    id: 'evt-critical-nvda-1',
    source: 'sec-edgar',
    title: 'NVDA export filing flags China exposure risk',
    summary: 'New export disclosures point to gross-margin pressure in Asia.',
    severity: 'CRITICAL',
    receivedAt: '2026-03-03T16:35:00.000Z',
    createdAt: '2026-03-03T16:35:00.000Z',
    metadata: {
      ticker: 'NVDA',
      url: 'https://sec.gov/Archives/nvda-export-risk',
      direction: 'bearish',
      impact: 'Higher export scrutiny could pressure data-center demand.',
    },
    sourceUrls: ['https://sec.gov/Archives/nvda-export-risk'],
  },
};

const similarEventsResponse = {
  data: [
    {
      title: '2023 AI chip shipment review',
      receivedAt: '2023-10-17T14:00:00.000Z',
    },
    {
      title: '2022 export restriction update',
      receivedAt: '2022-10-07T14:00:00.000Z',
    },
  ],
};

describe('EventDetail page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/api/events/evt-critical-nvda-1') {
        return {
          ok: true,
          status: 200,
          json: async () => detailResponse,
        } satisfies Partial<Response>;
      }

      if (url === '/api/events/evt-critical-nvda-1/similar') {
        return {
          ok: true,
          status: 200,
          json: async () => similarEventsResponse,
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

  it('renders the detail sections for the selected event', async () => {
    renderWithRouter([{ path: '/event/:id', element: <EventDetail /> }], ['/event/evt-critical-nvda-1']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /market context/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /historical pattern/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /similar events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('This is not financial advice'))).toBeInTheDocument();
  });

  it('renders the original source link', async () => {
    renderWithRouter([{ path: '/event/:id', element: <EventDetail /> }], ['/event/evt-critical-nvda-1']);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view original source/i })).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith('/api/events/evt-critical-nvda-1', {
      headers: { 'X-Api-Key': 'er-dev-2026' },
    });
  });
});
