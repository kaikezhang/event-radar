import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { BottomNav } from './BottomNav.js';

describe('BottomNav', () => {
  it('renders five primary tabs without history or scorecard', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /feed/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /watchlist/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /history/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /scorecard/i })).not.toBeInTheDocument();
  });

  it('uses at least 12px labels for tab text', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /feed/i })).toHaveClass('text-xs');
  });

  it('marks the active route as current', () => {
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('aria-current', 'page');
  });
});
