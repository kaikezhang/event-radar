import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing.js';
import { renderWithQuery } from '../test/render.js';

describe('Landing page', () => {
  it('renders a minimal signed-out hero with the product name and tagline', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /event radar/i })).toBeInTheDocument();
    expect(screen.getByText(/real-time event intelligence for traders who want the catalyst before the crowd/i)).toBeInTheDocument();
  });

  it('links users to sign in', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('keeps a single feature highlight instead of marketing sections', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByText(/single workflow for filings, macro, halts, and breaking headlines/i)).toBeInTheDocument();
  });

  it('does not render removed marketing preview, stats, or pricing content', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/event radar live feed preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/events tracked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pricing/i)).not.toBeInTheDocument();
  });
});
