import { describe, expect, it } from 'vitest';
import {
  getMarketCloseTime,
  getNYSEHolidaysForYear,
  isEarlyClose,
  isNYSEHoliday,
} from '../pipeline/market-calendar.js';
import { getMarketSession } from '../pipeline/llm-gatekeeper.js';

const EASTERN_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  timeZoneName: 'shortOffset',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const EASTERN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getEasternOffsetMinutes(date: Date): number {
  const timeZoneName = EASTERN_OFFSET_FORMATTER
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')
    ?.value;
  const match = /^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/.exec(
    timeZoneName ?? '',
  );

  if (!match?.groups?.['sign']) {
    return 0;
  }

  const hours = Number(match.groups['hours'] ?? '0');
  const minutes = Number(match.groups['minutes'] ?? '0');
  const direction = match.groups['sign'] === '+' ? 1 : -1;
  return direction * (hours * 60 + minutes);
}

function makeEasternDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getEasternOffsetMinutes(new Date(utcMillis));
    const adjustedMillis =
      Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
    if (adjustedMillis === utcMillis) {
      break;
    }
    utcMillis = adjustedMillis;
  }

  return new Date(utcMillis);
}

function getEasternParts(date: Date): Record<string, string> {
  const parts: Record<string, string> = {};

  for (const part of EASTERN_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  return parts;
}

describe('market-calendar', () => {
  it('computes the 2025 NYSE holiday calendar', () => {
    expect(getNYSEHolidaysForYear(2025)).toEqual([
      '2025-01-01',
      '2025-01-20',
      '2025-02-17',
      '2025-04-18',
      '2025-05-26',
      '2025-06-19',
      '2025-07-04',
      '2025-09-01',
      '2025-11-27',
      '2025-12-25',
    ]);
  });

  it('computes the 2026 NYSE holiday calendar', () => {
    expect(getNYSEHolidaysForYear(2026)).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-04-03',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03',
      '2026-09-07',
      '2026-11-26',
      '2026-12-25',
    ]);
  });

  it('computes the 2027 NYSE holiday calendar including observed year-end closure', () => {
    expect(getNYSEHolidaysForYear(2027)).toEqual([
      '2027-01-01',
      '2027-01-18',
      '2027-02-15',
      '2027-03-26',
      '2027-05-31',
      '2027-06-18',
      '2027-07-05',
      '2027-09-06',
      '2027-11-25',
      '2027-12-24',
      '2027-12-31',
    ]);
  });

  it('computes the 2028 NYSE holiday calendar for a leap year', () => {
    expect(getNYSEHolidaysForYear(2028)).toEqual([
      '2028-01-17',
      '2028-02-21',
      '2028-04-14',
      '2028-05-29',
      '2028-06-19',
      '2028-07-04',
      '2028-09-04',
      '2028-11-23',
      '2028-12-25',
    ]);
  });

  it('computes Good Friday correctly across 2025-2028', () => {
    expect(getNYSEHolidaysForYear(2025)).toContain('2025-04-18');
    expect(getNYSEHolidaysForYear(2026)).toContain('2026-04-03');
    expect(getNYSEHolidaysForYear(2027)).toContain('2027-03-26');
    expect(getNYSEHolidaysForYear(2028)).toContain('2028-04-14');
  });

  it('applies Saturday observed closures to the preceding Friday', () => {
    expect(isNYSEHoliday(makeEasternDate(2026, 7, 3, 12))).toBe(true);
    expect(isNYSEHoliday(makeEasternDate(2027, 6, 18, 12))).toBe(true);
  });

  it('applies Sunday observed closures to the following Monday', () => {
    expect(isNYSEHoliday(makeEasternDate(2027, 7, 5, 12))).toBe(true);
    expect(isNYSEHoliday(makeEasternDate(2022, 12, 26, 12))).toBe(true);
  });

  it('treats December 31, 2027 as the observed New Year holiday for 2028', () => {
    expect(isNYSEHoliday(makeEasternDate(2027, 12, 31, 12))).toBe(true);
    expect(isNYSEHoliday(makeEasternDate(2028, 1, 1, 12))).toBe(false);
  });

  it('flags early close days and excludes full holidays', () => {
    expect(isEarlyClose(makeEasternDate(2025, 7, 3, 12))).toBe(true);
    expect(isEarlyClose(makeEasternDate(2026, 11, 27, 12))).toBe(true);
    expect(isEarlyClose(makeEasternDate(2025, 12, 24, 12))).toBe(true);
    expect(isEarlyClose(makeEasternDate(2027, 12, 24, 12))).toBe(false);
    expect(isEarlyClose(makeEasternDate(2026, 7, 3, 12))).toBe(false);
  });

  it('returns 1:00 PM ET for early closes and 4:00 PM ET otherwise', () => {
    const earlyClose = getMarketCloseTime(makeEasternDate(2025, 7, 3, 9, 30));
    const regularClose = getMarketCloseTime(makeEasternDate(2025, 7, 2, 9, 30));

    expect(getEasternParts(earlyClose)).toMatchObject({
      year: '2025',
      month: '07',
      day: '03',
      hour: '13',
      minute: '00',
    });
    expect(getEasternParts(regularClose)).toMatchObject({
      year: '2025',
      month: '07',
      day: '02',
      hour: '16',
      minute: '00',
    });
  });

  it('treats early close afternoons as POST market', () => {
    expect(getMarketSession(makeEasternDate(2025, 7, 3, 12, 59))).toBe('RTH');
    expect(getMarketSession(makeEasternDate(2025, 7, 3, 13, 0))).toBe('POST');
    expect(getMarketSession(makeEasternDate(2025, 7, 3, 13, 30))).toBe('POST');
  });
});
