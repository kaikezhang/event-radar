import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../pipeline/llm-enricher.js';
import { MockMarketRegimeService, createNeutralSnapshot } from '../services/mock-market-regime.js';
import type { RawEvent, RegimeSnapshot } from '@event-radar/shared';

function makeEvent(overrides?: Partial<RawEvent>): RawEvent {
  return {
    id: 'test-001',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K: NVDA Restructuring',
    body: '$2.1B restructuring charge, 12% workforce reduction',
    url: 'https://sec.gov/filing/456',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { ticker: 'NVDA' },
    ...overrides,
  };
}

describe('buildPrompt — regime injection', () => {
  it('should include Market Context section when regime is provided', () => {
    const regime: RegimeSnapshot = {
      score: 65,
      label: 'overbought',
      factors: {
        vix: { value: 14.2, zscore: -0.8 },
        spyRsi: { value: 72.5, signal: 'overbought' },
        spy52wPosition: { pctFromHigh: -1.0, pctFromLow: 28.0 },
        maSignal: { sma20: 460.0, sma50: 445.0, signal: 'golden_cross' },
        yieldCurve: { spread: -0.15, inverted: true },
      },
      amplification: { bullish: 0.7, bearish: 1.5 },
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const prompt = buildPrompt(makeEvent(), regime);

    expect(prompt).toContain('## Market Context');
    expect(prompt).toContain('Current regime: overbought (score: 65)');
    expect(prompt).toContain('VIX: 14.2');
    expect(prompt).toContain('SPY RSI: 72.5');
    expect(prompt).toContain('-15bp (INVERTED)');
    expect(prompt).toContain('negative catalysts hit harder');
  });

  it('should NOT include Market Context section when regime is undefined', () => {
    const prompt = buildPrompt(makeEvent());

    expect(prompt).not.toContain('## Market Context');
    expect(prompt).toContain('Event: 8-K: NVDA Restructuring');
    expect(prompt).toContain('Source: sec-edgar');
  });

  it('should include metadata in prompt', () => {
    const prompt = buildPrompt(makeEvent({ metadata: { ticker: 'NVDA', item_types: ['5.02'] } }));
    expect(prompt).toContain('Metadata:');
    expect(prompt).toContain('NVDA');
  });

  it('should use correct explanation for extreme_oversold', () => {
    const regime: RegimeSnapshot = {
      ...createNeutralSnapshot(),
      score: -90,
      label: 'extreme_oversold',
    };
    const prompt = buildPrompt(makeEvent(), regime);
    expect(prompt).toContain('extreme_oversold');
    expect(prompt).toContain('2-3x amplified impact');
  });

  it('should format yield curve spread in basis points', () => {
    const regime: RegimeSnapshot = {
      ...createNeutralSnapshot(),
      factors: {
        ...createNeutralSnapshot().factors,
        yieldCurve: { spread: 1.25, inverted: false },
      },
    };
    const prompt = buildPrompt(makeEvent(), regime);
    expect(prompt).toContain('125bp (normal)');
  });
});

describe('MockMarketRegimeService', () => {
  it('should return neutral snapshot by default', async () => {
    const service = new MockMarketRegimeService();
    const snapshot = await service.getRegimeSnapshot();

    expect(snapshot.label).toBe('neutral');
    expect(snapshot.score).toBe(0);
    expect(snapshot.amplification.bullish).toBe(1.0);
    expect(snapshot.amplification.bearish).toBe(1.0);
  });

  it('should return correct amplification factor for given direction', () => {
    const service = new MockMarketRegimeService({
      ...createNeutralSnapshot(),
      amplification: { bullish: 1.5, bearish: 0.7 },
    });

    expect(service.getAmplificationFactor('bullish')).toBe(1.5);
    expect(service.getAmplificationFactor('bearish')).toBe(0.7);
    expect(service.getAmplificationFactor('neutral')).toBe(1.0);
  });

  it('should allow overriding snapshot via setSnapshot', async () => {
    const service = new MockMarketRegimeService();
    service.setSnapshot({
      ...createNeutralSnapshot(),
      score: 80,
      label: 'extreme_overbought',
    });

    const snapshot = await service.getRegimeSnapshot();
    expect(snapshot.label).toBe('extreme_overbought');
    expect(snapshot.score).toBe(80);
  });
});
