import { screen, waitFor } from '@testing-library/react';
import { EventDetail } from './EventDetail.js';
import { renderWithRouter } from '../test/render.js';

describe('EventDetail page', () => {
  it('renders the detail sections for the selected event', async () => {
    renderWithRouter([{ path: '/event/:id', element: <EventDetail /> }], ['/event/evt-critical-nvda-1']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /market context/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /historical pattern/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /similar events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByText(/not investment advice/i)).toBeInTheDocument();
  });

  it('renders the original source link', async () => {
    renderWithRouter([{ path: '/event/:id', element: <EventDetail /> }], ['/event/evt-critical-nvda-1']);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view original source/i })).toBeInTheDocument();
    });
  });

  it('renders the trust block when scorecard data is available', async () => {
    renderWithRouter([{ path: '/event/:id', element: <EventDetail /> }], ['/event/evt-critical-nvda-1']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /trust and verification/i })).toBeInTheDocument();
    });

    expect(screen.getAllByText(/fade the headline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/correct/i)).toBeInTheDocument();
    expect(screen.getByText(/worked/i)).toBeInTheDocument();
    expect(screen.getByText(/-5\.05%/i)).toBeInTheDocument();
    expect(screen.getAllByText(/-10\.10%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/used t\+20 as the primary verdict window/i)).toBeInTheDocument();
  });
});
