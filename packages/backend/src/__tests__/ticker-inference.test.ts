import { describe, expect, it } from 'vitest';
import type { RawEvent } from '@event-radar/shared';
import {
  extractCompanyTickerFromText,
  extractTickerCandidateFromText,
  inferHighPriorityTicker,
  inferMarketContextEtf,
} from '../pipeline/ticker-inference.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    source: 'breaking-news',
    type: 'headline',
    title: 'Default headline',
    body: 'Default body',
    timestamp: new Date('2026-03-23T12:00:00.000Z'),
    metadata: {},
    ...overrides,
  };
}

describe('ticker inference helpers', () => {
  it('extracts a cashtag ticker from text', () => {
    expect(extractTickerCandidateFromText('Trump mentions $TSLA in late-night post')).toBe('TSLA');
  });

  it('extracts a naked uppercase ticker from text', () => {
    expect(extractTickerCandidateFromText('Breaking: TSLA deliveries miss consensus')).toBe('TSLA');
  });

  it('ignores common uppercase false positives', () => {
    expect(extractTickerCandidateFromText('CPI surprises while CEO comments on demand')).toBeNull();
  });

  it('ignores all-digit identifiers that resemble CIK values', () => {
    expect(extractTickerCandidateFromText('CIK 0001234567 was referenced in the filing')).toBeNull();
  });

  it('ignores blocked company suffixes that look like tickers', () => {
    expect(extractTickerCandidateFromText('INC announces a restructuring plan')).toBeNull();
    expect(extractTickerCandidateFromText('CORP sees elevated options volume')).toBeNull();
  });

  it('ignores newly blocked political and financial acronyms', () => {
    expect(extractTickerCandidateFromText('ICE says sanctions review remains active')).toBeNull();
    expect(extractTickerCandidateFromText('NATO officials meet after weekend talks')).toBeNull();
  });

  it('ignores uppercase regular English words when they are not cashtags', () => {
    expect(extractTickerCandidateFromText('PLAN to expand chip restrictions gains support')).toBeNull();
    expect(extractTickerCandidateFromText('VOTE on the bill is scheduled for Friday')).toBeNull();
  });

  it('still accepts a cashtag even when the symbol is a common English word', () => {
    expect(extractTickerCandidateFromText('Shares of $PLAN rally after earnings')).toBe('PLAN');
  });

  it('extracts a mapped ticker from a company name case-insensitively', () => {
    expect(extractCompanyTickerFromText('Breaking: Apple unveils new devices')).toBe('AAPL');
    expect(extractCompanyTickerFromText('NVIDIA expands AI chip production')).toBe('NVDA');
  });

  it('extracts the first mapped company mentioned when multiple companies appear', () => {
    expect(extractCompanyTickerFromText('Microsoft signs cloud deal with Apple')).toBe('MSFT');
  });

  it('preserves mapped company tickers that are valid at five characters', () => {
    expect(extractCompanyTickerFromText('Samsung expands memory output')).toBe('SSNLF');
  });

  it('maps tech-heavy headlines to QQQ market context when no direct ticker is found', () => {
    const event = makeEvent({
      title: 'AI software stocks surge after cloud spending commentary',
      body: 'Semiconductor and megacap tech names lead the move.',
    });

    expect(inferMarketContextEtf(event)).toBe('QQQ');
  });

  it('maps energy-heavy headlines to XLE sector context', () => {
    const event = makeEvent({
      title: 'Oil and gas stocks jump after OPEC production cut',
      body: 'Crude prices rise sharply in early trading.',
    });

    expect(inferMarketContextEtf(event)).toBe('XLE');
  });

  it('maps broad market headlines to SPY market context when no sector cue is present', () => {
    const event = makeEvent({
      title: 'Stocks rise after White House tariff comments',
      body: 'Broad market sentiment improves across major indexes.',
    });

    expect(inferMarketContextEtf(event)).toBe('SPY');
  });

  it('prefers an extracted ticker over ETF fallback for high-priority events', () => {
    const event = makeEvent({
      title: 'Urgent: $NVDA faces export restriction update',
      body: 'Shares fall in premarket trading.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'NVDA',
      tickerInferred: true,
      strategy: 'regex',
    });
  });

  it('maps a company name to a ticker before ETF fallback for high-priority events', () => {
    const event = makeEvent({
      title: 'Apple supplier update triggers urgent review',
      body: 'Traders are watching the company response.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'AAPL',
      tickerInferred: true,
      strategy: 'company-map',
    });
  });

  it('uses the first company mentioned when multiple mapped companies appear in the text', () => {
    const event = makeEvent({
      title: 'Microsoft and Apple face antitrust scrutiny',
      body: 'Both megacap names trade lower premarket.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'MSFT',
      tickerInferred: true,
      strategy: 'company-map',
    });
  });

  it('prefers a direct ticker match over a company-name match', () => {
    const event = makeEvent({
      title: 'Apple discusses new partnership with $TSLA',
      body: 'The EV maker was named explicitly in the release.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'TSLA',
      tickerInferred: true,
      strategy: 'regex',
    });
  });

  it('matches company names from the body when the title is generic', () => {
    const event = makeEvent({
      title: 'Urgent market update',
      body: 'Analysts say Boeing faces new delivery scrutiny.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'BA',
      tickerInferred: true,
      strategy: 'company-map',
    });
  });

  it('returns null instead of assigning an ETF ticker when no direct ticker is present', () => {
    const event = makeEvent({
      title: 'Tech giants sink after new export controls',
      body: 'Chip and software names are under pressure.',
    });

    expect(inferHighPriorityTicker(event)).toBeNull();
  });

  it('returns null for broad market headlines and keeps market context separate', () => {
    const event = makeEvent({
      title: 'Markets slip after tariff headlines',
      body: 'Investors cut risk across major indexes.',
    });

    expect(inferHighPriorityTicker(event)).toBeNull();
    expect(inferMarketContextEtf(event)).toBe('SPY');
  });
});
