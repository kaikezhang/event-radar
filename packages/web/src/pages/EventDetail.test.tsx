import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetail } from './EventDetail.js';
import { renderWithRouter } from '../test/render.js';

describe('EventDetail page', () => {
  function renderDetail(id = 'evt-critical-nvda-1') {
    return renderWithRouter(
      [{ path: '/event/:id', element: <EventDetail /> }],
      [`/event/${id}`],
    );
  }

  it('renders the alert title and severity in the hero section', async () => {
    renderDetail();

    const title = await screen.findByRole('heading', { name: /nvda export filing flags china exposure risk/i });
    const heroSection = title.closest('section');

    expect(heroSection).not.toBeNull();
    expect(within(heroSection as HTMLElement).getByText(/^sec filing$/i)).toBeInTheDocument();
  });

  it('renders the AI summary section', async () => {
    renderDetail();

    expect(await screen.findByText(/what happened/i)).toBeInTheDocument();
    expect(screen.getByText(/nvidia corporation flagged heightened export exposure/i)).toBeInTheDocument();
  });

  it('displays enrichment impact section', async () => {
    renderDetail();

    expect(await screen.findByText(/impact/i)).toBeInTheDocument();
    expect(screen.getByText(/export controls may pressure near-term demand expectations/i)).toBeInTheDocument();
  });

  it('displays enrichment why-now section', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/why this matters now/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/new export restrictions coincide with q1 guidance period/i)).toBeInTheDocument();
  });

  it('displays enrichment risks section', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/risks/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/regulatory escalation could further restrict chip sales/i)).toBeInTheDocument();
  });

  it('displays signal and tickers in the key fields grid', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByText(/developing/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/nvda/i).length).toBeGreaterThan(0);
  });

  it('renders the compact price context bar above the AI summary', async () => {
    renderDetail();

    expect(await screen.findByText(/\$178\.42/)).toBeInTheDocument();
    expect(screen.getByText(/\+2\.3% today/i)).toBeInTheDocument();
    expect(screen.getByText(/rsi 54/i)).toBeInTheDocument();
  });

  it('makes the signal badge more informative with a reason snippet', async () => {
    renderDetail();

    expect((await screen.findAllByText(/⚡ developing/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/nvda is losing momentum into resistance/i).length).toBeGreaterThan(0);
  });

  it('shows regime context instead of an unclear direction label for neutral signals', async () => {
    renderDetail('evt-neutral-regime-1');

    expect(await screen.findByText(/direction: risk-off tape is amplifying macro headlines/i)).toBeInTheDocument();
    expect(screen.queryByText(/unclear/i)).not.toBeInTheDocument();
  });

  it('falls back to awaiting market reaction when direction cannot be determined', async () => {
    renderDetail('evt-awaiting-reaction-1');

    expect(await screen.findByText(/direction: awaiting market reaction/i)).toBeInTheDocument();
  });

  it('displays filing items for SEC events', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/filing items/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/2\.01, 3\.01, 5\.02/)).toBeInTheDocument();
  });

  it('displays regime context', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByText(/regime context/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/correction market/i).length).toBeGreaterThan(0);
  });

  it('renders historical pattern with stats from metadata', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/historical pattern/i)).toBeInTheDocument();
    });
    expect(screen.getByText('251')).toBeInTheDocument();
    expect(screen.getByText(/-0\.6%/)).toBeInTheDocument();
    expect(screen.getAllByText(/-0\.4%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/46%/).length).toBeGreaterThan(0);
  });

  it('renders best and worst cases from historical context', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/smci/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/\+78\.3%/)).toBeInTheDocument();
    expect(screen.getByText(/unh/i)).toBeInTheDocument();
    expect(screen.getByText(/-35\.7%/)).toBeInTheDocument();
  });

  it('renders similar events', async () => {
    renderDetail();

    expect(await screen.findByText(/similar playbook/i)).toBeInTheDocument();
    expect(screen.getByText(/prior nvda export disclosure/i)).toBeInTheDocument();
    expect(screen.getByText(/semiconductor filing highlights china demand risk/i)).toBeInTheDocument();
  });

  it('shows the historical pattern summary line with T\\+20 and win-rate stats', async () => {
    renderDetail();

    expect(await screen.findByText(/251 similar events/i)).toBeInTheDocument();
    expect(screen.getByText(/avg move t\+20: -0\.4%/i)).toBeInTheDocument();
    expect(screen.getByText(/win rate: 46%/i)).toBeInTheDocument();
  });

  it('hides historical pattern and similar-event fallback blocks when no historical context exists', async () => {
    renderDetail('evt-low-sample-pattern');

    expect(screen.queryByRole('heading', { name: /historical pattern/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /similar playbook/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/not enough historical matches to show a reliable pattern yet/i)).not.toBeInTheDocument();
  });

  it('renders the trust block when scorecard data is available', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByText(/verification/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/fade the headline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^correct$/i)).toBeInTheDocument();
    expect(screen.getByText(/^worked$/i)).toBeInTheDocument();
    expect(screen.getByText(/-5\.05%/i)).toBeInTheDocument();
    expect(screen.getAllByText(/-10\.10%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/used t\+20 as the primary verdict window/i)).toBeInTheDocument();
  });

  it('renders feedback buttons', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
  });

  it('renders the original source link', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /view original source/i }).length).toBeGreaterThan(0);
    });
  });

  it('renders provenance details when expanded', async () => {
    const user = userEvent.setup();
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /why this alert/i });
    await user.click(toggle);

    const section = toggle.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/l2 llm judge \(confidence 0\.82\)/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/82%/)).toBeInTheDocument();
  });

  it('shows "Also reported by" in the provenance section', async () => {
    const user = userEvent.setup();
    renderDetail();

    const toggle = await screen.findByRole('button', { name: /why this alert/i });
    await user.click(toggle);

    const section = toggle.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/also reported by/i)).toBeInTheDocument();
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
