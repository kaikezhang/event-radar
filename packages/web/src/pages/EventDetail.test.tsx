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

    const whatHappened = await screen.findByRole('heading', { name: /what happened/i });
    const whyNow = screen.getByRole('heading', { name: /why this matters now/i });
    const whyNotified = screen.getByRole('heading', { name: /why you were notified/i });
    const trust = screen.getByRole('heading', { name: /trust and verification/i });

    expect(whatHappened.compareDocumentPosition(whyNow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(whyNow.compareDocumentPosition(whyNotified)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(whyNotified.compareDocumentPosition(trust)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders the detail sections for the selected event', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /what happened/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /market context/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /historical pattern/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /similar events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByText(/not investment advice/i)).toBeInTheDocument();
  });

  it('surfaces why the alert matters now near the top of the page', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: /why this matters now/i })).toBeInTheDocument();
    expect(screen.getByText(/export controls may pressure near-term demand expectations/i)).toBeInTheDocument();
  });

  it('explains why the user was notified with alert metadata', async () => {
    renderDetail();

    const heading = await screen.findByRole('heading', { name: /why you were notified/i });
    const section = heading.closest('section');

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/high severity/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/^sec filing$/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/^nvda$/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/fade the headline/i)).toBeInTheDocument();
  });

  it('renders the original source link', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view original source/i })).toBeInTheDocument();
    });
  });

  it('renders the trust block when scorecard data is available', async () => {
    renderDetail();

    const heading = await screen.findByRole('heading', { name: /trust and verification/i });
    const section = heading.closest('section');

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
});
