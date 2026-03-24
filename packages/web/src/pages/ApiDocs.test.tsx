import { render, screen } from '@testing-library/react';
import { ApiDocs } from './ApiDocs.js';

describe('ApiDocs page', () => {
  it('renders the authentication section and health endpoint', () => {
    render(<ApiDocs />);

    expect(screen.getByRole('heading', { name: /api docs/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /authentication/i })).toBeInTheDocument();
    expect(screen.getAllByText(/x-api-key/i).length).toBeGreaterThan(0);
    expect(screen.getByText('/api/health')).toBeInTheDocument();
    expect(screen.getByText(/no auth required/i)).toBeInTheDocument();
  });

  it('shows request and response examples for documented endpoints', () => {
    render(<ApiDocs />);

    expect(screen.getAllByText(/example request/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/example response/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/curl -s http:\/\/localhost:3001\/api\/health/i)).toBeInTheDocument();
    expect(screen.getAllByText(/curl -s -H "x-api-key: er-dev-2026"/i).length).toBeGreaterThan(0);
  });

  it('lists endpoint query parameters and the requested catalog entries', () => {
    render(<ApiDocs />);

    expect(screen.getByText(/severity: string/i)).toBeInTheDocument();
    expect(screen.getAllByText(/limit: number/i).length).toBeGreaterThan(0);
    expect(screen.getByText('/api/events/:id')).toBeInTheDocument();
    expect(screen.getByText('/api/price/batch')).toBeInTheDocument();
    expect(screen.getByText('/api/watchlist')).toBeInTheDocument();
  });
});
