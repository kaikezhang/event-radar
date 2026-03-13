import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { BottomNav } from './BottomNav.js';

describe('BottomNav', () => {
  it('renders four primary tabs', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /feed/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /watchlist/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('marks the active route as current', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page');
  });
});
