import { useEffect, useState } from 'react';
import { Bell, BellOff, Info, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
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

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

const STATUS_STYLES = {
  neutral: 'border-border-default bg-bg-surface text-text-secondary',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-200',
} as const;

export function Settings() {
  const location = useLocation();
  const [pushState, setPushState] = useState<WebPushDeviceState>(() => ({
    ...getWebPushSupport(),
    subscribed: false,
  }));
  const [backendRegistrationFailed, setBackendRegistrationFailed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(() => getWebPushSupport().supported);
  const [isPushActionPending, setIsPushActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fromWatchlist = new URLSearchParams(location.search).get('from') === 'watchlist';

  useEffect(() => {
    let cancelled = false;

    async function loadPushState() {
      try {
        const nextState = await getWebPushDeviceState();
        if (!cancelled) {
          setPushState(nextState);
        }
      } catch {
        if (!cancelled) {
          setPushState((current) => ({ ...current, ...getWebPushSupport() }));
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

    void loadPushState();

    return () => {
      cancelled = true;
    };
  }, [pushState.supported]);

  const pushDetails = getWebPushStatusDetails({
    ...pushState,
    isBusy: isPushLoading || isPushActionPending,
    backendRegistrationFailed,
  });

  async function refreshPushState() {
    setPushState(await getWebPushDeviceState());
  }

  async function handlePushAction() {
    setErrorMessage(null);
    setBackendRegistrationFailed(false);
    setIsPushActionPending(true);

    try {
      if (pushDetails.canDisable) {
        await unsubscribeBrowserFromPush();
        await refreshPushState();
        return;
      }

      if (pushDetails.canEnable) {
        const subscription = await subscribeBrowserToPush();
        await sendPushSubscriptionToBackend(subscription);
        await refreshPushState();
      }
    } catch (error) {
      if (error instanceof WebPushError) {
        if (error.code === 'backend-registration-failed') {
          setBackendRegistrationFailed(true);
        }

        if (error.code === 'permission-denied') {
          setPushState((current) => ({ ...current, permission: 'denied' }));
        }
      }

      setErrorMessage(error instanceof Error ? error.message : 'Could not update push alerts.');
    } finally {
      setIsPushActionPending(false);
    }
  }

  const actionLabel = pushDetails.canDisable ? pushDetails.disableLabel : pushDetails.enableLabel;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Keep it simple</h1>
        <p className="max-w-xl text-sm leading-6 text-text-secondary">
          Dark mode is always on. This page only keeps browser push alerts available on this device and explains what Event Radar is for.
        </p>
      </section>

      {fromWatchlist ? (
        <section className="rounded-3xl border border-accent-default/20 bg-accent-default/8 p-5">
          <p className="text-sm font-medium text-text-primary">Enable push before you leave settings.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Watchlist alerts work best when this device is subscribed for browser notifications.
          </p>
          <Link to="/watchlist" className="mt-3 inline-flex text-sm font-medium text-accent-default hover:underline">
            Back to watchlist
          </Link>
        </section>
      ) : null}

      <section className="rounded-3xl border border-border-default bg-bg-surface/95 p-6 shadow-[0_18px_40px_var(--shadow-color)]">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-2xl bg-bg-elevated p-3 text-text-secondary">
            {pushDetails.canDisable ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Notifications on this device</h2>
            <p className="mt-1 text-sm text-text-secondary">{pushDetails.description}</p>
          </div>
        </div>

        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${STATUS_STYLES[pushDetails.tone]}`}>
          <p className="font-medium">{pushDetails.title}</p>
        </div>

        {errorMessage ? (
          <p className="mt-4 text-sm text-red-300">{errorMessage}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handlePushAction();
            }}
            disabled={!pushDetails.canEnable && !pushDetails.canDisable}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-accent-default px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionLabel}
          </button>
          <p className="text-xs text-text-tertiary">
            Browser permission + device subscription only. No quiet hours, caps, or extra channel setup.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-border-default bg-bg-surface/95 p-6 shadow-[0_18px_40px_var(--shadow-color)]">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-2xl bg-bg-elevated p-3 text-text-secondary">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">About Event Radar</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Event Radar watches filings, policy moves, macro releases, and fast news sources, then pushes the highest-signal market events into a single feed.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border-default bg-bg-elevated/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <ShieldCheck className="h-4 w-4 text-accent-default" />
              Visual mode
            </div>
            <p className="mt-2 text-sm text-text-secondary">Dark mode is enforced across the product.</p>
          </div>
          <div className="rounded-2xl border border-border-default bg-bg-elevated/60 p-4">
            <p className="text-sm font-medium text-text-primary">App version</p>
            <p className="mt-2 text-sm text-text-secondary">{APP_VERSION}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
