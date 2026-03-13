import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AlertCard } from './AlertCard.js';
import { mockAlerts } from '../mocks/alerts.js';

describe('AlertCard', () => {
  it('renders title, source, summary, and tickers', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={mockAlerts[0]} />
      </MemoryRouter>,
    );

    expect(screen.getByText(mockAlerts[0].title)).toBeInTheDocument();
    expect(screen.getByText(mockAlerts[0].source)).toBeInTheDocument();
    expect(screen.getByText(/\$NVDA/)).toBeInTheDocument();
    expect(screen.getByText(mockAlerts[0].summary)).toBeInTheDocument();
  });

  it('navigates to the detail page from the card body', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AlertCard alert={mockAlerts[1]} />} />
          <Route path="/event/:id" element={<div>Detail page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /open alert/i }));

    expect(screen.getByText('Detail page')).toBeInTheDocument();
  });
});
