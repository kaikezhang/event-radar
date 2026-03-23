import { render, screen } from '@testing-library/react';
import { About } from './About.js';

describe('About page', () => {
  it('renders the trust and product information sections', () => {
    render(<About />);

    expect(screen.getByRole('heading', { name: /about event radar/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what is event radar\?/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /data sources/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ai disclosure/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /contact/i })).toBeInTheDocument();
    expect(screen.getByText(/sec edgar/i)).toBeInTheDocument();
    expect(screen.getByText(/always verify with primary sources/i)).toBeInTheDocument();
  });
});
