import { describe, it, expect } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  EconCalendarScanner,
  parseFeedEvents,
  isPreAlertWindow,
  isPostRelease,
  type FeedEvent,
} from '../scanners/econ-calendar-scanner.js';

const TEST_FEED: FeedEvent[] = [
  {
    title: 'Consumer Price Index (CPI) m/m',
    country: 'USD',
    date: '2026-03-11T08:30:00-04:00',
    impact: 'High',
    forecast: '0.3%',
    previous: '0.5%',
  },
  {
    title: 'Non-Farm Employment Change',
    country: 'USD',
    date: '2026-03-06T08:30:00-05:00',
    impact: 'High',
    forecast: '150K',
    previous: '143K',
  },
  {
    title: 'Unemployment Claims',
    country: 'USD',
    date: '2026-03-12T08:30:00-04:00',
    impact: 'Medium',
    forecast: '215K',
    previous: '210K',
  },
  {
    title: 'BOJ Summary of Opinions',
    country: 'JPY',
    date: '2026-03-10T19:50:00-04:00',
    impact: 'Low',
    forecast: '',
    previous: '',
  },
  {
    title: 'CB Consumer Confidence',
    country: 'USD',
    date: '2026-03-11T10:00:00-04:00',
    impact: 'Low',
    forecast: '95.0',
    previous: '98.3',
  },
];

function makeScanner(feed: FeedEvent[]): EconCalendarScanner {
  const eventBus = new InMemoryEventBus();
  const scanner = new EconCalendarScanner(eventBus);
  scanner.testFeedData = feed;
  return scanner;
}

