import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAlertSound } from '../hooks/useAlertSound.js';
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

export function Settings() {
  const location = useLocation();
  const { preferences, setEnabled, setQuietHours, setVolume } = useAlertSound();
  const [pushState, setPushState] = useState<WebPushDeviceState>(() => ({
    ...getWebPushSupport(),
    subscribed: false,
  }));
  const [backendRegistrationFailed, setBackendRegistrationFailed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(() => getWebPushSupport().supported);
  const [isPushActionPending, setIsPushActionPending] = useState(false);

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
    neutral: 'border-white/10 bg-white/5 text-text-primary',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    warning: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    danger: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
  }[pushDetails.tone];
  const fromWatchlist = new URLSearchParams(location.search).get('from') === 'watchlist';

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
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

      <div
        id="push-alerts"
        className="space-y-4 rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
            Web Push
          </p>
          <h2 className="mt-3 text-[22px] font-semibold text-text-primary">
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

        <div className="rounded-2xl border border-white/8 bg-bg-elevated/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Enable push in under a minute
          </p>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
            <li className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-text-primary">
                1
              </span>
              <span>Tap {pushDetails.enableLabel}.</span>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-text-primary">
                2
              </span>
              <span>Allow browser notifications in the prompt.</span>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-text-primary">
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
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushDetails.enableLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void disableWebPush();
            }}
            disabled={!pushDetails.canDisable}
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushDetails.disableLabel}
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/watchlist"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Review watchlist
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            Open live feed
          </Link>
        </div>
      </div>

      <div className="space-y-4 rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
            Sound
          </p>
          <h2 className="mt-3 text-[22px] font-semibold text-text-primary">
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
    </section>
  );
}
