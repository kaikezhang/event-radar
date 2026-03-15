import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithRouter } from '../test/render.js';
import { Scorecard } from './Scorecard.js';

describe('Scorecard page', () => {
  it('loads the 90 day summary by default and renders top-level metrics', async () => {
    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /scorecard/i })).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary?days=90',
      expect.objectContaining({ credentials: 'include' }),
    );

    expect(screen.getByText('Topline calibration')).toBeInTheDocument();
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('67.7%')).toBeInTheDocument();
    expect(screen.getByText('58.9%')).toBeInTheDocument();
    expect(screen.getByText('+4.3%')).toBeInTheDocument();
  });

  it('renders all required bucket sections', async () => {
    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    await waitFor(() => {
      expect(screen.getByText('Signal buckets')).toBeInTheDocument();
    });

    expect(screen.getByText('Confidence buckets')).toBeInTheDocument();
    expect(screen.getByText('Source buckets')).toBeInTheDocument();
    expect(screen.getByText('Event type buckets')).toBeInTheDocument();

    expect(screen.getByText('High-Quality Setup')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('SEC Filing')).toBeInTheDocument();
    expect(screen.getByText('sec form 8k')).toBeInTheDocument();
  });

  it('lets the user switch the summary window without overbuilding filters', async () => {
    const user = userEvent.setup();

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    const allButton = await screen.findByRole('button', { name: /all/i });
    await user.click(allButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    expect(screen.getByText('Full-history scorecard')).toBeInTheDocument();
  });

  it('shows card skeletons while the scorecard query is still loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(screen.getAllByTestId('scorecard-skeleton-card')).toHaveLength(4);
  });

  it('renders a more actionable error state when the summary request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(await screen.findByText(/scorecard data is taking a beat/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to live feed/i })).toHaveAttribute('href', '/');
  });
});
