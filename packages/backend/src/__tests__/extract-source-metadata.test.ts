import { describe, it, expect } from 'vitest';
import { extractSourceMetadata } from '../routes/dashboard.js';

describe('extractSourceMetadata', () => {
  it('extracts breaking-news metadata with real scanner keys', () => {
    const result = extractSourceMetadata('breaking-news', {
      url: 'https://cnbc.com/article/123',
      headline: 'Breaking headline',
      source_feed: 'CNBC',
      extra_field: 'should be ignored',
    });
    expect(result).toEqual({
      url: 'https://cnbc.com/article/123',
      headline: 'Breaking headline',
      sourceFeed: 'CNBC',
    });
  });

  it('extracts sec-edgar metadata with real scanner keys', () => {
    const result = extractSourceMetadata('sec-edgar', {
      form_type: '8-K',
      company_name: 'Apple Inc',
      filing_link: 'https://sec.gov/filing/123',
      item_descriptions: ['Item 1.01: Material Agreement'],
      cik: '0000320193',
    });
    expect(result).toEqual({
      formType: '8-K',
      companyName: 'Apple Inc',
      filingLink: 'https://sec.gov/filing/123',
      itemDescriptions: ['Item 1.01: Material Agreement'],
    });
  });

  it('extracts trading-halt metadata and sets isResume from eventType', () => {
    const haltResult = extractSourceMetadata('trading-halt', {
      haltReasonCode: 'T1',
      haltReasonDescription: 'News Pending',
      haltTime: '10:32 AM ET',
      market: 'NYSE',
    }, 'halt');
    expect(haltResult).toEqual({
      haltReasonCode: 'T1',
      haltReasonDescription: 'News Pending',
      haltTime: '10:32 AM ET',
      market: 'NYSE',
      isResume: false,
    });

    const resumeResult = extractSourceMetadata('trading-halt', {
      haltReasonCode: 'T1',
      haltReasonDescription: 'News Pending',
      haltTime: '10:32 AM ET',
      resumeTime: '11:15 AM ET',
      market: 'NYSE',
    }, 'resume');
    expect(resumeResult).toEqual({
      haltReasonCode: 'T1',
      haltReasonDescription: 'News Pending',
      haltTime: '10:32 AM ET',
      resumeTime: '11:15 AM ET',
      market: 'NYSE',
      isResume: true,
    });
  });

  it('extracts econ-calendar metadata with real scanner keys', () => {
    const result = extractSourceMetadata('econ-calendar', {
      indicator: 'nfp',
      indicator_name: 'Non-Farm Payrolls',
      scheduled_time: '2024-01-15T13:30:00.000Z',
      frequency: 'monthly',
      tags: ['employment', 'fed-watch'],
    });
    expect(result).toEqual({
      indicatorName: 'Non-Farm Payrolls',
      scheduledTime: '2024-01-15T13:30:00.000Z',
      frequency: 'monthly',
      tags: ['employment', 'fed-watch'],
    });
  });

  it('extracts stocktwits metadata with real scanner keys', () => {
    const result = extractSourceMetadata('stocktwits', {
      current_volume: 847,
      previous_volume: 200,
      ratio: 1.35,
      ticker: 'PLTR',
    });
    expect(result).toEqual({
      currentVolume: 847,
      previousVolume: 200,
      ratio: 1.35,
    });
  });

  it('extracts reddit metadata with real scanner keys', () => {
    const result = extractSourceMetadata('reddit', {
      upvotes: 1523,
      comments: 342,
      high_engagement: true,
      subreddit: 'wallstreetbets',
    });
    expect(result).toEqual({
      upvotes: 1523,
      comments: 342,
      highEngagement: true,
    });
  });

  it('returns undefined for unknown sources', () => {
    const result = extractSourceMetadata('analyst', { some: 'data' });
    expect(result).toBeUndefined();
  });

  it('omits null/undefined values from output', () => {
    const result = extractSourceMetadata('breaking-news', {
      source_feed: 'CNBC',
    });
    expect(result).toEqual({ sourceFeed: 'CNBC' });
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('headline');
  });

  it('returns empty object when no matching keys exist', () => {
    const result = extractSourceMetadata('stocktwits', {
      ticker: 'PLTR',
      unrelated: 'value',
    });
    expect(result).toEqual({});
  });
});
