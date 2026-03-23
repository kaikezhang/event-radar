import { describe, expect, it } from 'vitest';
import type { RawEvent } from '@event-radar/shared';
import {
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

  it('maps tech-heavy headlines to QQQ when no direct ticker is found', () => {
    const event = makeEvent({
      title: 'AI software stocks surge after cloud spending commentary',
      body: 'Semiconductor and megacap tech names lead the move.',
    });

    expect(inferMarketContextEtf(event)).toBe('QQQ');
  });

  it('maps broad market headlines to SPY when no sector cue is present', () => {
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

  it('falls back to a market ETF when no direct ticker is present', () => {
    const event = makeEvent({
      title: 'Tech giants sink after new export controls',
      body: 'Chip and software names are under pressure.',
    });

    expect(inferHighPriorityTicker(event)).toEqual({
      ticker: 'QQQ',
      tickerInferred: true,
      strategy: 'fallback',
    });
  });
});
