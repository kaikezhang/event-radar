import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { Footer } from './Footer.js';

describe('Footer', () => {
  it('renders the stripped-down beta disclaimer', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    expect(screen.getByText(/event radar beta\. not financial advice\./i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
