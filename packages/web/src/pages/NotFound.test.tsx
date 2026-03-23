import { screen } from '@testing-library/react';
import { renderWithRouter } from '../test/render.js';
import { NotFound } from './NotFound.js';

describe('NotFound page', () => {
  it('renders a clear missing-page message with a feed link', () => {
    renderWithRouter(
      [{ path: '*', element: <NotFound /> }],
      ['/missing-page'],
    );

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText(/the page you're looking for doesn't exist/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to feed/i })).toHaveAttribute('href', '/');
  });
});
