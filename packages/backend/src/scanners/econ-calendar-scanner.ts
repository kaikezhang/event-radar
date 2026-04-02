import { randomUUID } from 'node:crypto';
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
/** How often to refresh the remote feed (1 hour) */
const FEED_REFRESH_MS = 60 * 60_000;
/** Pre-event alert window in minutes */
const PRE_ALERT_MINUTES = 15;
/** Post-release window in minutes */
const POST_RELEASE_MINUTES = 5;

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

/** Minimum impact level to emit events for */
const IMPACT_FILTER = new Set(['High', 'Medium']);
/** Only USD events */
const COUNTRY_FILTER = 'USD';

export interface FeedEvent {
  title: string;
  country: string;
  date: string; // ISO 8601 with offset, e.g. "2026-04-03T08:30:00-04:00"
  impact: string; // "High" | "Medium" | "Low"
  forecast: string;
  previous: string;
}

export interface ParsedRelease {
  title: string;
  scheduledTime: Date;
  releaseKey: string;
  impact: string;
  forecast: string;
  previous: string;
}

/**
 * Derive tags from event title for metadata.
 */
function deriveTags(title: string): string[] {
  const tags: string[] = [];
  const lower = title.toLowerCase();
  if (lower.includes('cpi') || lower.includes('inflation')) tags.push('inflation');
  if (lower.includes('nfp') || lower.includes('non-farm') || lower.includes('employment')) tags.push('employment');
  if (lower.includes('ppi') || lower.includes('producer price')) tags.push('ppi');
  if (lower.includes('gdp')) tags.push('gdp');
  if (lower.includes('retail sales')) tags.push('retail');
  if (lower.includes('jobless') || lower.includes('unemployment')) tags.push('employment');
  if (lower.includes('fomc') || lower.includes('fed') || lower.includes('interest rate')) tags.push('fed', 'rates');
  if (lower.includes('ism') || lower.includes('pmi')) tags.push('manufacturing');
  if (lower.includes('housing') || lower.includes('home sales')) tags.push('housing');
  if (lower.includes('consumer') && lower.includes('confidence')) tags.push('sentiment');
  if (lower.includes('speaks') || lower.includes('testimony')) tags.push('speech');
  if (lower.includes('trump') || lower.includes('president')) tags.push('political');
  return [...new Set(tags)];
}

/**
 * Map ForexFactory impact to our severity levels.
 */
function impactToSeverity(impact: string): string {
  if (impact === 'High') return 'HIGH';
  if (impact === 'Medium') return 'MEDIUM';
  return 'LOW';
}

/**
 * Check if a release time is within the pre-alert window.
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
 * Check if the release has just occurred (within post-release window).
 */
export function isPostRelease(
  scheduledTime: Date,
  now: Date,
  windowMinutes = POST_RELEASE_MINUTES,
): boolean {
  const diff = now.getTime() - scheduledTime.getTime();
  const diffMinutes = diff / (1000 * 60);
  return diffMinutes >= 0 && diffMinutes <= windowMinutes;
}

/**
 * Parse feed events into structured releases.
 */
export function parseFeedEvents(events: FeedEvent[]): ParsedRelease[] {
  const releases: ParsedRelease[] = [];

  for (const event of events) {
    if (event.country !== COUNTRY_FILTER) continue;
    if (!IMPACT_FILTER.has(event.impact)) continue;

    const scheduledTime = new Date(event.date);
    if (isNaN(scheduledTime.getTime())) continue;

    // Build a unique key from title + date
    const dateStr = scheduledTime.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    const releaseKey = `${event.title.replace(/\s+/g, '-').toLowerCase()}-${dateStr}`;

    releases.push({
      title: event.title,
      scheduledTime,
      releaseKey,
      impact: event.impact,
      forecast: event.forecast,
      previous: event.previous,
    });
  }

  return releases;
}

export class EconCalendarScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'econ-calendar');
  private cachedReleases: ParsedRelease[] = [];
  private lastFetchMs = 0;
  /** Allow injecting "now" for testing */
  public nowFn: () => Date = () => new Date();
  /** Allow injecting fetch for testing */
  public fetchFn: (url: string) => Promise<Response> = (url) => fetch(url);
  /** Allow injecting feed data for testing */
  public testFeedData: FeedEvent[] | null = null;

  constructor(eventBus: EventBus) {
    super({
      name: 'econ-calendar',
      source: 'econ-calendar',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  /**
   * Fetch the feed data, with caching.
   */
  private async refreshFeed(): Promise<ParsedRelease[]> {
    // Use test data if provided
    if (this.testFeedData) {
      return parseFeedEvents(this.testFeedData);
    }

    const now = Date.now();
    if (now - this.lastFetchMs < FEED_REFRESH_MS && this.cachedReleases.length > 0) {
      return this.cachedReleases;
    }

    try {
      const resp = await this.fetchFn(FEED_URL);
      if (!resp.ok) {
        console.warn(`[econ-calendar] Feed fetch failed: ${resp.status}`);
        return this.cachedReleases; // Use stale cache on error
      }
      const data = (await resp.json()) as FeedEvent[];
      this.cachedReleases = parseFeedEvents(data);
      this.lastFetchMs = now;
      console.log(
        `[econ-calendar] Refreshed feed: ${this.cachedReleases.length} USD High/Medium events this week`,
      );
    } catch (e) {
      console.warn(`[econ-calendar] Feed fetch error:`, e);
      // Keep stale cache
    }

    return this.cachedReleases;
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const releases = await this.refreshFeed();
      const events: RawEvent[] = [];
      const now = this.nowFn();

      for (const release of releases) {
        const preKey = `pre-${release.releaseKey}`;
        const postKey = `post-${release.releaseKey}`;

        // Pre-event alert
        if (isPreAlertWindow(release.scheduledTime, now) && !this.seenIds.has(preKey)) {
          this.seenIds.add(preKey);

          const minutesUntil = Math.round(
            (release.scheduledTime.getTime() - now.getTime()) / (1000 * 60),
          );

          const body = release.forecast
            ? `${release.title} releasing in ${minutesUntil} min. Forecast: ${release.forecast}, Previous: ${release.previous}.`
            : `${release.title} scheduled in ${minutesUntil} min.`;

          events.push({
            id: randomUUID(),
            source: 'econ-calendar',
            type: 'economic-release-upcoming',
            title: `${release.title} releasing in ${minutesUntil} min`,
            body,
            timestamp: now,
            metadata: {
              event_name: release.title,
              scheduled_time: release.scheduledTime.toISOString(),
              minutes_until: minutesUntil,
              impact: release.impact,
              severity: impactToSeverity(release.impact),
              forecast: release.forecast,
              previous: release.previous,
              tags: deriveTags(release.title),
            },
          });
        }

        // Post-release alert
        if (isPostRelease(release.scheduledTime, now) && !this.seenIds.has(postKey)) {
          this.seenIds.add(postKey);

          const body = release.forecast
            ? `${release.title} data released. Forecast was: ${release.forecast}, Previous: ${release.previous}. Check official source for actual values.`
            : `${release.title} has occurred. Check official source for details.`;

          events.push({
            id: randomUUID(),
            source: 'econ-calendar',
            type: 'economic-release',
            title: `${release.title} — Data Released`,
            body,
            timestamp: now,
            metadata: {
              event_name: release.title,
              scheduled_time: release.scheduledTime.toISOString(),
              impact: release.impact,
              severity: impactToSeverity(release.impact),
              forecast: release.forecast,
              previous: release.previous,
              tags: deriveTags(release.title),
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
