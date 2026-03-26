import { describe, it, expect } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  EconCalendarScanner,
  getScheduledReleases,
  isPreAlertWindow,
  isPostRelease,
  type EconCalendarConfig,
} from '../scanners/econ-calendar-scanner.js';

const TEST_CONFIG: EconCalendarConfig = {
  indicators: [
    {
      id: 'cpi',
      name: 'Consumer Price Index (CPI)',
      source: 'BLS',
      frequency: 'monthly',
      releaseTime: '08:30',
      timezone: 'America/New_York',
      tags: ['inflation', 'cpi'],
      severity: 'HIGH',
    },
    {
      id: 'nfp',
      name: 'Non-Farm Payrolls (NFP)',
      source: 'BLS',
      frequency: 'monthly',
      releaseTime: '08:30',
      timezone: 'America/New_York',
      tags: ['employment', 'nfp', 'jobs'],
      severity: 'HIGH',
    },
    {
      id: 'jobless-claims',
      name: 'Initial Jobless Claims',
      source: 'DOL',
      frequency: 'weekly',
      releaseTime: '08:30',
      timezone: 'America/New_York',
      tags: ['employment', 'jobless-claims'],
      severity: 'MEDIUM',
    },
  ],
  releases: [
    { indicatorId: 'cpi', date: '2026-03-11' },
    { indicatorId: 'nfp', date: '2026-03-06' },
    { indicatorId: 'jobless-claims', date: '2026-03-12' },
  ],
};

describe('EconCalendarScanner', () => {
  describe('getScheduledReleases', () => {
    it('should parse all releases from config', () => {
      const releases = getScheduledReleases(TEST_CONFIG);
      expect(releases).toHaveLength(3);
    });

    it('should build correct release keys', () => {
      const releases = getScheduledReleases(TEST_CONFIG);
      expect(releases[0]!.releaseKey).toBe('cpi-2026-03-11');
      expect(releases[1]!.releaseKey).toBe('nfp-2026-03-06');
    });

    it('should include indicator metadata in releases', () => {
      const releases = getScheduledReleases(TEST_CONFIG);
      expect(releases[0]!.indicator.name).toBe('Consumer Price Index (CPI)');
      expect(releases[0]!.indicator.tags).toContain('cpi');
    });

    it('should build correct scheduled times in UTC', () => {
      const releases = getScheduledReleases(TEST_CONFIG);
      // 08:30 ET = 13:30 UTC (EST = UTC-5)
      const cpiRelease = releases[0]!;
      expect(cpiRelease.scheduledTime.getUTCHours()).toBe(13);
      expect(cpiRelease.scheduledTime.getUTCMinutes()).toBe(30);
    });

    it('should skip releases with unknown indicator IDs', () => {
      const config: EconCalendarConfig = {
        indicators: TEST_CONFIG.indicators,
        releases: [
          { indicatorId: 'cpi', date: '2026-03-11' },
          { indicatorId: 'unknown', date: '2026-03-15' },
        ],
      };
      const releases = getScheduledReleases(config);
      expect(releases).toHaveLength(1);
    });
  });

  describe('isPreAlertWindow', () => {
    it('should return true within 15 min before release', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:20:00Z'); // 10 min before
      expect(isPreAlertWindow(scheduled, now)).toBe(true);
    });

    it('should return true at exactly 15 min before', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:15:00Z'); // 15 min before
      expect(isPreAlertWindow(scheduled, now)).toBe(true);
    });

    it('should return false more than 15 min before release', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:00:00Z'); // 30 min before
      expect(isPreAlertWindow(scheduled, now)).toBe(false);
    });

    it('should return false after release time', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:35:00Z'); // 5 min after
      expect(isPreAlertWindow(scheduled, now)).toBe(false);
    });
  });

  describe('isPostRelease', () => {
    it('should return true within 5 min after release', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:33:00Z'); // 3 min after
      expect(isPostRelease(scheduled, now)).toBe(true);
    });

    it('should return true at exact release time', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:30:00Z');
      expect(isPostRelease(scheduled, now)).toBe(true);
    });

    it('should return false before release', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:25:00Z');
      expect(isPostRelease(scheduled, now)).toBe(false);
    });

    it('should return false more than 5 min after release', () => {
      const scheduled = new Date('2026-03-11T13:30:00Z');
      const now = new Date('2026-03-11T13:40:00Z'); // 10 min after
      expect(isPostRelease(scheduled, now)).toBe(false);
    });
  });

  describe('scan — pre-event alerts', () => {
    it('should emit pre-event alert when within 15 min window', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EconCalendarScanner(eventBus, TEST_CONFIG);

      // 10 minutes before CPI release (08:30 ET = 13:30 UTC)
      scanner.nowFn = () => new Date('2026-03-11T13:20:00Z');

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
        expect(cpiAlert!.metadata!['indicator']).toBe('cpi');
      }
    });

    it('should not emit pre-event alert outside window', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EconCalendarScanner(eventBus, TEST_CONFIG);

      // 2 hours before CPI release
      scanner.nowFn = () => new Date('2026-03-11T11:30:00Z');

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
      const eventBus = new InMemoryEventBus();
      const scanner = new EconCalendarScanner(eventBus, TEST_CONFIG);

      // 2 minutes after CPI release
      scanner.nowFn = () => new Date('2026-03-11T13:32:00Z');

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
        expect(cpiAlert!.metadata!['indicator']).toBe('cpi');
      }
    });
  });

  describe('scan — deduplication', () => {
    it('should not emit the same alert twice', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EconCalendarScanner(eventBus, TEST_CONFIG);

      scanner.nowFn = () => new Date('2026-03-11T13:20:00Z');

      const result1 = await scanner.scan();
      expect(result1.ok).toBe(true);
      const count1 = result1.ok ? result1.value.length : 0;
      expect(count1).toBeGreaterThan(0);

      // Second scan at same time should return 0 new events
      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        // Only new events that haven't been seen should appear
        const duplicatePreAlerts = result2.value.filter(
          (e) =>
            e.type === 'economic-release-upcoming' &&
            e.title.includes('Consumer Price Index'),
        );
        expect(duplicatePreAlerts).toHaveLength(0);
      }
    });
  });

  describe('health', () => {
    it('should report healthy initially', () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EconCalendarScanner(eventBus, TEST_CONFIG);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('econ-calendar');
    });
  });
});
