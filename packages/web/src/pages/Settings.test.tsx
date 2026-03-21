import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import { Settings } from './Settings.js';
import { renderWithRouter } from '../test/render.js';

const {
  getPreferences,
  updatePreferences,
} = vi.hoisted(() => ({
  getPreferences: vi.fn(async () => ({
    quietStart: null,
    quietEnd: null,
    timezone: 'America/New_York',
    dailyPushCap: 20,
    pushNonWatchlist: false,
  })),
  updatePreferences: vi.fn(async (payload: unknown) => payload),
}));

vi.mock('../lib/web-push.js', () => ({
  getWebPushDeviceState: vi.fn(async () => ({
    supported: true,
    permission: 'default',
    subscribed: false,
  })),
  getWebPushStatusDetails: vi.fn(() => ({
    state: 'permission-default',
    title: 'Push alerts are ready to enable',
    description: 'Turn on browser notifications to receive important Event Radar alerts on this device.',
    tone: 'neutral',
    canEnable: true,
    canDisable: false,
    enableLabel: 'Enable push alerts',
    disableLabel: 'Disable push alerts',
  })),
  getWebPushSupport: vi.fn(() => ({
    supported: true,
    permission: 'default',
  })),
  sendPushSubscriptionToBackend: vi.fn(),
  subscribeBrowserToPush: vi.fn(),
  unsubscribeBrowserFromPush: vi.fn(),
  WebPushError: class WebPushError extends Error {
    code = 'backend-registration-failed' as const;
  },
}));

vi.mock('../lib/api.js', () => ({
  getNotificationPreferences: getPreferences,
  updateNotificationPreferences: updatePreferences,
}));

describe('Settings page', () => {
  beforeEach(() => {
    getPreferences.mockClear();
    updatePreferences.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderSettings(initialEntry = '/settings') {
    return renderWithRouter(
      [{ path: '/settings', element: <Settings /> }],
      [initialEntry],
    );
  }

  it('keeps push setup at the top of the page', async () => {
    renderSettings();

    const pushHeading = await screen.findByRole('button', { name: /web push/i });
    const soundHeading = screen.getByRole('button', { name: /sound alerts.*short tones/i });

    expect(pushHeading.compareDocumentPosition(soundHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows a watchlist-focused setup note when opened from onboarding', async () => {
    renderSettings('/settings?from=watchlist#push-alerts');

    expect(await screen.findByText(/finish your watchlist setup/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review watchlist/i })).toHaveAttribute('href', '/watchlist');
  });

  it('explains the push enable flow in a short checklist', async () => {
    renderSettings();

    expect(await screen.findByText(/tap enable push alerts/i)).toBeInTheDocument();
    expect(screen.getByText(/allow browser notifications in the prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/return to your watchlist to keep alerts focused/i)).toBeInTheDocument();
  });

  it('renders notification budget and quiet-hours controls', async () => {
    const user = userEvent.setup();
    renderSettings();

    const budgetToggle = await screen.findByRole('button', { name: /notification budget.*quiet hours/i });
    await user.click(budgetToggle);

    expect(screen.getByRole('heading', { name: /notification timing/i })).toBeInTheDocument();
    const quietHoursToggle = screen.getByLabelText(/enable quiet hours/i);
    expect(quietHoursToggle).toBeInTheDocument();
    await user.click(quietHoursToggle);
    expect(await screen.findByLabelText(/timezone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/daily push limit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alert me for tickers outside my watchlist/i)).toBeInTheDocument();
  });

  it('autosaves notification preference changes after a short debounce', async () => {
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /notification budget.*quiet hours/i }));
    const nonWatchlistToggle = await screen.findByLabelText(/alert me for tickers outside my watchlist/i);

    await user.click(nonWatchlistToggle);

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith({
        quietStart: null,
        quietEnd: null,
        timezone: 'America/New_York',
        dailyPushCap: 20,
        pushNonWatchlist: true,
      });
    }, { timeout: 1500 });

    expect(await screen.findByText(/preferences saved/i)).toBeInTheDocument();
  });

  it('renders settings groups as collapsible sections', async () => {
    renderSettings();

    const pushToggle = await screen.findByRole('button', { name: /web push/i });
    const soundToggle = screen.getByRole('button', { name: /sound alerts.*short tones/i });
    const budgetToggle = screen.getByRole('button', { name: /notification budget.*quiet hours/i });

    expect(pushToggle).toHaveAttribute('aria-expanded', 'true');
    expect(soundToggle).toHaveAttribute('aria-expanded', 'false');
    expect(budgetToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a signal-tier delivery explainer under notification preferences', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: /notification budget.*quiet hours/i }));

    expect(screen.getByText(/critical/i)).toBeInTheDocument();
    expect(screen.getAllByText(/push notification \+ feed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/feed only/i).length).toBeGreaterThan(0);
  });

  it('marks the high tier delivery row as conditional', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: /notification budget.*quiet hours/i }));

    expect(screen.getByText(/^High$/)).toBeInTheDocument();
    expect(screen.getByText(/if enabled/i)).toBeInTheDocument();
  });
});
