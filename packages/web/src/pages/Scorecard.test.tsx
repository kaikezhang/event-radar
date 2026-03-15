import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary?days=90', {
      headers: { 'X-Api-Key': 'er-dev-2026' },
    });

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

    expect(screen.getByText('HIGH-QUALITY SETUP')).toBeInTheDocument();
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
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary', {
        headers: { 'X-Api-Key': 'er-dev-2026' },
      });
    });

    expect(screen.getByText('Full-history scorecard')).toBeInTheDocument();
  });
});
