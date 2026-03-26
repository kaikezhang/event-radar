import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';
import { Settings } from './Settings.js';
import { renderWithRouter } from '../test/render.js';

const {
  getWebPushDeviceStateMock,
  getWebPushStatusDetailsMock,
  getWebPushSupportMock,
  sendPushSubscriptionToBackendMock,
  subscribeBrowserToPushMock,
  unsubscribeBrowserFromPushMock,
} = vi.hoisted(() => ({
  getWebPushDeviceStateMock: vi.fn(),
  getWebPushStatusDetailsMock: vi.fn(),
  getWebPushSupportMock: vi.fn(),
  sendPushSubscriptionToBackendMock: vi.fn(),
  subscribeBrowserToPushMock: vi.fn(),
  unsubscribeBrowserFromPushMock: vi.fn(),
}));

vi.mock('../lib/web-push.js', () => ({
  getWebPushDeviceState: getWebPushDeviceStateMock,
  getWebPushStatusDetails: getWebPushStatusDetailsMock,
  getWebPushSupport: getWebPushSupportMock,
  sendPushSubscriptionToBackend: sendPushSubscriptionToBackendMock,
  subscribeBrowserToPush: subscribeBrowserToPushMock,
  unsubscribeBrowserFromPush: unsubscribeBrowserFromPushMock,
  WebPushError: class WebPushError extends Error {
    constructor(
      public code:
        | 'notifications-unsupported'
        | 'permission-denied'
        | 'service-worker-unsupported'
        | 'vapid-key-missing'
        | 'invalid-subscription'
        | 'backend-registration-failed'
        | 'backend-unregister-failed'
        | 'unsubscribe-failed',
      message: string,
    ) {
      super(message);
      this.name = 'WebPushError';
    }
  },
}));

function renderSettings(initialEntry = '/settings') {
  return renderWithRouter(
    [{ path: '/settings', element: <Settings /> }],
    [initialEntry],
  );
}

describe('Settings page', () => {
  beforeEach(() => {
    getWebPushSupportMock.mockReturnValue({
      supported: true,
      permission: 'default',
    });
    getWebPushDeviceStateMock.mockResolvedValue({
      supported: true,
      permission: 'default',
      subscribed: false,
    });
    getWebPushStatusDetailsMock.mockImplementation(({ subscribed, permission, backendRegistrationFailed, isBusy }) => {
      if (isBusy) {
        return {
          tone: 'neutral',
          title: 'Updating browser notifications',
          description: 'Working…',
          canEnable: false,
          canDisable: false,
          enableLabel: 'Working…',
          disableLabel: 'Working…',
        };
      }

      if (backendRegistrationFailed) {
        return {
          tone: 'danger',
          title: 'Device alerts need one more step',
          description: 'Try again.',
          canEnable: true,
          canDisable: true,
          enableLabel: 'Try again',
          disableLabel: 'Disable push alerts',
        };
      }

      if (permission === 'denied') {
        return {
          tone: 'danger',
          title: 'Browser notifications are blocked',
          description: 'Allow notifications in browser settings.',
          canEnable: false,
          canDisable: false,
          enableLabel: 'Notifications blocked',
          disableLabel: 'Disable push alerts',
        };
      }

      if (subscribed) {
        return {
          tone: 'success',
          title: 'Browser push is enabled',
          description: 'Alerts can reach this device.',
          canEnable: false,
          canDisable: true,
          enableLabel: 'Enabled on this device',
          disableLabel: 'Disable push alerts',
        };
      }

      return {
        tone: 'neutral',
        title: 'Push alerts are ready to enable',
        description: 'Turn on browser notifications.',
        canEnable: true,
        canDisable: false,
        enableLabel: 'Enable push alerts',
        disableLabel: 'Disable push alerts',
      };
    });
    subscribeBrowserToPushMock.mockResolvedValue({
      endpoint: 'https://push.example/device-1',
      expirationTime: null,
      keys: { p256dh: 'p256', auth: 'auth' },
      status: 'created',
    });
    sendPushSubscriptionToBackendMock.mockResolvedValue(undefined);
    unsubscribeBrowserFromPushMock.mockResolvedValue({ status: 'unsubscribed' });
  });

  it('renders the simplified about copy and removes legacy settings controls', async () => {
    renderSettings();

    expect(await screen.findByRole('heading', { name: /keep it simple/i })).toBeInTheDocument();
    expect(screen.getByText(/dark mode is enforced/i)).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.queryByText(/discord webhook/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /discord webhook/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /daily push/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /quiet hours/i })).not.toBeInTheDocument();
  });

  it('shows a watchlist note when opened from the watchlist flow', async () => {
    renderSettings('/settings?from=watchlist#push-alerts');

    expect(await screen.findByText(/enable push before you leave settings/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to watchlist/i })).toHaveAttribute('href', '/watchlist');
  });

  it('enables browser push from the single action button', async () => {
    const user = userEvent.setup();
    getWebPushDeviceStateMock
      .mockResolvedValueOnce({ supported: true, permission: 'default', subscribed: false })
      .mockResolvedValueOnce({ supported: true, permission: 'granted', subscribed: true });

    renderSettings();
    await screen.findByText(/push alerts are ready to enable/i);

    await user.click(screen.getByRole('button', { name: /enable push alerts/i }));

    await waitFor(() => {
      expect(subscribeBrowserToPushMock).toHaveBeenCalledTimes(1);
      expect(sendPushSubscriptionToBackendMock).toHaveBeenCalledTimes(1);
    });
  });

  it('disables browser push when the device is already subscribed', async () => {
    const user = userEvent.setup();
    getWebPushDeviceStateMock.mockResolvedValue({
      supported: true,
      permission: 'granted',
      subscribed: true,
    });

    renderSettings();
    await screen.findByText(/browser push is enabled/i);

    await user.click(screen.getByRole('button', { name: /disable push alerts/i }));

    await waitFor(() => {
      expect(unsubscribeBrowserFromPushMock).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces push setup errors inline', async () => {
    const user = userEvent.setup();
    sendPushSubscriptionToBackendMock.mockRejectedValueOnce(new Error('Backend save failed'));

    renderSettings();
    await screen.findByRole('button', { name: /enable push alerts/i });

    await user.click(screen.getByRole('button', { name: /enable push alerts/i }));

    expect(await screen.findByText(/backend save failed/i)).toBeInTheDocument();
  });
});
