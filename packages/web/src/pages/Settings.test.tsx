import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { Settings } from './Settings.js';
import { renderWithRouter } from '../test/render.js';

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

describe('Settings page', () => {
  function renderSettings(initialEntry = '/settings') {
    return renderWithRouter(
      [{ path: '/settings', element: <Settings /> }],
      [initialEntry],
    );
  }

  it('keeps push setup at the top of the page', async () => {
    renderSettings();

    const pushHeading = await screen.findByRole('heading', { name: /push alerts on this device/i });
    const soundHeading = screen.getByRole('heading', { name: /sound alerts/i });

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
});
