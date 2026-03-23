import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import { Settings } from './Settings.js';
import { renderWithRouter } from '../test/render.js';

const {
  getPreferences,
  updatePreferences,
  getChannelSettings,
  saveChannelSettings,
  testWebhook,
} = vi.hoisted(() => ({
  getPreferences: vi.fn(async () => ({
    quietStart: null,
    quietEnd: null,
    timezone: 'America/New_York',
    dailyPushCap: 20,
    pushNonWatchlist: false,
  })),
  updatePreferences: vi.fn(async (payload: unknown) => payload),
  getChannelSettings: vi.fn(async () => ({
    discordWebhookUrl: null,
    emailAddress: null,
    minSeverity: 'HIGH',
    enabled: false,
  })),
  saveChannelSettings: vi.fn(async (payload: Record<string, unknown>) => ({
    discordWebhookUrl: (payload.discordWebhookUrl as string | null) ?? null,
    emailAddress: (payload.emailAddress as string | null) ?? null,
    minSeverity: (payload.minSeverity as string) ?? 'HIGH',
    enabled: true,
  })),
  testWebhook: vi.fn(async () => undefined),
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
  getNotificationChannelSettings: getChannelSettings,
  saveNotificationChannelSettings: saveChannelSettings,
  testDiscordWebhook: testWebhook,
}));

describe('Settings page', () => {
  beforeEach(() => {
    getPreferences.mockClear();
    updatePreferences.mockClear();
    getChannelSettings.mockClear();
    saveChannelSettings.mockClear();
    testWebhook.mockClear();
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

    const notificationTiming = screen.getByRole('heading', { name: /notification timing/i });
    const section = notificationTiming.closest('section') as HTMLElement;

    expect(within(section).getByText(/^Critical$/)).toBeInTheDocument();
    expect(within(section).getAllByText(/push notification \+ feed/i).length).toBeGreaterThan(0);
    expect(within(section).getAllByText(/feed only/i).length).toBeGreaterThan(0);
  });

  it('marks the high tier delivery row as conditional', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: /notification budget.*quiet hours/i }));

    const notificationTiming = screen.getByRole('heading', { name: /notification timing/i });
    const section = notificationTiming.closest('section') as HTMLElement;

    expect(within(section).getByText(/^High$/)).toBeInTheDocument();
    expect(within(section).getByText(/if enabled/i)).toBeInTheDocument();
  });

  it('shows the critical audio alerts toggle as disabled by default', async () => {
    renderSettings();

    const audioToggle = await screen.findByRole('button', { name: /audio squawk/i });
    await userEvent.setup().click(audioToggle);

    expect(screen.getByLabelText(/audio alerts for critical events/i)).not.toBeChecked();
  });

  it('reveals the hidden-tab preference after enabling critical audio alerts', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: /audio squawk/i }));
    await user.click(screen.getByLabelText(/audio alerts for critical events/i));

    expect(screen.getByLabelText(/speak while this tab is hidden/i)).toBeInTheDocument();
  });

  it('shows saved feedback on the notification channels save button for two seconds', async () => {
    const user = userEvent.setup();
    renderSettings();

    const urlInput = await screen.findByLabelText(/discord webhook url/i);
    await user.type(urlInput, 'https://discord.com/api/webhooks/test');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(saveChannelSettings).toHaveBeenCalledWith({
        discordWebhookUrl: 'https://discord.com/api/webhooks/test',
        emailAddress: null,
        minSeverity: 'HIGH',
      });
    });

    const savedButton = await screen.findByRole('button', { name: /saved ✓/i });
    expect(savedButton.className).toMatch(/emerald|green/);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
    }, { timeout: 2_500 });
  });

  it('shows a failure toast when saving notification channels fails', async () => {
    saveChannelSettings.mockRejectedValueOnce(new Error('save failed'));

    const user = userEvent.setup();
    renderSettings();

    const urlInput = await screen.findByLabelText(/discord webhook url/i);
    await user.type(urlInput, 'https://discord.com/api/webhooks/test');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/failed to save\. please try again\./i)).toBeInTheDocument();
  });

  it('shows transient success feedback on the Discord test button', async () => {
    const user = userEvent.setup();
    renderSettings();

    const urlInput = await screen.findByLabelText(/discord webhook url/i);
    await user.type(urlInput, 'https://discord.com/api/webhooks/test');
    await user.click(screen.getByRole('button', { name: /^test$/i }));

    expect(await screen.findByRole('button', { name: /sent ✓/i })).toBeInTheDocument();
    expect(testWebhook).toHaveBeenCalledWith('https://discord.com/api/webhooks/test');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^test$/i })).toBeInTheDocument();
    }, { timeout: 2_500 });
  });

  it('restores today\'s briefing when the settings action is used', async () => {
    const user = userEvent.setup();
    localStorage.setItem('lastBriefingDismissed', new Date().toLocaleDateString('en-CA'));

    renderSettings();

    const budgetToggle = await screen.findByRole('button', { name: /notification budget.*quiet hours/i });
    if (budgetToggle.getAttribute('aria-expanded') === 'false') {
      await user.click(budgetToggle);
    }
    await user.click(await screen.findByRole('button', { name: /show today's briefing/i }));

    expect(localStorage.getItem('lastBriefingDismissed')).toBeNull();
    expect(await screen.findByText(/today's briefing will be shown again/i)).toBeInTheDocument();
  });
});
