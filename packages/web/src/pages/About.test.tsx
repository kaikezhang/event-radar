import { render, screen, within } from '@testing-library/react';
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
    expect(screen.getByText(/advanced language models/i)).toBeInTheDocument();
    expect(screen.getByText(/always verify with primary sources/i)).toBeInTheDocument();
    expect(screen.getByText(/hello@eventradar\.app/i)).toBeInTheDocument();
    expect(screen.queryByText(/gpt-4|gpt-4o|claude/i)).not.toBeInTheDocument();
  });

  it('lists only the active source set shown by the product', () => {
    render(<About />);

    const dataSourcesSection = screen.getByRole('heading', { name: /data sources/i }).closest('section');
    expect(dataSourcesSection).not.toBeNull();
    const items = within(dataSourcesSection as HTMLElement).getAllByRole('listitem');

    expect(items).toHaveLength(13);
    expect(within(dataSourcesSection as HTMLElement).getByText(/sec edgar/i)).toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).getByText(/newswire/i)).toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).queryByText(/doj/i)).not.toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).queryByText(/congress/i)).not.toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).queryByText(/short interest/i)).not.toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).queryByText(/unusual options/i)).not.toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).queryByText(/analyst/i)).not.toBeInTheDocument();
    expect(within(dataSourcesSection as HTMLElement).queryByText(/^ftc$/i)).not.toBeInTheDocument();
  });
});
