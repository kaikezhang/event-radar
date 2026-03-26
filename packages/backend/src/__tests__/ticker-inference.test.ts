import { describe, expect, it } from 'vitest';
import type { RawEvent } from '@event-radar/shared';
import {
  extractCompanyTickerFromText,
  extractTickerCandidateFromText,
  inferHighPriorityTicker,
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

  it('ignores SEC state suffixes like /DE and /MD that should not become tickers', () => {
    expect(extractTickerCandidateFromText('Janus International Group, Inc./DE files 8-K')).toBeNull();
    expect(extractTickerCandidateFromText('BioHealth Holdings, Inc./MD appoints new CFO')).toBeNull();
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

  it('blocks naked NET when it is ordinary financial language instead of a ticker', () => {
    expect(extractTickerCandidateFromText('Net income rises 12% year over year')).toBeNull();
  });

  it('still accepts explicit cashtags for otherwise blocked naked symbols', () => {
    expect(extractTickerCandidateFromText('Cloud software momentum lifts $NET after earnings')).toBe('NET');
  });

  it('extracts a mapped ticker from a company name case-insensitively', () => {
    expect(extractCompanyTickerFromText('Breaking: Apple unveils new devices')).toBe('AAPL');
    expect(extractCompanyTickerFromText('NVIDIA expands AI chip production')).toBe('NVDA');
  });

  it('extracts the first mapped company mentioned when multiple companies appear', () => {
    expect(extractCompanyTickerFromText('Microsoft signs cloud deal with Apple')).toBe('MSFT');
  });

  it('maps Janus references to JHG', () => {
    expect(extractCompanyTickerFromText('Janus launches a new fixed income fund')).toBe('JHG');
  });

  it('does not map generic target phrases to TGT', () => {
    expect(extractCompanyTickerFromText('5 Million Target for annual cost savings')).toBeNull();
  });

  it('still maps Target when the text clearly refers to the retailer', () => {
    expect(extractCompanyTickerFromText('Target shares rise after earnings beat')).toBe('TGT');
  });

  it('still maps unambiguous Cloudflare company mentions to NET', () => {
    expect(extractCompanyTickerFromText('Cloudflare expands enterprise security offering')).toBe('NET');
  });

  it('preserves mapped company tickers that are valid at five characters', () => {
    expect(extractCompanyTickerFromText('Samsung expands memory output')).toBe('SSNLF');
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
  });

  it('maps uppercase company names to their canonical tickers before accepting a long naked symbol', () => {
    const event = makeEvent({
      title: 'FORD raises production targets',
      body: 'The automaker updated its full-year guidance.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'F',
      tickerInferred: true,
      strategy: 'company-map',
    });
  });

  it('maps GOOGLE to GOOGL instead of accepting the company name as the ticker candidate', () => {
    const event = makeEvent({
      title: 'GOOGLE cloud unit wins a large federal contract',
      body: 'Alphabet shares move higher in premarket.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'GOOGL',
      tickerInferred: true,
      strategy: 'company-map',
    });
  });

  it('returns null for sector headlines instead of assigning ETF context metadata', () => {
    const event = makeEvent({
      title: 'Oil and gas stocks jump after OPEC production cut',
      body: 'Crude prices rise sharply in early trading.',
    });

    expect(inferHighPriorityTicker(event)).toBeNull();
  });
});
