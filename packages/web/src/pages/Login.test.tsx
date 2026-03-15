import { screen } from '@testing-library/react';
import { renderWithRouter } from '../test/render.js';
import { Login } from './Login.js';

describe('Login page', () => {
  it('surfaces the value proposition above the sign-in card', async () => {
    renderWithRouter(
      [{ path: '/login', element: <Login /> }],
      ['/login'],
    );

    expect(await screen.findByText(/track market-moving events/i)).toBeInTheDocument();
    expect(screen.getByText(/get alerts that matter/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /sign in to event radar/i })).toBeInTheDocument();
  });
});
