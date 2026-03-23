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

  async function openEvidenceTab() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /evidence/i }));
  }

  async function openTrustTab() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /trust/i }));
  }

  // ── Zone 1: Verdict ──────────────────────────────────────────────────────

  it('renders the alert title and severity in the hero section', async () => {
    renderDetail();

    const title = await screen.findByRole('heading', { name: /nvda export filing flags china exposure risk/i });
    const heroSection = title.closest('section');

    expect(heroSection).not.toBeNull();
    expect(within(heroSection as HTMLElement).getByText(/^sec filing$/i)).toBeInTheDocument();
  });

  it('renders the direction badge in the hero section', async () => {
    renderDetail();

    await screen.findByRole('heading', { name: /nvda export filing flags china exposure risk/i });
    expect(screen.getAllByText(/bearish/i).length).toBeGreaterThan(0);
  });

  it('renders the AI summary section with What Happened heading', async () => {
    renderDetail();

    expect(await screen.findByText(/what happened/i)).toBeInTheDocument();
    expect(screen.getByText(/nvidia corporation flagged heightened export exposure/i)).toBeInTheDocument();
  });

  it('shows AI-generated analysis disclosures in the summary and bull-bear sections', async () => {
    renderDetail();

    expect(await screen.findAllByText(/ai-generated analysis/i)).toHaveLength(2);
    expect(screen.getAllByText(/verify with primary sources/i)).toHaveLength(2);
  });

  it('displays Why It Matters Now with bullet points from enrichment', async () => {
    renderDetail();
    await openEvidenceTab();

    const heading = await screen.findByRole('heading', { name: /why it matters now/i });
    const section = heading.closest('section') as HTMLElement;
    // impact bullet
    expect(within(section).getByText(/export controls may pressure near-term demand expectations/i)).toBeInTheDocument();
    // whyNow bullet
    expect(within(section).getByText(/new export restrictions coincide with q1 guidance period/i)).toBeInTheDocument();
    // currentSetup bullet
    expect(within(section).getByText(/nvda is losing momentum into resistance/i)).toBeInTheDocument();
  });

  it('renders bull case vs bear case columns', async () => {
    renderDetail();

    const heading = await screen.findByRole('heading', { name: /bull case vs bear case/i });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText(/▲ bull/i)).toBeInTheDocument();
    expect(within(section).getByText(/▼ bear/i)).toBeInTheDocument();
  });

  it('displays key risks with warning style', async () => {
    renderDetail();
    await openEvidenceTab();

    const heading = await screen.findByRole('heading', { name: /key risks/i });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText(/regulatory escalation could further restrict chip sales/i)).toBeInTheDocument();
  });

  it('displays filing items for SEC events', async () => {
    renderDetail();
    await openEvidenceTab();

    await waitFor(() => {
      expect(screen.getByText(/filing items/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/2\.01, 3\.01, 5\.02/)).toBeInTheDocument();
  });

  // ── Zone 2: Evidence ─────────────────────────────────────────────────────

  it('renders stock context with price and change data', async () => {
    renderDetail();
    await openEvidenceTab();

    // Stock context renders in both mobile and sidebar; check at least one exists
    await waitFor(() => {
      expect(screen.getAllByText(/\$178\.42/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/\+2\.3%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/RSI 54/i).length).toBeGreaterThan(0);
  });

  it('displays regime context', async () => {
    renderDetail();
    await openEvidenceTab();

    await waitFor(() => {
      expect(screen.getAllByText(/regime context/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/correction market/i).length).toBeGreaterThan(0);
  });

  it('renders historical pattern with plain-language stats', async () => {
    renderDetail();
    await openEvidenceTab();

    await waitFor(() => {
      expect(screen.getByText(/historical similar events/i)).toBeInTheDocument();
    });
    expect(screen.getByText('251')).toBeInTheDocument();
    // Plain language labels
    expect(screen.getAllByText(/avg 20-day move/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/avg 5-day move/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/win rate/i).length).toBeGreaterThan(0);
    // Values
    expect(screen.getAllByText(/-0\.4%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/-0\.6%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/46%/).length).toBeGreaterThan(0);
  });

  it('renders confidence bar for historical pattern', async () => {
    renderDetail();
    await openEvidenceTab();

    // n=251 → High confidence
    await waitFor(() => {
      expect(screen.getByText(/n=251/i)).toBeInTheDocument();
    });
  });

  it('renders best and worst cases from historical context', async () => {
    renderDetail();
    await openEvidenceTab();

    await waitFor(() => {
      expect(screen.getByText(/smci/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/\+78\.3%/)).toBeInTheDocument();
    expect(screen.getByText(/unh/i)).toBeInTheDocument();
    expect(screen.getByText(/-35\.7%/)).toBeInTheDocument();
  });

  it('renders similar events within historical section', async () => {
    renderDetail();
    await openEvidenceTab();

    expect(await screen.findByText(/prior nvda export disclosure/i)).toBeInTheDocument();
    expect(screen.getByText(/semiconductor filing highlights china demand risk/i)).toBeInTheDocument();
  });

  it('hides historical pattern when no historical context exists', async () => {
    renderDetail('evt-low-sample-pattern');
    await openEvidenceTab();

    await screen.findByRole('heading', { name: /source evidence/i });

    expect(screen.queryByText(/historical similar events/i)).not.toBeInTheDocument();
  });

  // ── Zone 3: Trust ────────────────────────────────────────────────────────

  it('renders the provenance timeline with pipeline steps', async () => {
    renderDetail();
    await openTrustTab();

    await waitFor(() => {
      expect(screen.getByText(/source journey/i)).toBeInTheDocument();
    });
    // Pipeline steps
    expect(screen.getByText(/rule filter/i)).toBeInTheDocument();
    expect(screen.getByText(/ai judge/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence: 0\.82/i)).toBeInTheDocument();
    expect(screen.getByText(/enriched/i)).toBeInTheDocument();
    expect(screen.getByText(/delivered/i)).toBeInTheDocument();
  });

  it('renders the trust block when scorecard data is available', async () => {
    renderDetail();
    await openTrustTab();

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

  it('renders confirmation badges when multiple sources confirmed', async () => {
    renderDetail();
    await openTrustTab();

    await waitFor(() => {
      expect(screen.getAllByText(/confirmed/i).length).toBeGreaterThan(0);
    });
  });

  it('renders the original source link', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /view original source/i }).length).toBeGreaterThan(0);
    });
  });

  // ── Feedback ─────────────────────────────────────────────────────────────

  it('renders inline feedback buttons with three options', async () => {
    renderDetail();
    await openTrustTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^useful$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /not useful/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bad data/i })).toBeInTheDocument();
  });

  it('feedback bar is not sticky/floating', async () => {
    renderDetail();
    await openTrustTab();

    const feedbackText = await screen.findByText(/was this alert useful/i);
    const feedbackSection = feedbackText.closest('section');
    expect(feedbackSection).not.toBeNull();
    // Should NOT have sticky/fixed positioning
    expect(feedbackSection?.className).not.toMatch(/sticky|fixed/);
  });

  // ── Anchor navigation ────────────────────────────────────────────────────

  it('renders the anchor navigation with section links', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /page sections/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evidence/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trust/i })).toBeInTheDocument();
  });

  // ── Direction context ────────────────────────────────────────────────────

  it('shows regime context as direction for neutral signals', async () => {
    renderDetail('evt-neutral-regime-1');

    expect(await screen.findByText(/direction: risk-off tape is amplifying macro headlines/i)).toBeInTheDocument();
  });

  it('shows real source evidence in the Evidence tab', async () => {
    renderDetail();
    await openEvidenceTab();

    const sourceEvidenceHeading = await screen.findByRole('heading', { name: /source evidence/i });
    const sourceEvidenceSection = sourceEvidenceHeading.closest('section') as HTMLElement;

    expect(within(sourceEvidenceSection).getByText(/source type/i)).toBeInTheDocument();
    expect(within(sourceEvidenceSection).getByText(/^SEC Filing$/i)).toBeInTheDocument();
    expect(within(sourceEvidenceSection).getByRole('link', { name: /source url/i })).toHaveAttribute(
      'href',
      'https://example.com/sec/nvda-export-filing',
    );
    expect(within(sourceEvidenceSection).getByText(/original filing excerpt:/i)).toBeInTheDocument();
    expect(within(sourceEvidenceSection).getByText(/nvidia disclosed that new export licensing requirements may constrain shipments to china/i)).toBeInTheDocument();
    expect(within(sourceEvidenceSection).getByRole('link', { name: /view on edgar/i })).toHaveAttribute(
      'href',
      expect.stringContaining('0001045810-26-000042'),
    );
  });

  it('shows evidence fallback copy when source data is unavailable', async () => {
    renderDetail('evt-high-missing-analysis');
    await openEvidenceTab();

    expect(
      await screen.findByText(
        /source data not available for this event\. classification was based on the original alert text\./i,
      ),
    ).toBeInTheDocument();
  });

  it('keeps bull and bear sections visible with placeholders when analysis is missing', async () => {
    renderDetail('evt-high-missing-analysis');

    const heading = await screen.findByRole('heading', { name: /bull case vs bear case/i });
    const section = heading.closest('section') as HTMLElement;

    expect(within(section).getByText(/▲ bull/i)).toBeInTheDocument();
    expect(within(section).getByText(/▼ bear/i)).toBeInTheDocument();
    expect(within(section).getAllByText(/analysis not available/i)).toHaveLength(2);
  });

  it('falls back to awaiting market reaction when direction is mixed', async () => {
    renderDetail('evt-awaiting-reaction-1');

    expect(await screen.findByText(/direction: awaiting market reaction/i)).toBeInTheDocument();
  });

  // ── Disclaimer ───────────────────────────────────────────────────────────

  it('keeps the disclaimer collapsed by default', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /trust/i }));

    const disclaimerToggle = await screen.findByRole('button', { name: /disclaimer/i });
    expect(disclaimerToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/consult a qualified financial advisor/i)).not.toBeInTheDocument();

    await user.click(disclaimerToggle);
    expect(disclaimerToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/consult a qualified financial advisor/i)).toBeInTheDocument();
  });

  // ── Navigation ───────────────────────────────────────────────────────────

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

  it('shows a dedicated mobile back button that returns to the previous page', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(
      [
        { path: '/', element: <div>Feed route</div> },
        { path: '/event/:id', element: <EventDetail /> },
      ],
      ['/', '/event/evt-critical-nvda-1'],
    );

    await user.click(await screen.findByRole('button', { name: /← back/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});
