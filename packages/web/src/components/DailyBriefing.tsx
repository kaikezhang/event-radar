import { useState } from 'react';
import { X } from 'lucide-react';
import type { AlertSummary } from '../types/index.js';

const DISMISSED_KEY = 'lastBriefingDismissed';
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA');
}

function isDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === getTodayDate();
  } catch {
    return false;
  }
}

interface DailyBriefingProps {
  alerts: AlertSummary[];
  scope?: 'watchlist' | 'all';
}

export function DailyBriefing({ alerts, scope = 'watchlist' }: DailyBriefingProps) {
  const [dismissed, setDismissed] = useState(isDismissedToday);

  if (dismissed) return null;

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recentAlerts = alerts.filter((a) => new Date(a.time).getTime() >= oneDayAgo);
  const count = recentAlerts.length;

  // Find highest severity event
  const topEvent = recentAlerts.reduce<AlertSummary | null>((best, alert) => {
    if (!best) return alert;
    const bestScore = SEVERITY_ORDER[best.severity] ?? 0;
    const currentScore = SEVERITY_ORDER[alert.severity] ?? 0;
    return currentScore > bestScore ? alert : best;
  }, null);

  // Count outcome stats from all alerts (not just last 24h)
  const withOutcome = alerts.filter(
    (a) => a.direction && a.direction !== 'neutral' && a.change5d != null,
  );
  const correctCount = withOutcome.filter((a) => {
    const isBearish = a.direction?.toLowerCase() === 'bearish';
    const priceDown = (a.change5d ?? 0) < 0;
    return isBearish ? priceDown : !priceDown;
  }).length;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, getTodayDate());
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl border border-accent-default/20 bg-[linear-gradient(135deg,rgba(249,115,22,0.08),rgba(59,130,246,0.06))] p-4 shadow-[0_8px_24px_var(--shadow-color)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">📰</span>
          <h2 className="text-sm font-semibold text-text-primary">
            Daily Briefing — {today}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full p-1 text-text-tertiary transition hover:bg-overlay-medium hover:text-text-secondary"
          aria-label="Dismiss briefing"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2 text-sm text-text-secondary">
        <p>
          <span className="font-semibold text-text-primary">{count}</span>{' '}
          {count === 1 ? 'event' : 'events'} detected in the last 24h
          {count > 0 ? (scope === 'all' ? ' across all events' : ' for your watchlist') : ''}
        </p>

        {topEvent && (
          <p>
            <span className="font-medium text-text-primary">Top event:</span>{' '}
            {topEvent.title}
          </p>
        )}

        {withOutcome.length > 0 && (
          <p>
            <span className="font-medium text-text-primary">Prediction accuracy:</span>{' '}
            {correctCount}/{withOutcome.length} correct
          </p>
        )}
      </div>
    </div>
  );
}
