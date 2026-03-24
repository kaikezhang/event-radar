import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CollapsiblePanel } from '../components/CollapsiblePanel.js';
import { useAlertSound } from '../hooks/useAlertSound.js';
import { useAudioSquawk } from '../hooks/useAudioSquawk.js';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  getNotificationChannelSettings,
  saveNotificationChannelSettings,
  testDiscordWebhook,
  type NotificationPreferences,
  type NotificationChannelSettings,
} from '../lib/api.js';
import { restoreDailyBriefing } from '../lib/daily-briefing.js';
import {
  applyFontScale,
  getStoredFontScale,
  setStoredFontScale,
  type FontScale,
} from '../lib/font-scale.js';
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

const SIGNAL_TIER_ROWS = [
  {
    severity: 'Critical',
    severityClassName: 'border-severity-critical/20 bg-severity-critical/10 text-severity-critical',
    delivery: 'Push notification + Feed',
    detail: 'Always treated as top-priority.',
  },
  {
    severity: 'High',
    severityClassName: 'border-severity-high/20 bg-severity-high/10 text-severity-high',
    delivery: 'Push notification + Feed',
    detail: 'If enabled for the names and volume you allow.',
  },
  {
    severity: 'Medium',
    severityClassName: 'border-severity-medium/20 bg-severity-medium/10 text-severity-medium',
    delivery: 'Feed only',
    detail: 'Visible in the live feed without sending a push.',
  },
  {
    severity: 'Low',
    severityClassName: 'border-severity-low/20 bg-severity-low/10 text-severity-low',
    delivery: 'Feed only',
    detail: 'Kept available in feed for lower-priority review.',
  },
] as const;

const FONT_SCALE_OPTIONS: Array<{
  value: FontScale;
  label: string;
  detail: string;
}> = [
  { value: 'small', label: 'Small', detail: '14px base text for denser layouts.' },
  { value: 'medium', label: 'Medium', detail: '16px base text for the default reading size.' },
  { value: 'large', label: 'Large', detail: '18px base text for easier scanning.' },
];

function getPlatformHint(): 'ios' | 'ios-pwa' | 'android-pwa' | 'pwa' | 'desktop' {
  const ua = navigator.userAgent;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone);

  const isIOS = /iPad|iPhone|iPod/.test(ua);
  // Detect installed iOS PWA before generic iOS Safari
  if (isIOS && isStandalone) return 'ios-pwa';
  if (isIOS) return 'ios';
  if (isStandalone && /Android/i.test(ua)) return 'android-pwa';
  if (isStandalone) return 'pwa';
  return 'desktop';
}

function PushDeniedRecoverySteps() {
  const platform = getPlatformHint();

  const stepBadge = (n: number) => (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-200">
      {n}
    </span>
  );

  if (platform === 'ios-pwa') {
    return (
      <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
        <li className="flex gap-3">{stepBadge(1)}<span>Open your device <strong className="text-text-primary">Settings → Apps</strong></span></li>
        <li className="flex gap-3">{stepBadge(2)}<span>Find this app in the list and tap <strong className="text-text-primary">Notifications</strong></span></li>
        <li className="flex gap-3">{stepBadge(3)}<span>Toggle <strong className="text-text-primary">Allow Notifications</strong> on</span></li>
        <li className="flex gap-3">{stepBadge(4)}<span><strong className="text-text-primary">Return here</strong> and refresh the page</span></li>
      </ol>
    );
  }

  if (platform === 'ios') {
    return (
      <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
        <li className="flex gap-3">{stepBadge(1)}<span>Open your device <strong className="text-text-primary">Settings</strong> app</span></li>
        <li className="flex gap-3">{stepBadge(2)}<span>Go to <strong className="text-text-primary">Safari → Websites → Notifications</strong></span></li>
        <li className="flex gap-3">{stepBadge(3)}<span>Find this site and set to <strong className="text-text-primary">Allow</strong></span></li>
        <li className="flex gap-3">{stepBadge(4)}<span><strong className="text-text-primary">Return here</strong> and refresh the page</span></li>
      </ol>
    );
  }

  if (platform === 'android-pwa') {
    return (
      <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
        <li className="flex gap-3">{stepBadge(1)}<span>Open your device <strong className="text-text-primary">Settings → Apps</strong></span></li>
        <li className="flex gap-3">{stepBadge(2)}<span>Find <strong className="text-text-primary">Event Radar</strong> (or the browser hosting the app)</span></li>
        <li className="flex gap-3">{stepBadge(3)}<span>Tap <strong className="text-text-primary">Notifications → Allow</strong></span></li>
        <li className="flex gap-3">{stepBadge(4)}<span><strong className="text-text-primary">Return here</strong> and refresh the page</span></li>
      </ol>
    );
  }

  if (platform === 'pwa') {
    return (
      <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
        <li className="flex gap-3">{stepBadge(1)}<span>Open your device <strong className="text-text-primary">notification settings</strong></span></li>
        <li className="flex gap-3">{stepBadge(2)}<span>Find <strong className="text-text-primary">Event Radar</strong> and allow notifications</span></li>
        <li className="flex gap-3">{stepBadge(3)}<span>If that doesn&apos;t work, <strong className="text-text-primary">reinstall the app</strong> and grant permission when prompted</span></li>
      </ol>
    );
  }

  return (
    <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
      <li className="flex gap-3">{stepBadge(1)}<span>Click the <strong className="text-text-primary">lock</strong> or <strong className="text-text-primary">info icon</strong> in the address bar</span></li>
      <li className="flex gap-3">{stepBadge(2)}<span>Find <strong className="text-text-primary">Notifications</strong> → change to <strong className="text-text-primary">Allow</strong></span></li>
      <li className="flex gap-3">{stepBadge(3)}<span><strong className="text-text-primary">Refresh the page</strong> and return here to enable push</span></li>
    </ol>
  );
}

