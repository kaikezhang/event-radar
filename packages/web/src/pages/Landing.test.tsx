import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing.js';
import { renderWithQuery } from '../test/render.js';

describe('Landing page', () => {
  it('renders the production hero headline and subhead', async () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /know what moves markets/i })).toBeInTheDocument();
    expect(screen.getByText(/ai-powered event detection across 13 real-time sources/i)).toBeInTheDocument();
  });

  it('links users to the live feed and trial start actions', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /see live feed/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /start free trial/i })).toHaveAttribute('href', '/login');
  });

  it('renders the four production feature cards', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /13 real-time sources/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ai classification/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /outcome tracking/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /earnings calendar/i })).toBeInTheDocument();
  });

  it('shows scorecard-backed social proof stats', async () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/24,000\+ events tracked/i)).toBeInTheDocument();
    expect(screen.getByText(/13 active data sources/i)).toBeInTheDocument();
    expect(screen.getByText(/79% setup-worked rate on trading halts/i)).toBeInTheDocument();
  });

  it('shows a visual product mockup for the live feed', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/event radar live feed preview/i)).toBeInTheDocument();
  });

  it('shows the pricing card and trial terms', () => {
    renderWithQuery(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /trader/i })).toBeInTheDocument();
    expect(screen.getByText(/14-day free trial\. no credit card required\./i)).toBeInTheDocument();
  });
});
