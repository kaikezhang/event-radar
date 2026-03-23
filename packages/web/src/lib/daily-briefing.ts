export const DAILY_BRIEFING_DISMISSED_KEY = 'lastBriefingDismissed';

export function getTodayDateKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function isDailyBriefingDismissedToday(): boolean {
  try {
    return localStorage.getItem(DAILY_BRIEFING_DISMISSED_KEY) === getTodayDateKey();
  } catch {
    return false;
  }
}

export function dismissDailyBriefingForToday(): void {
  try {
    localStorage.setItem(DAILY_BRIEFING_DISMISSED_KEY, getTodayDateKey());
  } catch {
    // ignore storage failures
  }
}

export function restoreDailyBriefing(): void {
  try {
    localStorage.removeItem(DAILY_BRIEFING_DISMISSED_KEY);
  } catch {
    // ignore storage failures
  }
}
