import { render, screen } from '@testing-library/react';
import { ApiDocs } from './ApiDocs.js';

describe('ApiDocs page', () => {
  it('renders the API catalog and auth note', () => {
    render(<ApiDocs />);

    expect(screen.getByRole('heading', { name: /api docs/i })).toBeInTheDocument();
    expect(screen.getByText(/all endpoints require `x-api-key` header/i)).toBeInTheDocument();
    expect(screen.getByText('/api/v1/reports/weekly')).toBeInTheDocument();
    expect(screen.getByText('/health')).toBeInTheDocument();
  });

  it('shows example snippets as code blocks', () => {
    render(<ApiDocs />);

    expect(screen.getByText(/curl -H "x-api-key:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/"summary": \{/i).length).toBeGreaterThan(0);
  });

  it('lists the weekly report endpoint with markdown format support', () => {
    render(<ApiDocs />);

    expect(screen.getByText(/weekly scorecard report/i)).toBeInTheDocument();
    expect(screen.getAllByText(/format=markdown/i).length).toBeGreaterThan(0);
  });
});
