const EASTERN_TIME_ZONE = 'America/New_York';

const EASTERN_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  timeZoneName: 'shortOffset',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const EASTERN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function formatDateKey(parts: DateParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function getEasternParts(date: Date): DateParts {
  const parts = EASTERN_PARTS_FORMATTER.formatToParts(date);
  const lookup: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      lookup[part.type] = part.value;
    }
  }

  return {
    year: Number(lookup['year'] ?? '0'),
    month: Number(lookup['month'] ?? '0'),
    day: Number(lookup['day'] ?? '0'),
  };
}

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
  hour: number,
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

function getDayOfWeek(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function isWeekday(parts: DateParts): boolean {
  const dayOfWeek = getDayOfWeek(parts);
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function shiftDate(parts: DateParts, days: number): DateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function observedHoliday(parts: DateParts): DateParts {
  const dayOfWeek = getDayOfWeek(parts);
  if (dayOfWeek === 6) {
    return shiftDate(parts, -1);
  }
  if (dayOfWeek === 0) {
    return shiftDate(parts, 1);
  }
  return parts;
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): DateParts {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (weekday - firstDay + 7) % 7;
  return {
    year,
    month,
    day: 1 + offset + (occurrence - 1) * 7,
  };
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): DateParts {
  const lastDate = new Date(Date.UTC(year, month, 0));
  const offset = (lastDate.getUTCDay() - weekday + 7) % 7;
  return {
    year,
    month,
    day: lastDate.getUTCDate() - offset,
  };
}

function computeEasterSunday(year: number): DateParts {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { year, month, day };
}

function addHoliday(
  holidays: Set<string>,
  parts: DateParts,
  calendarYear: number,
): void {
  if (parts.year === calendarYear) {
    holidays.add(formatDateKey(parts));
  }
}

function getNYSEHolidaysForYear(year: number): string[] {
  const holidays = new Set<string>();

  addHoliday(holidays, observedHoliday({ year, month: 1, day: 1 }), year);
  addHoliday(holidays, nthWeekdayOfMonth(year, 1, 1, 3), year); // MLK Day
  addHoliday(holidays, nthWeekdayOfMonth(year, 2, 1, 3), year); // Presidents' Day
  addHoliday(holidays, shiftDate(computeEasterSunday(year), -2), year); // Good Friday
  addHoliday(holidays, lastWeekdayOfMonth(year, 5, 1), year); // Memorial Day

  if (year >= 2022) {
    addHoliday(holidays, observedHoliday({ year, month: 6, day: 19 }), year);
  }

  addHoliday(holidays, observedHoliday({ year, month: 7, day: 4 }), year);
  addHoliday(holidays, nthWeekdayOfMonth(year, 9, 1, 1), year); // Labor Day
  addHoliday(holidays, nthWeekdayOfMonth(year, 11, 4, 4), year); // Thanksgiving
  addHoliday(holidays, observedHoliday({ year, month: 12, day: 25 }), year);

  // When January 1 falls on Saturday, NYSE observes New Year's Day on Dec 31.
  addHoliday(holidays, observedHoliday({ year: year + 1, month: 1, day: 1 }), year);

  return [...holidays].sort();
}

export function isNYSEHoliday(date: Date): boolean {
  const parts = getEasternParts(date);
  return getNYSEHolidaysForYear(parts.year).includes(formatDateKey(parts));
}

function isEarlyClose(date: Date): boolean {
  const parts = getEasternParts(date);
  if (!isWeekday(parts) || isNYSEHoliday(date)) {
    return false;
  }

  if (parts.month === 7 && parts.day === 3) {
    return true;
  }

  const thanksgiving = nthWeekdayOfMonth(parts.year, 11, 4, 4);
  const blackFriday = shiftDate(thanksgiving, 1);
  if (parts.month === blackFriday.month && parts.day === blackFriday.day) {
    return true;
  }

  return parts.month === 12 && parts.day === 24;
}

export function getMarketCloseTime(date: Date): Date {
  const parts = getEasternParts(date);
  const closeHour = isEarlyClose(date) ? 13 : 16;
  return makeEasternDate(parts.year, parts.month, parts.day, closeHour, 0, 0);
}
