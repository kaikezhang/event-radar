import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing.js';

describe('Landing page', () => {
  it('renders the product headline and core marketing copy', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /event radar/i })).toBeInTheDocument();
    expect(screen.getByText(/ai-powered stock market event intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/truth social → market impact mapping/i)).toBeInTheDocument();
    expect(screen.getByText(/\$39\/month · 14-day free trial/i)).toBeInTheDocument();
  });

  it('links users to the live feed and trial start actions', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /see live feed/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /start free trial/i })).toHaveAttribute('href', '/login');
  });

  it('shows the pricing card on the landing page', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /trader/i })).toBeInTheDocument();
    expect(screen.getByText(/earnings calendar \+ historical outcomes/i)).toBeInTheDocument();
  });
});