type ToastTone = 'success' | 'error';

export function Settings() {
  const location = useLocation();
  const { preferences, setEnabled, setQuietHours, setVolume } = useAlertSound();
  const {
    preferences: squawkPreferences,
    setEnabled: setSquawkEnabled,
    setSpeakWhenHidden,
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
  const [toastTone, setToastTone] = useState<ToastTone>('success');
  const [briefingRestoreMessage, setBriefingRestoreMessage] = useState<string | null>(null);
  const [channelSettings, setChannelSettings] = useState<NotificationChannelSettings | null>(null);
  const [channelLoadError, setChannelLoadError] = useState<string | null>(null);
  const [channelLoaded, setChannelLoaded] = useState(false);
  const [discordUrlDraft, setDiscordUrlDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [channelMinSeverity, setChannelMinSeverity] = useState('HIGH');
  const [channelSaveState, setChannelSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [discordTestState, setDiscordTestState] = useState<'idle' | 'testing' | 'sent'>('idle');
  const [fontScale, setFontScaleState] = useState<FontScale>(() => getStoredFontScale());
  const baselinePreferencesRef = useRef<string>(serializeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES));
  const isChannelSaving = channelSaveState === 'saving';
  const isChannelSaved = channelSaveState === 'saved';
  const isDiscordTesting = discordTestState === 'testing';
  const isDiscordSent = discordTestState === 'sent';

  function showToast(message: string, tone: ToastTone) {
    setToastTone(tone);
    setToastMessage(message);
  }

  function handleRestoreBriefing(): void {
    restoreDailyBriefing();
    setBriefingRestoreMessage("Today's briefing will be shown again.");
  }

  function handleFontScaleChange(nextScale: FontScale): void {
    setFontScaleState(nextScale);
    setStoredFontScale(nextScale);
  }

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

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
    let cancelled = false;

    async function loadChannelSettings(): Promise<void> {
      try {
        setChannelLoadError(null);
        const loaded = await getNotificationChannelSettings();
        if (cancelled) return;
        setChannelSettings(loaded);
        setChannelLoaded(true);
        setDiscordUrlDraft(loaded.discordWebhookUrl ?? '');
        setEmailDraft(loaded.emailAddress ?? '');
        setChannelMinSeverity(loaded.minSeverity);
      } catch {
        if (!cancelled) {
          setChannelLoadError('Could not load notification channel settings.');
        }
      }
    }

    void loadChannelSettings();
    return () => { cancelled = true; };
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

  useEffect(() => {
    if (channelSaveState !== 'saved') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setChannelSaveState('idle');
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [channelSaveState]);

  useEffect(() => {
    if (discordTestState !== 'sent') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDiscordTestState('idle');
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [discordTestState]);

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
          showToast('Preferences saved', 'success');
        })
        .catch(() => {
          setSaveState('error');
          setNotificationError('Could not save notification preferences.');
          showToast('Failed to save. Please try again.', 'error');
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

  async function saveChannelSettings(): Promise<void> {
    try {
      setChannelSaveState('saving');
      const saved = await saveNotificationChannelSettings({
        discordWebhookUrl: discordUrlDraft.trim() || null,
        emailAddress: emailDraft.trim() || null,
        minSeverity: channelMinSeverity,
      });
      setChannelSettings(saved);
      setChannelSaveState('saved');
      showToast('Notification settings saved', 'success');
    } catch {
      setChannelSaveState('idle');
      showToast('Failed to save. Please try again.', 'error');
    }
  }

  async function handleTestDiscord(): Promise<void> {
    if (!discordUrlDraft.trim()) return;
    try {
      setDiscordTestState('testing');
      await testDiscordWebhook(discordUrlDraft.trim());
      setDiscordTestState('sent');
      showToast('Test notification sent to Discord', 'success');
    } catch {
      setDiscordTestState('idle');
      showToast('Discord webhook test failed', 'error');
    }
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

      {/* Appearance/theme panel hidden — light mode is broken, dark only for now */}

      <CollapsiblePanel
        id="display"
        title="Display"
        eyebrow="Display"
        description="Adjust font size and reading comfort across the app."
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[22px] font-semibold text-text-primary">
              Font size
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Stored locally on this device so the app stays comfortable to read every time you open it.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-text-primary">Choose a text size</legend>
            <div className="grid gap-3 md:grid-cols-3">
              {FONT_SCALE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition ${
                    fontScale === option.value
                      ? 'border-accent-default/40 bg-accent-default/10'
                      : 'border-overlay-medium bg-bg-elevated/50 hover:bg-bg-elevated/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-text-primary">{option.label}</span>
                    <input
                      type="radio"
                      name="font-scale"
                      value={option.value}
                      checked={fontScale === option.value}
                      onChange={() => handleFontScaleChange(option.value)}
                      className="h-4 w-4 border-overlay-medium text-accent-default focus:ring-accent-default"
                    />
                  </div>
                  <p className="text-sm leading-6 text-text-secondary">{option.detail}</p>
                </label>
              ))}
            </div>
          </fieldset>
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
              <div className="inline-flex w-fit items-center rounded-full border border-current/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-current/80">
                {pushDetails.state.replaceAll('-', ' ')}
              </div>
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-current/70">
              Permission: {pushState.permission}
            </p>
          </div>

          {pushState.permission === 'denied' ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl" aria-hidden="true">🔒</span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Browser notifications are blocked for this site
                  </p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    You previously denied notification permissions. To re-enable push alerts:
                  </p>
                  <PushDeniedRecoverySteps />
                  <div className="mt-4 rounded-xl border border-overlay-medium bg-bg-surface/50 p-3">
                    <a
                      href="#notification-channels"
                      className="text-xs text-accent-default hover:underline"
                    >
                      Set up Discord or email notifications instead &rarr;
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                Enable push in under a minute
              </p>
              <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-overlay-medium text-xs font-semibold text-text-primary">
                    1
                  </span>
                  <span>Tap {pushDetails.enableLabel}.</span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-overlay-medium text-xs font-semibold text-text-primary">
                    2
                  </span>
                  <span>Allow browser notifications in the prompt.</span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-overlay-medium text-xs font-semibold text-text-primary">
                    3
                  </span>
                  <span>Return to your watchlist to keep alerts focused.</span>
                </li>
              </ol>
            </div>
          )}

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
        id="notification-channels"
        title="Notification channels"
        eyebrow="Channels"
        description="Discord webhook and email fallback channels."
        defaultOpen
        className="scroll-mt-24"
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[22px] font-semibold text-text-primary">
              Notification channels
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Get event alerts delivered to Discord or email when push notifications are unavailable.
            </p>
          </div>

          {channelLoadError && (
            <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <span>{channelLoadError}</span>
              <button
                type="button"
                onClick={() => {
                  setChannelLoadError(null);
                  void (async () => {
                    try {
                      const loaded = await getNotificationChannelSettings();
                      setChannelSettings(loaded);
                      setChannelLoaded(true);
                      setDiscordUrlDraft(loaded.discordWebhookUrl ?? '');
                      setEmailDraft(loaded.emailAddress ?? '');
                      setChannelMinSeverity(loaded.minSeverity);
                    } catch {
                      setChannelLoadError('Could not load notification channel settings.');
                    }
                  })();
                }}
                className="shrink-0 rounded-full border border-red-500/30 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20"
              >
                Retry
              </button>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Discord Webhook</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Get a webhook URL from Discord: Server Settings &rarr; Integrations &rarr; Webhooks &rarr; New Webhook
              </p>
            </div>

            <label className="block space-y-2" htmlFor="discord-webhook-url">
              <span className="block text-sm font-medium text-text-primary">Discord Webhook URL</span>
              <input
                id="discord-webhook-url"
                type="url"
                value={discordUrlDraft}
                onChange={(e) => setDiscordUrlDraft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-overlay-subtle px-4 text-text-primary placeholder:text-text-tertiary outline-none focus:ring-2 focus:ring-accent-default"
              />
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { void handleTestDiscord(); }}
                disabled={!discordUrlDraft.trim() || isDiscordTesting}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDiscordSent
                    ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20'
                    : 'border-overlay-medium bg-transparent text-text-secondary hover:bg-overlay-light'
                }`}
              >
                {isDiscordTesting ? 'Testing...' : isDiscordSent ? 'Sent ✓' : 'Test'}
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Email Digest</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Coming soon — daily email digest of important events
              </p>
            </div>

            <label className="block space-y-2" htmlFor="email-address">
              <span className="block text-sm font-medium text-text-tertiary">Email address</span>
              <input
                id="email-address"
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="user@example.com"
                disabled
                className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-overlay-subtle px-4 text-text-tertiary placeholder:text-text-tertiary outline-none opacity-50 cursor-not-allowed"
              />
            </label>
          </div>

          <div className="space-y-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
            <label className="block space-y-2" htmlFor="channel-min-severity">
              <span className="block text-sm font-medium text-text-primary">Minimum severity</span>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Only deliver events at or above this severity level.
              </p>
              <select
                id="channel-min-severity"
                value={channelMinSeverity}
                onChange={(e) => setChannelMinSeverity(e.target.value)}
                className="min-h-11 w-full rounded-2xl border border-overlay-medium bg-bg-elevated px-4 text-text-primary outline-none focus:ring-2 focus:ring-accent-default"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => { void saveChannelSettings(); }}
            disabled={isChannelSaving || (!channelLoaded && !channelSettings)}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50 ${
              isChannelSaved
                ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20'
                : 'border-overlay-medium bg-overlay-light text-text-primary hover:bg-overlay-medium'
            }`}
          >
            {isChannelSaving ? 'Saving...' : isChannelSaved ? 'Saved ✓' : 'Save'}
          </button>
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
            <div className="inline-flex w-fit items-center rounded-full border border-overlay-medium bg-overlay-light px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
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
                  <p className="text-sm font-medium text-text-primary">Signal tier delivery</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    This is how Event Radar separates push-worthy alerts from feed-only activity.
                  </p>
                </div>

                <div className="space-y-3">
                  {SIGNAL_TIER_ROWS.map((row) => (
                    <div
                      key={row.severity}
                      className="flex flex-col gap-3 rounded-2xl border border-overlay-medium bg-bg-surface/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`inline-flex min-w-[88px] items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${row.severityClassName}`}
                        >
                          {row.severity}
                        </span>
                        <p className="text-sm leading-6 text-text-secondary">{row.detail}</p>
                      </div>
                      <div className="inline-flex items-center rounded-full border border-overlay-medium bg-overlay-subtle px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-primary">
                        {row.delivery}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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

              <div className="rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
                <p className="text-sm font-medium text-text-primary">Daily Briefing</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  If you dismissed the morning briefing, bring it back without waiting for tomorrow.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={handleRestoreBriefing}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-overlay-medium bg-overlay-light px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-overlay-medium focus:outline-none focus:ring-2 focus:ring-accent-default"
                  >
                    Show today's briefing
                  </button>
                  {briefingRestoreMessage ? (
                    <p className="text-sm leading-6 text-text-secondary">{briefingRestoreMessage}</p>
                  ) : null}
                </div>
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
        description="Critical-only spoken alerts with a short attention tone."
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[22px] font-semibold text-text-primary">
              Audio squawk
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Plays a short tone, then reads new CRITICAL event headlines with your browser&apos;s built-in text-to-speech.
            </p>
          </div>

          <label className="flex items-center justify-between gap-4" htmlFor="squawk-toggle">
            <span>
              <span className="block text-sm font-medium text-text-primary">Audio alerts for CRITICAL events</span>
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
            <label className="flex items-center justify-between gap-4" htmlFor="squawk-hidden-toggle">
              <span>
                <span className="block text-sm font-medium text-text-primary">Speak while this tab is hidden</span>
                <span className="mt-1 block text-xs text-text-secondary">
                  Leave this off to keep spoken alerts limited to the visible tab.
                </span>
              </span>
              <input
                id="squawk-hidden-toggle"
                type="checkbox"
                checked={squawkPreferences.speakWhenHidden}
                onChange={(event) => setSpeakWhenHidden(event.target.checked)}
                className="h-5 w-5 rounded border-overlay-medium bg-transparent text-accent-default focus:ring-accent-default"
              />
            </label>
          ) : (
            <p className="text-sm leading-6 text-text-secondary">
              Turn this on only if you want an audible callout for top-priority alerts.
            </p>
          )}
        </div>
      </CollapsiblePanel>

      {toastMessage ? (
        <div className={`fixed bottom-5 right-5 rounded-full border px-4 py-2 text-sm font-medium shadow-[0_18px_40px_var(--shadow-color)] ${
          toastTone === 'error'
            ? 'border-rose-400/20 bg-rose-50 text-rose-800 dark:bg-[#240d0d] dark:text-rose-100'
            : 'border-emerald-400/20 bg-emerald-50 text-emerald-800 dark:bg-[#0d241d] dark:text-emerald-100'
        }`}>
          {toastMessage}
        </div>
      ) : null}
    </section>
  );
}
