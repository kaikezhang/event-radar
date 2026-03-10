import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  ok,
  err,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';

const POLL_INTERVAL_MS = 300_000; // 5 minutes
const PROBABILITY_SHIFT_THRESHOLD = 10; // percentage points

export interface FomcMeeting {
  meetingDate: string;
  rateTarget: string;
  probabilityPct: number;
}

export interface FedWatchApiResponse {
  meetings: Array<{
    meetingDate: string;
    targets: Array<{
      rate: string;
      probability: number;
    }>;
  }>;
}

/**
 * Parse the FedWatch API response into the most likely outcome per meeting.
 * Returns the top-probability target for each of the next 3 meetings.
 */
export function parseFedWatchResponse(
  json: FedWatchApiResponse,
): FomcMeeting[] {
  if (!json?.meetings) return [];

  const results: FomcMeeting[] = [];

  for (const meeting of json.meetings.slice(0, 3)) {
    if (!meeting.targets?.length) continue;

    // Find the highest probability target
    let best = meeting.targets[0]!;
    for (const target of meeting.targets) {
      if (target.probability > best.probability) {
        best = target;
      }
    }

    results.push({
      meetingDate: meeting.meetingDate,
      rateTarget: best.rate,
      probabilityPct: best.probability,
    });
  }

  return results;
}

/**
 * Detect significant probability shifts between two snapshots.
 */
export function detectShifts(
  previous: FomcMeeting[],
  current: FomcMeeting[],
  threshold = PROBABILITY_SHIFT_THRESHOLD,
): Array<{
  meetingDate: string;
  rateTarget: string;
  probabilityPct: number;
  previousProbabilityPct: number;
  shiftPct: number;
}> {
  const prevMap = new Map<string, FomcMeeting>();
  for (const m of previous) {
    prevMap.set(m.meetingDate, m);
  }

  const shifts: Array<{
    meetingDate: string;
    rateTarget: string;
    probabilityPct: number;
    previousProbabilityPct: number;
    shiftPct: number;
  }> = [];

  for (const curr of current) {
    const prev = prevMap.get(curr.meetingDate);
    if (!prev) continue;

    const shift = Math.abs(curr.probabilityPct - prev.probabilityPct);
    if (shift >= threshold) {
      shifts.push({
        meetingDate: curr.meetingDate,
        rateTarget: curr.rateTarget,
        probabilityPct: curr.probabilityPct,
        previousProbabilityPct: prev.probabilityPct,
        shiftPct: shift,
      });
    }
  }

  return shifts;
}

export class FedWatchScanner extends BaseScanner {
  private previousMeetings: FomcMeeting[] = [];
  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(eventBus: EventBus) {
    super({
      name: 'fedwatch',
      source: 'fedwatch',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(
        'https://www.cmegroup.com/services/fed-funds-futures/fomc-meetings.json',
        {
          headers: {
            'User-Agent': 'event-radar/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        return err(new Error(`FedWatch API returned ${response.status}`));
      }

      const json = (await response.json()) as FedWatchApiResponse;
      const meetings = parseFedWatchResponse(json);

      const events: RawEvent[] = [];

      // Always emit a snapshot event on first poll
      if (this.previousMeetings.length === 0 && meetings.length > 0) {
        events.push({
          id: randomUUID(),
          source: 'fedwatch',
          type: 'rate-forecast-snapshot',
          title: `FedWatch snapshot — ${meetings.map((m) => `${m.meetingDate}: ${m.rateTarget} (${m.probabilityPct.toFixed(1)}%)`).join(', ')}`,
          body: `CME FedWatch rate forecast for next ${meetings.length} FOMC meetings.`,
          timestamp: new Date(),
          metadata: {
            meetings: meetings.map((m) => ({
              meeting_date: m.meetingDate,
              rate_target: m.rateTarget,
              probability_pct: m.probabilityPct,
            })),
          },
        });
      }

      // Detect probability shifts
      const shifts = detectShifts(this.previousMeetings, meetings);
      for (const shift of shifts) {
        const direction =
          shift.probabilityPct > shift.previousProbabilityPct ? 'up' : 'down';

        events.push({
          id: randomUUID(),
          source: 'fedwatch',
          type: 'rate-forecast',
          title: `FedWatch: ${shift.meetingDate} rate probability shift ${direction} ${shift.shiftPct.toFixed(1)}pp`,
          body: `CME FedWatch probability for ${shift.rateTarget} at ${shift.meetingDate} shifted ${direction} from ${shift.previousProbabilityPct.toFixed(1)}% to ${shift.probabilityPct.toFixed(1)}% (${shift.shiftPct.toFixed(1)}pp change).`,
          timestamp: new Date(),
          metadata: {
            meeting_date: shift.meetingDate,
            rate_target: shift.rateTarget,
            probability_pct: shift.probabilityPct,
            previous_probability_pct: shift.previousProbabilityPct,
            shift_pct: shift.shiftPct,
          },
        });
      }

      this.previousMeetings = meetings;

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
