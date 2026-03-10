import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  FedWatchScanner,
  parseFedWatchResponse,
  detectShifts,
  type FedWatchApiResponse,
  type FomcMeeting,
} from '../scanners/fedwatch-scanner.js';

const mockFedWatchResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-fedwatch-response.json'),
    'utf-8',
  ),
) as FedWatchApiResponse;

describe('FedWatchScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseFedWatchResponse', () => {
    it('should parse meetings from fixture', () => {
      const meetings = parseFedWatchResponse(mockFedWatchResponse);
      expect(meetings).toHaveLength(3);
    });

    it('should select highest probability target per meeting', () => {
      const meetings = parseFedWatchResponse(mockFedWatchResponse);
      // First meeting: 4.25-4.50 at 65.2%
      expect(meetings[0]!.rateTarget).toBe('4.25-4.50');
      expect(meetings[0]!.probabilityPct).toBe(65.2);
    });

    it('should include meeting dates', () => {
      const meetings = parseFedWatchResponse(mockFedWatchResponse);
      expect(meetings[0]!.meetingDate).toBe('2026-03-18');
      expect(meetings[1]!.meetingDate).toBe('2026-05-06');
      expect(meetings[2]!.meetingDate).toBe('2026-06-17');
    });

    it('should return empty array for invalid response', () => {
      const meetings = parseFedWatchResponse({} as FedWatchApiResponse);
      expect(meetings).toEqual([]);
    });

    it('should limit to 3 meetings', () => {
      const response: FedWatchApiResponse = {
        meetings: [
          { meetingDate: '2026-03-18', targets: [{ rate: '4.25-4.50', probability: 60 }] },
          { meetingDate: '2026-05-06', targets: [{ rate: '4.00-4.25', probability: 55 }] },
          { meetingDate: '2026-06-17', targets: [{ rate: '3.75-4.00', probability: 50 }] },
          { meetingDate: '2026-07-29', targets: [{ rate: '3.50-3.75', probability: 45 }] },
          { meetingDate: '2026-09-16', targets: [{ rate: '3.25-3.50', probability: 40 }] },
        ],
      };
      const meetings = parseFedWatchResponse(response);
      expect(meetings).toHaveLength(3);
    });
  });

  describe('detectShifts', () => {
    it('should detect a significant probability shift', () => {
      const previous: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 50 },
      ];
      const current: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 65 },
      ];
      const shifts = detectShifts(previous, current);
      expect(shifts).toHaveLength(1);
      expect(shifts[0]!.shiftPct).toBe(15);
      expect(shifts[0]!.meetingDate).toBe('2026-03-18');
    });

    it('should not report shifts below threshold', () => {
      const previous: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 60 },
      ];
      const current: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 65 },
      ];
      const shifts = detectShifts(previous, current);
      expect(shifts).toHaveLength(0);
    });

    it('should detect downward shifts', () => {
      const previous: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 70 },
      ];
      const current: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 55 },
      ];
      const shifts = detectShifts(previous, current);
      expect(shifts).toHaveLength(1);
      expect(shifts[0]!.shiftPct).toBe(15);
    });

    it('should handle custom threshold', () => {
      const previous: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 50 },
      ];
      const current: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 55 },
      ];
      const shifts = detectShifts(previous, current, 5);
      expect(shifts).toHaveLength(1);
    });

    it('should return empty array for first poll (no previous data)', () => {
      const previous: FomcMeeting[] = [];
      const current: FomcMeeting[] = [
        { meetingDate: '2026-03-18', rateTarget: '4.25-4.50', probabilityPct: 65 },
      ];
      const shifts = detectShifts(previous, current);
      expect(shifts).toHaveLength(0);
    });
  });

  describe('scan — first poll snapshot', () => {
    it('should emit a snapshot event on first poll', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FedWatchScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockFedWatchResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const snapshots = result.value.filter(
          (e) => e.type === 'rate-forecast-snapshot',
        );
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]!.source).toBe('fedwatch');
        expect(snapshots[0]!.title).toContain('FedWatch snapshot');
      }
    });
  });

  describe('scan — shift detection', () => {
    it('should detect probability shifts between polls', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FedWatchScanner(eventBus);

      // First poll — baseline
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockFedWatchResponse), { status: 200 }),
      );
      await scanner.scan();

      // Second poll — shifted probabilities
      const shifted: FedWatchApiResponse = {
        meetings: [
          {
            meetingDate: '2026-03-18',
            targets: [
              { rate: '4.25-4.50', probability: 45.0 }, // was 65.2, shift of 20.2
              { rate: '4.50-4.75', probability: 50.0 },
              { rate: '4.00-4.25', probability: 5.0 },
            ],
          },
          {
            meetingDate: '2026-05-06',
            targets: [
              { rate: '4.00-4.25', probability: 53.0 },
              { rate: '4.25-4.50', probability: 35.0 },
              { rate: '3.75-4.00', probability: 12.0 },
            ],
          },
          {
            meetingDate: '2026-06-17',
            targets: [
              { rate: '3.75-4.00', probability: 48.0 },
              { rate: '4.00-4.25', probability: 39.0 },
              { rate: '3.50-3.75', probability: 13.0 },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(shifted), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const shiftEvents = result.value.filter(
          (e) => e.type === 'rate-forecast',
        );
        // The first meeting shifted the top target from 4.25-4.50 (65.2%) to 4.50-4.75 (50%)
        // Since we track top probability per meeting, old was 65.2, new top is 50.0 => shift of 15.2
        expect(shiftEvents.length).toBeGreaterThanOrEqual(1);
        expect(shiftEvents[0]!.title).toContain('probability shift');
      }
    });
  });

  describe('scan — error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FedWatchScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FedWatchScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 503 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('503');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FedWatchScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('API down'));

      await scanner.scan();
      await scanner.scan();
      await scanner.scan();

      expect(scanner.health().status).toBe('down');
      expect(scanner.health().errorCount).toBe(3);
    });
  });

  describe('health', () => {
    it('should report healthy initially', () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FedWatchScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('fedwatch');
    });
  });
});
