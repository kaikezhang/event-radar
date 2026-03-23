import { render, screen } from '@testing-library/react';
import { EventEvidenceContent, EventSummaryContent } from './EventEnrichment.js';

describe('EventSummaryContent', () => {
  it('builds fallback bull and bear analysis for high-severity events when enrichment is missing', () => {
    render(
      <EventSummaryContent
        summary="Trump says a ceasefire deal could reduce immediate escalation risks in the region."
        enrichment={null}
        direction="bullish"
        severity="HIGH"
      />,
    );

    expect(screen.getByRole('heading', { name: /bull case vs bear case/i })).toBeInTheDocument();
    expect(screen.getByText(/if the event eases faster than expected/i)).toBeInTheDocument();
    expect(screen.getByText(/if the event proves temporary or incomplete/i)).toBeInTheDocument();
    expect(screen.queryByText(/analysis not available/i)).not.toBeInTheDocument();
  });

  it('uses fallback analysis when enrichment exists but has no structured bull or bear points', () => {
    render(
      <EventSummaryContent
        summary="The filing is real, but the model did not produce enough structured reasoning."
        enrichment={{
          summary: 'The filing is real, but the model did not produce enough structured reasoning.',
          impact: null,
          whyNow: null,
          currentSetup: null,
          historicalContext: null,
          risks: null,
          action: null,
          tickers: [],
          regimeContext: null,
        }}
        direction="neutral"
        severity="CRITICAL"
      />,
    );

    expect(screen.getByText(/if the event lands better than feared/i)).toBeInTheDocument();
    expect(screen.getByText(/if the event points to a deeper problem/i)).toBeInTheDocument();
  });
});

describe('EventEvidenceContent', () => {
  it('renders original source text with a neutral label when a raw excerpt exists', () => {
    render(
      <EventEvidenceContent
        enrichment={null}
        eventUrl="https://example.com/source"
        rawExcerpt="Original Truth Social post body."
        source="truth-social"
      />,
    );

    expect(screen.getByText(/original source text/i)).toBeInTheDocument();
    expect(screen.getByText(/original truth social post body\./i)).toBeInTheDocument();
  });

  it('uses sourceMetadata.sourceUrl when the event url is missing', () => {
    render(
      <EventEvidenceContent
        enrichment={null}
        eventUrl={null}
        rawExcerpt={null}
        source="truth-social"
        sourceMetadata={{ sourceUrl: 'https://truthsocial.com/@user/posts/123' }}
      />,
    );

    expect(screen.getByRole('link', { name: /source url/i })).toHaveAttribute(
      'href',
      'https://truthsocial.com/@user/posts/123',
    );
    expect(screen.queryByText(/source data not available/i)).not.toBeInTheDocument();
  });

  it('treats a breaking-news headline as evidence when no excerpt is available', () => {
    render(
      <EventEvidenceContent
        enrichment={null}
        eventUrl="https://example.com/news/headline"
        rawExcerpt={null}
        source="breaking-news"
        sourceMetadata={{ headline: 'Breaking headline confirms the catalyst', sourceUrl: 'https://example.com/news/headline' }}
      />,
    );

    expect(screen.getByText(/original source text/i)).toBeInTheDocument();
    expect(screen.getByText(/breaking headline confirms the catalyst/i)).toBeInTheDocument();
    expect(screen.queryByText(/source data not available/i)).not.toBeInTheDocument();
  });

  it('only shows the unavailable message when no source text or url exists', () => {
    render(
      <EventEvidenceContent
        enrichment={null}
        eventUrl={null}
        rawExcerpt={null}
        source="stocktwits"
      />,
    );

    expect(screen.getByText(/source data not available/i)).toBeInTheDocument();
  });
});
