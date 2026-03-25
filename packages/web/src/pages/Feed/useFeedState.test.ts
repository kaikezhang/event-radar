import type { ScorecardSummary } from '../../types/index.js';
import {
  deduplicateAlerts,
  getDefaultSeverities,
  getTrustCue,
  groupAlertsByDate,
  loadCustomPresets,
  loadFeedSort,
  sortFeedAlerts,
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

  it('only restores a valid saved feed sort mode', () => {
    localStorage.setItem('er-feed-sort', 'severity');
    expect(loadFeedSort()).toBe('severity');

    localStorage.setItem('er-feed-sort', 'oldest');
    expect(loadFeedSort()).toBeNull();
  });

  it('builds a positive trust cue when the source setup-worked rate is strong', () => {
    const summary: ScorecardSummary = {
      days: 90,
      overview: {
        totalEvents: 10,
        sourcesMonitored: 1,
        eventsWithTickers: 10,
        eventsWithPriceOutcomes: 10,
      },
      totals: {
        totalAlerts: 10,
        alertsWithUsableVerdicts: 10,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 7,
        setupWorkedRate: 0.7,
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
          directionalCorrectCount: 0,
          directionalHitRate: 0,
          setupWorkedCount: 7,
          setupWorkedRate: 0.7,
          avgT5Move: 1,
          avgT20Move: 2,
          medianT20Move: 1.5,
        },
      ],
    };

    expect(getTrustCue('sec-edgar', summary)).toEqual({
      label: 'Setup worked 70%',
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

  it('groups same-ticker alerts across sources within a 2-hour window and preserves related sources', () => {
    const deduplicated = deduplicateAlerts([
      {
        id: 'evt-breaking-news',
        severity: 'HIGH',
        source: 'breaking-news',
        title: 'Breaking headline hits NVDA',
        summary: 'Breaking desk headline.',
        tickers: ['NVDA'],
        time: '2026-03-20T12:00:00.000Z',
      },
      {
        id: 'evt-sec',
        severity: 'HIGH',
        source: 'sec-edgar',
        title: 'SEC filing lands for NVDA',
        summary: 'EDGAR filing copy.',
        tickers: ['NVDA'],
        time: '2026-03-20T11:30:00.000Z',
      },
      {
        id: 'evt-reuters',
        severity: 'HIGH',
        source: 'reuters',
        title: 'Reuters confirms NVDA update',
        summary: 'Newswire confirmation.',
        tickers: ['NVDA'],
        time: '2026-03-20T10:15:00.000Z',
      },
      {
        id: 'evt-tsla',
        severity: 'MEDIUM',
        source: 'stocktwits',
        title: 'TSLA chatter',
        summary: 'Separate ticker event.',
        tickers: ['TSLA'],
        time: '2026-03-20T11:45:00.000Z',
      },
    ]);

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.find((alert) => alert.id === 'evt-breaking-news')).toMatchObject({
      dedupCount: 2,
      relatedSources: ['SEC EDGAR', 'Reuters'],
    });
  });

  it('defaults smart feed to hide LOW alerts', () => {
    expect(getDefaultSeverities()).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);
  });

  it('sorts smart-feed alerts by severity before recency so low alerts sink to the bottom', () => {
    const sorted = sortFeedAlerts([
      {
        id: 'low-newest',
        severity: 'LOW',
        source: 'stocktwits',
        title: 'Low alert',
        summary: 'Low summary',
        tickers: ['TSLA'],
        time: '2026-03-20T12:10:00.000Z',
      },
      {
        id: 'critical-older',
        severity: 'CRITICAL',
        source: 'sec-edgar',
        title: 'Critical alert',
        summary: 'Critical summary',
        tickers: ['NVDA'],
        time: '2026-03-20T12:09:00.000Z',
      },
      {
        id: 'medium-middle',
        severity: 'MEDIUM',
        source: 'breaking-news',
        title: 'Medium alert',
        summary: 'Medium summary',
        tickers: ['AMD'],
        time: '2026-03-20T12:08:00.000Z',
      },
      {
        id: 'high-oldest',
        severity: 'HIGH',
        source: 'sec-edgar',
        title: 'High alert',
        summary: 'High summary',
        tickers: ['AAPL'],
        time: '2026-03-20T12:07:00.000Z',
      },
    ], 'latest', true);

    expect(sorted.map((alert) => alert.id)).toEqual([
      'critical-older',
      'high-oldest',
      'medium-middle',
      'low-newest',
    ]);
  });
});