describe('EconCalendarScanner', () => {
  describe('parseFeedEvents', () => {
    it('should filter to USD High/Medium events only', () => {
      const releases = parseFeedEvents(TEST_FEED);
      // CPI (High), NFP (High), Unemployment Claims (Medium) = 3
      // Filters out: BOJ (JPY), CB Consumer Confidence (Low)
      expect(releases).toHaveLength(3);
    });

    it('should build correct release keys', () => {
      const releases = parseFeedEvents(TEST_FEED);
      const cpi = releases.find((r) => r.title.includes('Consumer Price'));
      expect(cpi).toBeDefined();
      expect(cpi!.releaseKey).toContain('consumer-price-index');
    });

    it('should preserve forecast and previous values', () => {
      const releases = parseFeedEvents(TEST_FEED);
      const cpi = releases.find((r) => r.title.includes('Consumer Price'));
      expect(cpi!.forecast).toBe('0.3%');
      expect(cpi!.previous).toBe('0.5%');
    });

    it('should parse dates correctly into UTC', () => {
      const releases = parseFeedEvents(TEST_FEED);
      const cpi = releases.find((r) => r.title.includes('Consumer Price'));
      // 08:30 ET (UTC-4) = 12:30 UTC
      expect(cpi!.scheduledTime.getUTCHours()).toBe(12);
      expect(cpi!.scheduledTime.getUTCMinutes()).toBe(30);
    });

    it('should handle empty feed gracefully', () => {
      expect(parseFeedEvents([])).toHaveLength(0);
    });

    it('should skip events with invalid dates', () => {
      const bad: FeedEvent[] = [
        { title: 'Bad', country: 'USD', date: 'not-a-date', impact: 'High', forecast: '', previous: '' },
      ];
      expect(parseFeedEvents(bad)).toHaveLength(0);
    });
  });

  describe('isPreAlertWindow', () => {
    it('should return true within 15 min before release', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:20:00Z'); // 10 min before
      expect(isPreAlertWindow(scheduled, now)).toBe(true);
    });

    it('should return true at exactly 15 min before', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:15:00Z');
      expect(isPreAlertWindow(scheduled, now)).toBe(true);
    });

    it('should return false more than 15 min before release', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:00:00Z');
      expect(isPreAlertWindow(scheduled, now)).toBe(false);
    });

    it('should return false after release time', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:35:00Z');
      expect(isPreAlertWindow(scheduled, now)).toBe(false);
    });
  });

  describe('isPostRelease', () => {
    it('should return true within 5 min after release', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:33:00Z');
      expect(isPostRelease(scheduled, now)).toBe(true);
    });

    it('should return true at exact release time', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:30:00Z');
      expect(isPostRelease(scheduled, now)).toBe(true);
    });

    it('should return false before release', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:25:00Z');
      expect(isPostRelease(scheduled, now)).toBe(false);
    });

    it('should return false more than 5 min after release', () => {
      const scheduled = new Date('2026-03-11T12:30:00Z');
      const now = new Date('2026-03-11T12:40:00Z');
      expect(isPostRelease(scheduled, now)).toBe(false);
    });
  });

  describe('scan — pre-event alerts', () => {
    it('should emit pre-event alert when within 15 min window', async () => {
      const scanner = makeScanner(TEST_FEED);

      // CPI is at 08:30 ET = 12:30 UTC. Set now to 12:20 UTC (10 min before)
      scanner.nowFn = () => new Date('2026-03-11T12:20:00Z');

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const preAlerts = result.value.filter(
          (e) => e.type === 'economic-release-upcoming',
        );
        expect(preAlerts.length).toBeGreaterThanOrEqual(1);
        const cpiAlert = preAlerts.find((e) =>
          e.title.includes('Consumer Price Index'),
        );
        expect(cpiAlert).toBeDefined();
        expect(cpiAlert!.source).toBe('econ-calendar');
        expect(cpiAlert!.metadata!['impact']).toBe('High');
        expect(cpiAlert!.metadata!['forecast']).toBe('0.3%');
      }
    });

    it('should not emit pre-event alert outside window', async () => {
      const scanner = makeScanner(TEST_FEED);

      // 2 hours before CPI release
      scanner.nowFn = () => new Date('2026-03-11T10:30:00Z');

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const preAlerts = result.value.filter(
          (e) => e.type === 'economic-release-upcoming',
        );
        expect(preAlerts).toHaveLength(0);
      }
    });
  });

  describe('scan — post-release alerts', () => {
    it('should emit post-release alert after scheduled time', async () => {
      const scanner = makeScanner(TEST_FEED);

      // 2 minutes after CPI release (12:30 UTC + 2min)
      scanner.nowFn = () => new Date('2026-03-11T12:32:00Z');

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const postAlerts = result.value.filter(
          (e) => e.type === 'economic-release',
        );
        expect(postAlerts.length).toBeGreaterThanOrEqual(1);
        const cpiAlert = postAlerts.find((e) =>
          e.title.includes('Consumer Price Index'),
        );
        expect(cpiAlert).toBeDefined();
        expect(cpiAlert!.metadata!['forecast']).toBe('0.3%');
      }
    });
  });

  describe('scan — deduplication', () => {
    it('should not emit the same alert twice', async () => {
      const scanner = makeScanner(TEST_FEED);

      scanner.nowFn = () => new Date('2026-03-11T12:20:00Z');

      const result1 = await scanner.scan();
      expect(result1.ok).toBe(true);
      const count1 = result1.ok ? result1.value.length : 0;
      expect(count1).toBeGreaterThan(0);

      // Second scan at same time should return 0 new events
      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        const duplicatePreAlerts = result2.value.filter(
          (e) =>
            e.type === 'economic-release-upcoming' &&
            e.title.includes('Consumer Price Index'),
        );
        expect(duplicatePreAlerts).toHaveLength(0);
      }
    });
  });

  describe('scan — tags and metadata', () => {
    it('should derive inflation tags for CPI', async () => {
      const scanner = makeScanner(TEST_FEED);
      scanner.nowFn = () => new Date('2026-03-11T12:20:00Z');

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const cpi = result.value.find((e) => e.title.includes('Consumer Price'));
        expect(cpi).toBeDefined();
        expect(cpi!.metadata!['tags']).toContain('inflation');
      }
    });

    it('should derive employment tags for NFP', async () => {
      const scanner = makeScanner(TEST_FEED);
      // NFP is at 08:30 EST (UTC-5) = 13:30 UTC
      scanner.nowFn = () => new Date('2026-03-06T13:20:00Z');

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const nfp = result.value.find((e) => e.title.includes('Non-Farm'));
        expect(nfp).toBeDefined();
        expect(nfp!.metadata!['tags']).toContain('employment');
      }
    });
  });

  describe('health', () => {
    it('should report healthy initially', () => {
      const scanner = makeScanner(TEST_FEED);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('econ-calendar');
    });
  });
});
