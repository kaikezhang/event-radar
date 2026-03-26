import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Pre-event alert window in minutes */
const PRE_ALERT_MINUTES = 15;

export interface EconIndicator {
  id: string;
  name: string;
  source: string;
  frequency: string;
  releaseTime: string;
  timezone: string;
  tags: string[];
  severity: string;
}

export interface EconRelease {
  indicatorId: string;
  date: string;
}

export interface EconCalendarConfig {
  indicators: EconIndicator[];
  releases: EconRelease[];
}

export interface ScheduledRelease {
  indicator: EconIndicator;
  scheduledTime: Date;
  releaseKey: string;
}

export function loadCalendarConfig(configPath?: string): EconCalendarConfig {
  const path =
    configPath ??
    join(
      import.meta.dirname ?? __dirname,
      '..',
      'config',
      'econ-calendar.json',
    );
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as EconCalendarConfig;
}

export function getScheduledReleases(
  config: EconCalendarConfig,
): ScheduledRelease[] {
  const indicatorMap = new Map<string, EconIndicator>();
  for (const ind of config.indicators) {
    indicatorMap.set(ind.id, ind);
  }

  const releases: ScheduledRelease[] = [];

  for (const rel of config.releases) {
    const indicator = indicatorMap.get(rel.indicatorId);
    if (!indicator) continue;

    const [hours, minutes] = indicator.releaseTime.split(':').map(Number);
    const date = new Date(`${rel.date}T00:00:00Z`);
    date.setUTCHours((hours ?? 8) + 5, minutes ?? 30, 0, 0);

    releases.push({
      indicator,
      scheduledTime: date,
      releaseKey: `${rel.indicatorId}-${rel.date}`,
    });
  }

  return releases;
}

export function isPreAlertWindow(
  scheduledTime: Date,
  now: Date,
  windowMinutes = PRE_ALERT_MINUTES,
): boolean {
  const diff = scheduledTime.getTime() - now.getTime();
  const diffMinutes = diff / (1000 * 60);
  return diffMinutes > 0 && diffMinutes <= windowMinutes;
}

export function isPostRelease(scheduledTime: Date, now: Date): boolean {
  const diff = now.getTime() - scheduledTime.getTime();
  const diffMinutes = diff / (1000 * 60);
  return diffMinutes >= 0 && diffMinutes <= 5;
}
