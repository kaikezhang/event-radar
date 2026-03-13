import type { RegimeSnapshot } from './regime.js';

/** Interface for the Market Regime Service (Task A implements the real version). */
export interface IMarketRegimeService {
  /** Get the current regime snapshot. */
  getRegimeSnapshot(): Promise<RegimeSnapshot>;
  /** Get amplification factor for a given event direction. */
  getAmplificationFactor(direction: 'bullish' | 'bearish' | 'neutral'): number;
}
