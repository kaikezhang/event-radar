import type { IMarketRegimeService, RegimeSnapshot } from '@event-radar/shared';

/**
 * Mock implementation of IMarketRegimeService.
 * Returns a neutral regime snapshot. Task A will implement the real service
 * that computes regime from VIX, RSI, yield curve, etc.
 */
export class MockMarketRegimeService implements IMarketRegimeService {
  private snapshot: RegimeSnapshot;

  constructor(snapshot?: RegimeSnapshot) {
    this.snapshot = snapshot ?? createNeutralSnapshot();
  }

  async getRegimeSnapshot(): Promise<RegimeSnapshot> {
    return this.snapshot;
  }

  getAmplificationFactor(direction: 'bullish' | 'bearish' | 'neutral'): number {
    if (direction === 'neutral') return 1.0;
    return this.snapshot.amplification[direction];
  }

  /** Allow tests to override the snapshot. */
  setSnapshot(snapshot: RegimeSnapshot): void {
    this.snapshot = snapshot;
  }
}

export function createNeutralSnapshot(): RegimeSnapshot {
  return {
    score: 0,
    label: 'neutral',
    factors: {
      vix: { value: 18.0, zscore: 0.0 },
      spyRsi: { value: 50.0, signal: 'neutral' },
      spy52wPosition: { pctFromHigh: -5.0, pctFromLow: 15.0 },
      maSignal: { sma20: 450.0, sma50: 448.0, signal: 'neutral' },
      yieldCurve: { spread: 0.5, inverted: false },
    },
    amplification: {
      bullish: 1.0,
      bearish: 1.0,
    },
    updatedAt: new Date().toISOString(),
  };
}
