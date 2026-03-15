import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetail } from './EventDetail.js';
import { renderWithRouter } from '../test/render.js';

describe('EventDetail page', () => {
  function renderDetail() {
    return renderWithRouter(
      [{ path: '/event/:id', element: <EventDetail /> }],
      ['/event/evt-critical-nvda-1'],
    );
  }

  it('renders the quick-read navigation for alert-driven landings', async () => {
    renderDetail();

    const quickLinks = await screen.findByRole('navigation', { name: /event detail quick links/i });

    expect(within(quickLinks).getByRole('link', { name: /what happened/i })).toHaveAttribute('href', '#what-happened');
    expect(within(quickLinks).getByRole('link', { name: /why this matters now/i })).toHaveAttribute('href', '#why-now');
    expect(within(quickLinks).getByRole('link', { name: /why you were notified/i })).toHaveAttribute('href', '#why-notified');
    expect(within(quickLinks).getByRole('link', { name: /trust check/i })).toHaveAttribute('href', '#trust-check');
  });

  it('renders the top-level sections in alert-consumption order', async () => {
    renderDetail();

    const whatHappened = await screen.findByRole('button', { name: /what happened/i });
    const whyNow = screen.getByRole('button', { name: /why now/i });
    const whyNotified = screen.getByRole('button', { name: /why notified/i });
    const trust = screen.getByRole('button', { name: /trust/i });

    expect(whatHappened.compareDocumentPosition(whyNow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(whyNow.compareDocumentPosition(whyNotified)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(whyNotified.compareDocumentPosition(trust)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders the detail sections for the selected event', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /what happened/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /market context/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /historical pattern/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /similar events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disclaimer/i })).toBeInTheDocument();
  });

  it('surfaces why the alert matters now near the top of the page', async () => {
    renderDetail();

    expect(await screen.findByRole('button', { name: /why now/i })).toBeInTheDocument();
    expect(screen.getByText(/export controls may pressure near-term demand expectations/i)).toBeInTheDocument();
  });

  it('explains why the user was notified with alert metadata', async () => {
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /why notified/i });
    const section = toggle.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/high severity/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/^sec filing$/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/^nvda$/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/fade the headline/i)).toBeInTheDocument();
  });

  it('renders the original source link', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /view original source/i }).length).toBeGreaterThan(0);
    });
  });

  it('renders provenance details for confirmed events', async () => {
    renderDetail();

    const heading = await screen.findByRole('heading', { name: /provenance/i });
    const section = heading.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/confirmed by 3 sources/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getAllByText(/pr newswire/i).length).toBeGreaterThan(0);
    expect(within(section as HTMLElement).getAllByText(/1m later/i).length).toBeGreaterThan(0);
    expect(within(section as HTMLElement).getAllByText(/reuters/i).length).toBeGreaterThan(0);
  });

  it('renders the trust block when scorecard data is available', async () => {
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /trust/i });
    const section = toggle.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getAllByText(/fade the headline/i).length).toBeGreaterThan(0);
    expect(within(section as HTMLElement).getByText(/^correct$/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/^worked$/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/-5\.05%/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getAllByText(/-10\.10%/i).length).toBeGreaterThan(0);
    expect(within(section as HTMLElement).getByText(/used t\+20 as the primary verdict window/i)).toBeInTheDocument();
  });

  it('adds trust interpretation copy for new arrivals', async () => {
    renderDetail();

    expect(await screen.findByText(/direction verdict shows whether price followed the alert call/i)).toBeInTheDocument();
    expect(screen.getByText(/setup verdict reflects whether the trade setup actually worked/i)).toBeInTheDocument();
  });

  it('keeps market context details available after the landing summary', async () => {
    renderDetail();

    const marketHeading = await screen.findByRole('heading', { name: /market context/i });
    const marketSection = marketHeading.closest('section');

    expect(marketSection).not.toBeNull();
    expect(within(marketSection as HTMLElement).getByText(/^bearish$/i)).toBeInTheDocument();
  });

  it('keeps historical analog context available for follow-up reading', async () => {
    renderDetail();

    const historicalHeading = await screen.findByRole('heading', { name: /historical pattern/i });
    const historicalSection = historicalHeading.closest('section');

    expect(historicalSection).not.toBeNull();
    expect(within(historicalSection as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(historicalSection as HTMLElement).getByText(/medium confidence/i)).toBeInTheDocument();
  });

  it('renders similar events to support trust and pattern checks', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: /similar events/i })).toBeInTheDocument();
    expect(screen.getByText(/prior nvda export disclosure/i)).toBeInTheDocument();
    expect(screen.getByText(/semiconductor filing highlights china demand risk/i)).toBeInTheDocument();
  });

  it('renders the alert title and source in the hero card', async () => {
    renderDetail();

    const title = await screen.findByRole('heading', { name: /nvda export filing flags china exposure risk/i });
    const heroSection = title.closest('section');

    expect(heroSection).not.toBeNull();
    expect(within(heroSection as HTMLElement).getByText(/^sec filing$/i)).toBeInTheDocument();
  });

  it('sends direct notification landings back to the watchlist when there is no in-app history', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(
      [
        { path: '/event/:id', element: <EventDetail /> },
        { path: '/watchlist', element: <div>Watchlist route</div> },
      ],
      ['/event/evt-critical-nvda-1'],
    );

    await user.click(await screen.findByRole('button', { name: /back to watchlist/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/watchlist');
    });
  });

  it('renders the "Why this alert" provenance section with source and filter path', async () => {
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /why this alert/i });
    const section = toggle.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/sec filing/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getAllByText(/filter path/i).length).toBeGreaterThan(0);
    expect(within(section as HTMLElement).getByText(/l2 llm judge \(confidence 0\.82\)/i)).toBeInTheDocument();
  });

  it('shows "Also reported by" in the provenance section when confirmation count > 1', async () => {
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /why this alert/i });
    const section = toggle.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/also reported by/i)).toBeInTheDocument();
  });

  it('shows classification confidence in the provenance section', async () => {
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /why this alert/i });
    const section = toggle.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/82%/)).toBeInTheDocument();
  });

  it('renders the "Why this alert" quick link in navigation', async () => {
    renderDetail();

    const quickLinks = await screen.findByRole('navigation', { name: /event detail quick links/i });
    expect(within(quickLinks).getByRole('link', { name: /why this alert/i })).toHaveAttribute('href', '#why-this-alert');
  });

  it('keeps normal back navigation when the detail page was opened inside the app', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(
      [
        { path: '/', element: <div>Feed route</div> },
        { path: '/event/:id', element: <EventDetail /> },
      ],
      ['/', '/event/evt-critical-nvda-1'],
    );

    await user.click(await screen.findByRole('button', { name: /^back$/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('lets readers collapse and re-open the primary explainer sections', async () => {
    const user = userEvent.setup();
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /what happened/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/nvidia corporation flagged heightened export exposure/i)).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/nvidia corporation flagged heightened export exposure/i)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/nvidia corporation flagged heightened export exposure/i)).toBeInTheDocument();
  });

  it('moves feedback directly below the why-now section', async () => {
    renderDetail();

    const whyNowToggle = await screen.findByRole('button', { name: /why now/i });
    const feedbackHeading = screen.getByRole('heading', { name: /was this useful/i });
    const whyNotifiedToggle = screen.getByRole('button', { name: /why notified/i });

    expect(whyNowToggle.compareDocumentPosition(feedbackHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(feedbackHeading.compareDocumentPosition(whyNotifiedToggle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('keeps the disclaimer collapsed by default', async () => {
    const user = userEvent.setup();
    renderDetail();

    const disclaimerToggle = await screen.findByRole('button', { name: /disclaimer/i });
    expect(disclaimerToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/consult a qualified financial advisor/i)).not.toBeInTheDocument();

    await user.click(disclaimerToggle);
    expect(disclaimerToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/consult a qualified financial advisor/i)).toBeInTheDocument();
  });
});
