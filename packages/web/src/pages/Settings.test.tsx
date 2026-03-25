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
    timezone: 'UTC',
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
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    } as Intl.ResolvedDateTimeFormatOptions);
    getPreferences.mockClear();
    updatePreferences.mockClear();
    getChannelSettings.mockClear();
    saveChannelSettings.mockClear();
    testWebhook.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    const channelHeading = screen.getByRole('button', { name: /notification channels.*discord webhook/i });

    expect(pushHeading.compareDocumentPosition(channelHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

  it('keeps non-watchlist alerts inside the push alerts section', async () => {
    renderSettings();

    const pushHeading = await screen.findByRole('heading', { name: /push alerts on this device/i });
    const section = pushHeading.closest('section') as HTMLElement;

    expect(within(section).getByLabelText(/alert me for tickers outside my watchlist/i)).toBeInTheDocument();
    expect(within(section).queryByLabelText(/enable quiet hours/i)).not.toBeInTheDocument();
    expect(within(section).queryByLabelText(/daily push limit/i)).not.toBeInTheDocument();
  });

  it('autosaves notification preference changes after a short debounce', async () => {
    const user = userEvent.setup();

    renderSettings();
    const nonWatchlistToggle = await screen.findByLabelText(/alert me for tickers outside my watchlist/i);

    await user.click(nonWatchlistToggle);

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith({
        quietStart: null,
        quietEnd: null,
        timezone: 'UTC',
        dailyPushCap: 20,
        pushNonWatchlist: true,
      });
    }, { timeout: 1500 });

    expect(await screen.findByText(/preferences saved/i)).toBeInTheDocument();
  });

  it('renders settings groups as collapsible sections', async () => {
    renderSettings();

    const pushToggle = await screen.findByRole('button', { name: /web push/i });
    const channelToggle = screen.getByRole('button', { name: /notification channels.*discord webhook/i });

    expect(pushToggle).toHaveAttribute('aria-expanded', 'true');
    expect(channelToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: /notification budget/i })).not.toBeInTheDocument();
  });

  it('does not render quiet hours, daily push cap, or signal-tier explainer controls', async () => {
    renderSettings();

    await screen.findByRole('heading', { name: /push alerts on this device/i });

    expect(screen.queryByText(/signal tier delivery/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/quiet hours/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/daily push limit/i)).not.toBeInTheDocument();
  });

  it('does not render the removed sound, display, email, or briefing settings', async () => {
    renderSettings();

    await screen.findByRole('button', { name: /web push/i });

    expect(screen.queryByRole('button', { name: /sound alerts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /display/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show today's briefing/i })).not.toBeInTheDocument();
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

  it('keeps the notification channels section focused on Discord configuration', async () => {
    renderSettings();

    const heading = await screen.findByRole('heading', { name: /notification channels/i });
    const section = heading.closest('section') as HTMLElement;

    expect(within(section).getByLabelText(/discord webhook url/i)).toBeInTheDocument();
    expect(within(section).queryByText(/email digest/i)).not.toBeInTheDocument();
  });
});
