import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PricingCard } from './PricingCard.js';

describe('PricingCard', () => {
  it('renders the trader plan details and default trial CTA', () => {
    render(
      <MemoryRouter>
        <PricingCard />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /trader/i })).toBeInTheDocument();
    expect(screen.getByText(/\$39\/month/i)).toBeInTheDocument();
    expect(screen.getByText(/full real-time feed \(13 sources\)/i)).toBeInTheDocument();
    expect(screen.getByText(/push alerts for critical watchlist events/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start 14-day free trial/i })).toHaveAttribute('href', '/login');
  });

  it('supports custom CTA href and label for reuse in settings or future flows', () => {
    render(
      <MemoryRouter>
        <PricingCard ctaHref="/billing" ctaLabel="Upgrade now" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /upgrade now/i })).toHaveAttribute('href', '/billing');
  });
});
