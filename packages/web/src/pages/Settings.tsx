import { useEffect, useState } from 'react';
import { useAlertSound } from '../hooks/useAlertSound.js';
import {
  sendPushSubscriptionToBackend,
  subscribeBrowserToPush,
  unsubscribeBrowserFromPush,
} from '../lib/web-push.js';

export function Settings() {
  const { preferences, setEnabled, setQuietHours, setVolume } = useAlertSound();
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [pushStatus, setPushStatus] = useState('Enable browser notifications for Event Radar alerts on this device.');
  const [isPushBusy, setIsPushBusy] = useState(false);

  const pushSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    Boolean(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPushPermission(Notification.permission);
    }
  }, []);

  async function enableWebPush(): Promise<void> {
    try {
      setIsPushBusy(true);
      const subscription = await subscribeBrowserToPush();
      await sendPushSubscriptionToBackend(subscription);
      setPushPermission(Notification.permission);
      setPushStatus('Browser push is enabled for this device.');
    } catch (error) {
      setPushPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      setPushStatus(error instanceof Error ? error.message : 'Failed to enable browser push.');
    } finally {
      setIsPushBusy(false);
    }
  }

  async function disableWebPush(): Promise<void> {
    try {
      setIsPushBusy(true);
      const removed = await unsubscribeBrowserFromPush();
      setPushStatus(
        removed
          ? 'Browser push has been disabled for this device.'
          : 'No browser push subscription was active on this device.',
      );
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'Failed to disable browser push.');
    } finally {
      setPushPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      setIsPushBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
          Settings
        </p>
        <h1 className="mt-3 text-[22px] font-semibold text-text-primary">
          Sound alerts
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Play a short tone for new HIGH and CRITICAL live events after you interact with the page.
        </p>
      </div>

      <div className="space-y-4 rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-text-primary">Enable sound alerts</span>
            <span className="mt-1 block text-xs text-text-secondary">
              Stores this preference locally on this device.
            </span>
          </span>
          <input
            type="checkbox"
            checked={preferences.enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-5 w-5 rounded border-white/15 bg-transparent text-accent-default focus:ring-accent-default"
          />
        </label>

        <label className="block space-y-3">
          <span className="block text-sm font-medium text-text-primary">
            Volume: {Math.round(preferences.volume * 100)}%
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={preferences.volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-full accent-accent-default"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-2">
            <span className="block text-sm font-medium text-text-primary">Quiet hours start</span>
            <input
              type="number"
              min="0"
              max="23"
              value={preferences.quietHoursStart}
              onChange={(event) => setQuietHours(Number(event.target.value), preferences.quietHoursEnd)}
              className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
            />
          </label>

          <label className="block space-y-2">
            <span className="block text-sm font-medium text-text-primary">Quiet hours end</span>
            <input
              type="number"
              min="0"
              max="23"
              value={preferences.quietHoursEnd}
              onChange={(event) => setQuietHours(preferences.quietHoursStart, Number(event.target.value))}
              className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
            />
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
            Web Push
          </p>
          <h2 className="mt-3 text-[22px] font-semibold text-text-primary">
            Browser notifications
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Enable push alerts so important Event Radar notifications can reach this device when the app is backgrounded.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-text-primary">
            Permission: {pushSupported ? pushPermission : 'unsupported'}
          </p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {pushSupported
              ? pushStatus
              : 'Web push requires a production build with service workers and a configured VAPID public key.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void enableWebPush();
            }}
            disabled={!pushSupported || isPushBusy}
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPushBusy ? 'Working…' : 'Enable browser push'}
          </button>
          <button
            type="button"
            onClick={() => {
              void disableWebPush();
            }}
            disabled={!pushSupported || isPushBusy}
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disable browser push
          </button>
        </div>
      </div>
    </section>
  );
}
