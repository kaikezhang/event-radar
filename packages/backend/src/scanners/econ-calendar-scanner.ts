import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BaseScanner,
  ok,
  err,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { SeenIdBuffer } from './scraping/scrape-utils.js';

const POLL_INTERVAL_MS = 60_000;
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
  date: string; // YYYY-MM-DD
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

/**
 * Load and parse the static economic calendar config.
 */
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

/**
 * Build a list of upcoming scheduled releases from the config,
 * including the full scheduled datetime.
 */
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

    // Parse date + release time into a Date (assume ET → UTC offset manually)
    // releaseTime is "HH:MM" in ET, ET is UTC-5 (EST) or UTC-4 (EDT)
    // For simplicity, use UTC-5 (EST)
    const [hours, minutes] = indicator.releaseTime.split(':').map(Number);
    const date = new Date(`${rel.date}T00:00:00Z`);
    date.setUTCHours((hours ?? 8) + 5, minutes ?? 30, 0, 0); // EST → UTC

    const releaseKey = `${rel.indicatorId}-${rel.date}`;

    releases.push({ indicator, scheduledTime: date, releaseKey });
  }

  return releases;
}

/**
 * Check if a release time is within the pre-alert window (15 min before).
 */
export function isPreAlertWindow(
  scheduledTime: Date,
  now: Date,
  windowMinutes = PRE_ALERT_MINUTES,
): boolean {
  const diff = scheduledTime.getTime() - now.getTime();
  const diffMinutes = diff / (1000 * 60);
  return diffMinutes > 0 && diffMinutes <= windowMinutes;
}

/**
 * Check if the release has just occurred (within 5 minutes after scheduled time).
 */
export function isPostRelease(scheduledTime: Date, now: Date): boolean {
  const diff = now.getTime() - scheduledTime.getTime();
  const diffMinutes = diff / (1000 * 60);
  return diffMinutes >= 0 && diffMinutes <= 5;
}

export class EconCalendarScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'econ-calendar');
  private readonly config: EconCalendarConfig;
  private readonly scheduledReleases: ScheduledRelease[];
  /** Allow injecting "now" for testing */
  public nowFn: () => Date = () => new Date();

  constructor(eventBus: EventBus, config?: EconCalendarConfig) {
    super({
      name: 'econ-calendar',
      source: 'econ-calendar',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });

    this.config = config ?? loadCalendarConfig();
    this.scheduledReleases = getScheduledReleases(this.config);
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const events: RawEvent[] = [];
      const now = this.nowFn();

      console.log(`[econ-calendar] Checking ${this.scheduledReleases.length} releases at ${now.toISOString()}`);

      for (const release of this.scheduledReleases) {
        const preKey = `pre-${release.releaseKey}`;
        const postKey = `post-${release.releaseKey}`;

        // Pre-event alert
        if (isPreAlertWindow(release.scheduledTime, now) && !this.seenIds.has(preKey)) {
          this.seenIds.add(preKey);

          const minutesUntil = Math.round(
            (release.scheduledTime.getTime() - now.getTime()) / (1000 * 60),
          );

          events.push({
            id: randomUUID(),
            source: 'econ-calendar',
            type: 'economic-release-upcoming',
            title: `${release.indicator.name} releasing in ${minutesUntil} min`,
            body: `${release.indicator.name} is scheduled for release at ${release.indicator.releaseTime} ET. Source: ${release.indicator.source}.`,
            timestamp: now,
            metadata: {
              indicator: release.indicator.id,
              indicator_name: release.indicator.name,
              scheduled_time: release.scheduledTime.toISOString(),
              minutes_until: minutesUntil,
              frequency: release.indicator.frequency,
              tags: release.indicator.tags,
            },
          });
        }

        // Post-release alert
        if (isPostRelease(release.scheduledTime, now) && !this.seenIds.has(postKey)) {
          this.seenIds.add(postKey);

          events.push({
            id: randomUUID(),
            source: 'econ-calendar',
            type: 'economic-release',
            title: `${release.indicator.name} — Data Released`,
            body: `${release.indicator.name} data has been released. Check official source for actual values.`,
            timestamp: now,
            metadata: {
              indicator: release.indicator.id,
              indicator_name: release.indicator.name,
              scheduled_time: release.scheduledTime.toISOString(),
              frequency: release.indicator.frequency,
              tags: release.indicator.tags,
            },
          });
        }
      }

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
