import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CollapsiblePanel } from '../components/CollapsiblePanel.js';
import { useAlertSound } from '../hooks/useAlertSound.js';
import { useAudioSquawk, type SquawkThreshold } from '../hooks/useAudioSquawk.js';
import { useTheme, type Theme } from '../hooks/useTheme.js';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../lib/api.js';
import {
  getWebPushDeviceState,
  getWebPushStatusDetails,
  getWebPushSupport,
  sendPushSubscriptionToBackend,
  subscribeBrowserToPush,
  unsubscribeBrowserFromPush,
  type WebPushDeviceState,
  WebPushError,
} from '../lib/web-push.js';

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  quietStart: null,
  quietEnd: null,
  timezone: 'America/New_York',
  dailyPushCap: 20,
  pushNonWatchlist: false,
};

const US_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Pacific/Honolulu',
];

function serializeNotificationPreferences(preferences: NotificationPreferences): string {
  return JSON.stringify({
    quietStart: preferences.quietStart,
    quietEnd: preferences.quietEnd,
    timezone: preferences.timezone,
    dailyPushCap: preferences.dailyPushCap,
    pushNonWatchlist: preferences.pushNonWatchlist,
  });
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function Settings() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { preferences, setEnabled, setQuietHours, setVolume } = useAlertSound();
  const {
    preferences: squawkPreferences,
    setEnabled: setSquawkEnabled,
    setThreshold: setSquawkThreshold,
  } = useAudioSquawk();
  const [pushState, setPushState] = useState<WebPushDeviceState>(() => ({
    ...getWebPushSupport(),
    subscribed: false,
  }));
  const [backendRegistrationFailed, setBackendRegistrationFailed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(() => getWebPushSupport().supported);
  const [isPushActionPending, setIsPushActionPending] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const baselinePreferencesRef = useRef<string>(serializeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES));

  useEffect(() => {
    let cancelled = false;

    async function refreshInitialPushState(): Promise<void> {
      try {
        const nextState = await getWebPushDeviceState();
        if (!cancelled) {
          setPushState(nextState);
        }
      } catch {
        if (!cancelled) {
          setPushState((current) => ({
            ...current,
            ...getWebPushSupport(),
          }));
        }
      } finally {
        if (!cancelled) {
          setIsPushLoading(false);
        }
      }
    }

    if (!pushState.supported) {
      setIsPushLoading(false);
      return undefined;
    }

    void refreshInitialPushState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationPreferences(): Promise<void> {
      try {
        const loaded = await getNotificationPreferences();
        if (cancelled) {
          return;
        }

        baselinePreferencesRef.current = serializeNotificationPreferences(loaded);
        setNotificationPreferences(loaded);
      } catch {
        if (!cancelled) {
          setNotificationError('Could not load notification preferences.');
          setNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
        }
      }
    }

    void loadNotificationPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const notificationKey = notificationPreferences
    ? serializeNotificationPreferences(notificationPreferences)
    : null;

  useEffect(() => {
    if (!notificationPreferences || notificationKey == null) {
      return undefined;
    }

    if (notificationKey === baselinePreferencesRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveState('saving');
      void updateNotificationPreferences(notificationPreferences)
        .then((saved) => {
          baselinePreferencesRef.current = serializeNotificationPreferences(saved);
          setNotificationPreferences(saved);
          setNotificationError(null);
          setSaveState('saved');
          setToastMessage('Preferences saved');
        })
        .catch(() => {
          setSaveState('error');
          setNotificationError('Could not save notification preferences.');
          setToastMessage('Could not save preferences');
        });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notificationPreferences, notificationKey]);

  function updatePreferencesState(
    updater: (current: NotificationPreferences) => NotificationPreferences,
  ): void {
    setNotificationPreferences((current) => (
      current ? updater(current) : current
    ));
    setSaveState('idle');
  }

  function toggleQuietHours(enabled: boolean): void {
    updatePreferencesState((current) => {
      if (!enabled) {
        return {
          ...current,
          quietStart: null,
          quietEnd: null,
        };
      }

      return {
        ...current,
        quietStart: current.quietStart ?? '23:00',
        quietEnd: current.quietEnd ?? '08:00',
      };
    });
  }

  async function enableWebPush(): Promise<void> {
    try {
      setIsPushActionPending(true);
      setBackendRegistrationFailed(false);
      const subscription = await subscribeBrowserToPush();
      if (subscription.status === 'created' || backendRegistrationFailed) {
        await sendPushSubscriptionToBackend(subscription);
      }

      setPushState(await getWebPushDeviceState());
    } catch (error) {
      if (error instanceof WebPushError && error.code === 'backend-registration-failed') {
        setBackendRegistrationFailed(true);
      }

      setPushState(await getWebPushDeviceState().catch(() => ({
        ...getWebPushSupport(),
        subscribed: false,
      })));
    } finally {
      setIsPushActionPending(false);
    }
  }

  async function disableWebPush(): Promise<void> {
    try {
      setIsPushActionPending(true);
      setBackendRegistrationFailed(false);
      await unsubscribeBrowserFromPush();
      setPushState(await getWebPushDeviceState());
    } catch {
      setPushState(await getWebPushDeviceState().catch(() => ({
        ...getWebPushSupport(),
        subscribed: false,
      })));
    } finally {
      setIsPushActionPending(false);
    }
  }

  const pushDetails = getWebPushStatusDetails({
    ...pushState,
    isBusy: isPushLoading || isPushActionPending,
    backendRegistrationFailed,
  });
  const pushToneClassName = {
    neutral: 'border-overlay-medium bg-overlay-subtle text-text-primary',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-800 dark:text-emerald-100',
    warning: 'border-amber-300/20 bg-amber-300/10 text-amber-800 dark:text-amber-100',
    danger: 'border-rose-300/20 bg-rose-300/10 text-rose-800 dark:text-rose-100',
  }[pushDetails.tone];
  const fromWatchlist = new URLSearchParams(location.search).get('from') === 'watchlist';
  const quietHoursEnabled =
    notificationPreferences?.quietStart != null && notificationPreferences.quietEnd != null;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5 shadow-[0_18px_40px_var(--shadow-color)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
          Settings
        </p>
        <h1 className="mt-3 text-[22px] font-semibold text-text-primary">
          Alerts and notifications
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Keep your watchlist alerts understandable on the page and reachable when the app is backgrounded.
        </p>
      </div>

      <CollapsiblePanel
        id="appearance"
        title="Appearance"
        eyebrow="Theme"
        description="Choose how Event Radar looks on this device."
        defaultOpen
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Theme</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Select light, dark, or match your system preference.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  theme === value
                    ? 'border-accent-default bg-accent-default/10 text-accent-default'
                    : 'border-overlay-medium bg-overlay-subtle text-text-secondary hover:bg-overlay-medium'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="push-alerts"
        title="Push alerts"
        eyebrow="Web Push"
        description="Enable this device and keep the setup steps in one place."
        defaultOpen
        className="scroll-mt-24"
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[22px] font-semibold text-text-primary">
            Push alerts on this device
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Enable push alerts so important Event Radar events can reach this device when the app is backgrounded.
            </p>
          </div>

          {fromWatchlist ? (
            <div className="rounded-2xl border border-accent-default/20 bg-accent-default/10 p-4">
              <p className="text-sm font-semibold text-text-primary">Finish your watchlist setup</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Turn on push for this device, then return to your watchlist so the names you care about stay tight and readable.
              </p>
            </div>
          ) : null}

          <div className={`rounded-2xl border p-4 ${pushToneClassName}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {pushDetails.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-current/80">
                  {pushDetails.description}
                </p>
              </div>
              <div className="inline-flex w-fit items-center rounded-full border border-current/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-current/80">
                {pushDetails.state.replaceAll('-', ' ')}
              </div>
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-current/70">
              Permission: {pushState.permission}
            </p>
          </div>

          <div className="rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Enable push in under a minute
            </p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
              <li className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-overlay-medium text-[11px] font-semibold text-text-primary">
                  1
                </span>
                <span>Tap {pushDetails.enableLabel}.</span>
              </li>
              <li className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-overlay-medium text-[11px] font-semibold text-text-primary">
                  2
                </span>
                <span>Allow browser notifications in the prompt.</span>
              </li>
              <li className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-overlay-medium text-[11px] font-semibold text-text-primary">
                  3
                </span>
                <span>Return to your watchlist to keep alerts focused.</span>
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                void enableWebPush();
              }}
              disabled={!pushDetails.canEnable}
              className="inline-flex min-h-11 items-center rounded-full border border-overlay-medium bg-overlay-light px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-overlay-medium focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pushDetails.enableLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                void disableWebPush();
              }}
              disabled={!pushDetails.canDisable}
              className="inline-flex min-h-11 items-center rounded-full border border-overlay-medium bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-overlay-light focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pushDetails.disableLabel}
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/watchlist"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-overlay-medium bg-overlay-light px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-overlay-medium focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Review watchlist
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-overlay-medium bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-overlay-light focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Open live feed
            </Link>
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="notification-budget"
        title="Notification budget"
        eyebrow="Notification budget"
        description="Quiet hours, daily cap, and non-watchlist volume."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold text-text-primary">
                Notification timing
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Control when Event Radar can ping you and how much push volume you allow each day.
              </p>
            </div>
            <div className="inline-flex w-fit items-center rounded-full border border-overlay-medium bg-overlay-light px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {saveState === 'saving' ? 'saving' : saveState === 'saved' ? 'saved' : 'autosave'}
            </div>
          </div>

          {notificationError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-800 dark:text-rose-100">
              {notificationError}
            </div>
          ) : null}

          {!notificationPreferences ? (
            <div className="rounded-2xl border border-overlay-medium bg-bg-elevated/40 p-4 text-sm text-text-secondary">
              Loading notification preferences…
            </div>
          ) : (
            <>
              <div className="space-y-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">Quiet hours</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    During quiet hours, only top-priority setups push through.
                  </p>
                </div>

                <label className="flex items-center justify-between gap-4" htmlFor="quiet-hours-toggle">
                  <span className="text-sm font-medium text-text-primary">Enable quiet hours</span>
                  <input
                    id="quiet-hours-toggle"
                    type="checkbox"
                    checked={quietHoursEnabled}
                    onChange={(event) => toggleQuietHours(event.target.checked)}
                    className="h-5 w-5 rounded border-overlay-medium bg-transparent text-accent-default focus:ring-accent-default"
                  />
                </label>

                {quietHoursEnabled ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="block space-y-2" htmlFor="quiet-hours-start">
                      <span className="block text-sm font-medium text-text-primary">Quiet hours start</span>
                      <input
                        id="quiet-hours-start"
                        type="time"
                        value={notificationPreferences.quietStart ?? '23:00'}
                        onChange={(event) => updatePreferencesState((current) => ({
                          ...current,
                          quietStart: event.target.value,
                        }))}
                        className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-overlay-subtle px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
                      />
                    </label>

                    <label className="block space-y-2" htmlFor="quiet-hours-end">
                      <span className="block text-sm font-medium text-text-primary">Quiet hours end</span>
                      <input
                        id="quiet-hours-end"
                        type="time"
                        value={notificationPreferences.quietEnd ?? '08:00'}
                        onChange={(event) => updatePreferencesState((current) => ({
                          ...current,
                          quietEnd: event.target.value,
                        }))}
                        className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-overlay-subtle px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
                      />
                    </label>

                    <label className="block space-y-2" htmlFor="notification-timezone">
                      <span className="block text-sm font-medium text-text-primary">Timezone</span>
                      <select
                        id="notification-timezone"
                        value={notificationPreferences.timezone}
                        onChange={(event) => updatePreferencesState((current) => ({
                          ...current,
                          timezone: event.target.value,
                        }))}
                        className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-bg-elevated px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
                      >
                        {US_TIMEZONES.map((timezone) => (
                          <option key={timezone} value={timezone}>
                            {timezone}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary" htmlFor="daily-push-limit">
                    Daily push limit
                  </label>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    Top-priority setups still push even after the cap is hit.
                  </p>
                </div>

                <select
                  id="daily-push-limit"
                  value={String(notificationPreferences.dailyPushCap)}
                  onChange={(event) => updatePreferencesState((current) => ({
                    ...current,
                    dailyPushCap: Number(event.target.value),
                  }))}
                  className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-bg-elevated px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
                >
                  <option value="5">5 alerts</option>
                  <option value="10">10 alerts</option>
                  <option value="20">20 alerts</option>
                  <option value="50">50 alerts</option>
                  <option value="0">Unlimited</option>
                </select>
              </div>

              <div className="space-y-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">Non-watchlist alerts</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    Let high-confidence names outside your watchlist push through too.
                  </p>
                </div>

                <label
                  className="flex items-center justify-between gap-4"
                  htmlFor="push-non-watchlist-toggle"
                >
                  <span className="text-sm font-medium text-text-primary">
                    Alert me for tickers outside my watchlist
                  </span>
                  <input
                    id="push-non-watchlist-toggle"
                    type="checkbox"
                    checked={notificationPreferences.pushNonWatchlist}
                    onChange={(event) => updatePreferencesState((current) => ({
                      ...current,
                      pushNonWatchlist: event.target.checked,
                    }))}
                    className="h-5 w-5 rounded border-overlay-medium bg-transparent text-accent-default focus:ring-accent-default"
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="sound-alerts"
        title="Sound alerts"
        eyebrow="Sound"
        description="Short tones for live high-priority events."
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[22px] font-semibold text-text-primary">
              Sound alerts
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Play a short tone for new HIGH and CRITICAL live events after you interact with the page.
            </p>
          </div>

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
              className="h-5 w-5 rounded border-overlay-medium bg-transparent text-accent-default focus:ring-accent-default"
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
                className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-overlay-subtle px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
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
                className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-overlay-subtle px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
              />
            </label>
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="audio-squawk"
        title="Audio squawk"
        eyebrow="TTS"
        description="Browser text-to-speech announcements for live events."
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[22px] font-semibold text-text-primary">
              Audio squawk
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Reads event headlines aloud using your browser&apos;s built-in text-to-speech. No external API needed.
            </p>
          </div>

          <label className="flex items-center justify-between gap-4" htmlFor="squawk-toggle">
            <span>
              <span className="block text-sm font-medium text-text-primary">Enable audio squawk</span>
              <span className="mt-1 block text-xs text-text-secondary">
                Stores this preference locally on this device.
              </span>
            </span>
            <input
              id="squawk-toggle"
              type="checkbox"
              checked={squawkPreferences.enabled}
              onChange={(event) => setSquawkEnabled(event.target.checked)}
              className="h-5 w-5 rounded border-overlay-medium bg-transparent text-accent-default focus:ring-accent-default"
            />
          </label>

          {squawkPreferences.enabled ? (
            <label className="block space-y-2" htmlFor="squawk-threshold">
              <span className="block text-sm font-medium text-text-primary">Severity threshold</span>
              <select
                id="squawk-threshold"
                value={squawkPreferences.threshold}
                onChange={(event) => setSquawkThreshold(event.target.value as SquawkThreshold)}
                className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-bg-elevated px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
              >
                <option value="critical">Critical only</option>
                <option value="critical+high">Critical + High</option>
                <option value="all">All severities</option>
              </select>
            </label>
          ) : null}
        </div>
      </CollapsiblePanel>

      {toastMessage ? (
        <div className={`fixed bottom-5 right-5 rounded-full border px-4 py-2 text-sm font-medium shadow-[0_18px_40px_var(--shadow-color)] ${saveState === 'error' ? 'border-rose-400/20 bg-rose-50 text-rose-800 dark:bg-[#240d0d] dark:text-rose-100' : 'border-emerald-400/20 bg-emerald-50 text-emerald-800 dark:bg-[#0d241d] dark:text-emerald-100'}`}>
          {toastMessage}
        </div>
      ) : null}
    </section>
  );
}
