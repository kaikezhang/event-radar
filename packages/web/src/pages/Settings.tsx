import { useAlertSound } from '../hooks/useAlertSound.js';

export function Settings() {
  const { preferences, setEnabled, setQuietHours, setVolume } = useAlertSound();

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
    </section>
  );
}
