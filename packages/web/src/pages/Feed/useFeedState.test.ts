import type { ScorecardSummary } from '../../types/index.js';
import {
  getTrustCue,
  groupAlertsByDate,
  loadCustomPresets,
  loadFeedTab,
} from './useFeedState.js';

describe('useFeedState helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty preset list when local storage is invalid', () => {
    localStorage.setItem('event-radar-filter-presets', '{bad json');

    expect(loadCustomPresets()).toEqual([]);
  });

  it('only restores a valid saved feed tab', () => {
    localStorage.setItem('event-radar-feed-tab', 'watchlist');
    expect(loadFeedTab()).toBe('watchlist');

    localStorage.setItem('event-radar-feed-tab', 'invalid');
    expect(loadFeedTab()).toBeNull();
  });

  it('builds a positive trust cue when the source hit rate is strong', () => {
    const summary: ScorecardSummary = {
      days: 90,
      totals: {
        totalAlerts: 10,
        alertsWithUsableVerdicts: 10,
        directionalCorrectCount: 7,
        directionalHitRate: 0.7,
        setupWorkedCount: 6,
        setupWorkedRate: 0.6,
        avgT5Move: 1,
        avgT20Move: 2,
        medianT20Move: 1.5,
      },
      actionBuckets: [],
      confidenceBuckets: [],
      eventTypeBuckets: [],
      sourceBuckets: [
        {
          bucket: 'sec-edgar',
          totalAlerts: 10,
          alertsWithUsableVerdicts: 10,
          directionalCorrectCount: 7,
          directionalHitRate: 0.7,
          setupWorkedCount: 6,
          setupWorkedRate: 0.6,
          avgT5Move: 1,
          avgT20Move: 2,
          medianT20Move: 1.5,
        },
      ],
    };

    expect(getTrustCue('sec-edgar', summary)).toEqual({
      label: 'Source hit rate 70%',
      tone: 'positive',
    });
  });

  it('groups alerts into today, yesterday, and prior dates', () => {
    const groups = groupAlertsByDate([
      {
        id: 'today',
        severity: 'HIGH',
        source: 'sec-edgar',
        title: 'Today alert',
        summary: 'Today summary',
        tickers: ['NVDA'],
        time: '2026-03-20T10:00:00.000Z',
      },
      {
        id: 'yesterday',
        severity: 'MEDIUM',
        source: 'fed',
        title: 'Yesterday alert',
        summary: 'Yesterday summary',
        tickers: ['SPY'],
        time: '2026-03-19T10:00:00.000Z',
      },
      {
        id: 'older',
        severity: 'LOW',
        source: 'breaking-news',
        title: 'Older alert',
        summary: 'Older summary',
        tickers: ['AAPL'],
        time: '2026-03-01T10:00:00.000Z',
      },
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday', 'Mar 1']);
  });
});
