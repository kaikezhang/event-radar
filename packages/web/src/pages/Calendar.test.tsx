import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Calendar } from './Calendar.js';
import { renderWithRouter } from '../test/render.js';

const { getUpcomingCalendarMock } = vi.hoisted(() => ({
  getUpcomingCalendarMock: vi.fn(),
}));

vi.mock('../lib/api.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.js')>('../lib/api.js');

  return {
    ...actual,
    getUpcomingCalendar: getUpcomingCalendarMock,
  };
});

describe('Calendar page', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getUpcomingCalendarMock.mockReset();
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-03-23T12:00:00.000Z').getTime(),
    );
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('renders grouped calendar events with confirmed coverage copy', async () => {
    getUpcomingCalendarMock.mockResolvedValue({
      earningsDataLimited: false,
      coverageNote: 'Showing confirmed scheduled events',
      dates: [
        {
          date: '2026-03-24',
          events: [
            {
              eventId: 'evt-nvda-earnings',
              ticker: 'NVDA',
              source: 'sec-edgar',
              severity: 'CRITICAL',
              title: 'NVDA Earnings After Hours',
              timeLabel: 'After Hours',
              historicalAvgMove: 8.2,
            },
            {
              eventId: 'evt-fed-gdp',
              source: 'econ-calendar',
              severity: 'HIGH',
              title: 'Fed Minutes Release',
              timeLabel: '2:00 PM ET',
              historicalAvgMove: null,
            },
          ],
        },
      ],
    });

    renderWithRouter([{ path: '/calendar', element: <Calendar /> }], ['/calendar']);

    expect(await screen.findByRole('heading', { name: /event calendar/i })).toBeInTheDocument();
    expect(await screen.findByText(/showing confirmed scheduled events/i)).toBeInTheDocument();
    expect(screen.getByText('Tuesday, March 24')).toBeInTheDocument();
    expect(screen.getByText(/NVDA Earnings After Hours/i)).toBeInTheDocument();
    expect(screen.getByText(/past events like this moved ±8.2%/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open event nvda earnings after hours/i })).toHaveAttribute(
      'href',
      '/event/evt-nvda-earnings',
    );
  });

  it('requests this week by default and can switch to next week', async () => {
    const user = userEvent.setup();

    getUpcomingCalendarMock.mockResolvedValue({
      earningsDataLimited: false,
      dates: [],
    });

    renderWithRouter([{ path: '/calendar', element: <Calendar /> }], ['/calendar']);

    await screen.findByRole('heading', { name: /event calendar/i });

    expect(getUpcomingCalendarMock).toHaveBeenCalledWith({
      from: '2026-03-23',
      to: '2026-03-29',
    });

    await user.click(screen.getByRole('button', { name: /next week/i }));

    expect(getUpcomingCalendarMock).toHaveBeenLastCalledWith({
      from: '2026-03-30',
      to: '2026-04-05',
    });
  });

  it('renders an empty state when no events are scheduled', async () => {
    getUpcomingCalendarMock.mockResolvedValue({
      earningsDataLimited: false,
      dates: [],
    });

    renderWithRouter([{ path: '/calendar', element: <Calendar /> }], ['/calendar']);

    expect(await screen.findByText(/no scheduled events found for this period/i)).toBeInTheDocument();
  });
});
