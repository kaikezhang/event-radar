import { render, screen } from '@testing-library/react';
import { EventSourceCard } from './EventSourceCard.js';

describe('EventSourceCard', () => {
  it('renders SEC filing metadata with title, items, and source link', () => {
    render(
      <EventSourceCard
        source="sec-edgar"
        metadata={{
          formType: '8-K',
          companyName: 'NVIDIA Corporation',
          itemDescriptions: ['2.01 Completion of Acquisition', '5.02 Departure of Directors'],
          filingLink: 'https://example.com/sec-filing',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: /sec filing details/i })).toBeInTheDocument();
    expect(screen.getByText(/form type:/i)).toBeInTheDocument();
    expect(screen.getByText(/nvidia corporation/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.01 completion of acquisition/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view sec filing/i })).toHaveAttribute('href', 'https://example.com/sec-filing');
  });

  it('renders breaking-news metadata with source feed and article link', () => {
    render(
      <EventSourceCard
        source="breaking-news"
        metadata={{
          sourceFeed: 'Reuters',
          url: 'https://example.com/article',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: /news source/i })).toBeInTheDocument();
    expect(screen.getByText(/reuters/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view original article/i })).toHaveAttribute('href', 'https://example.com/article');
  });
});
