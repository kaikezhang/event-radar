import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  err,
  ok,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import {
  getScheduledReleases,
  isPostRelease,
  isPreAlertWindow,
  loadCalendarConfig,
  type EconCalendarConfig,
  type EconIndicator,
  type EconRelease,
  type ScheduledRelease,
} from '../utils/econ-calendar.js';
import { SeenIdBuffer } from './scraping/scrape-utils.js';

const POLL_INTERVAL_MS = 60_000;
export {
  getScheduledReleases,
  isPostRelease,
  isPreAlertWindow,
  loadCalendarConfig,
  type EconCalendarConfig,
  type EconIndicator,
  type EconRelease,
  type ScheduledRelease,
};

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

      console.log(
        `[econ-calendar] Checking ${this.scheduledReleases.length} releases at ${now.toISOString()}`,
      );

      for (const release of this.scheduledReleases) {
        const preKey = `pre-${release.releaseKey}`;
        const postKey = `post-${release.releaseKey}`;

        // Pre-event alert
        if (
          isPreAlertWindow(release.scheduledTime, now) &&
          !this.seenIds.has(preKey)
        ) {
          this.seenIds.add(preKey);

          const minutesUntil = Math.round(
            (release.scheduledTime.getTime() - now.getTime()) / (1000 * 60),
          );

          events.push({
            id: randomUUID(),
            source: 'econ-calendar',
            type: 'economic-release-upcoming',
            title: `${release.indicator.name} releasing in ${minutesUntil} min`,
            body:
              `${release.indicator.name} is scheduled for release at ` +
              `${release.indicator.releaseTime} ET. Source: ${release.indicator.source}.`,
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
        if (
          isPostRelease(release.scheduledTime, now) &&
          !this.seenIds.has(postKey)
        ) {
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
