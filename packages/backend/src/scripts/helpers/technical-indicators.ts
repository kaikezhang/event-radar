/**
 * Technical indicator calculations for historical event context.
 * Uses standard Wilder's smoothing for RSI-14 and simple moving averages.
 */

export interface PriceBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/**
 * Compute RSI-14 using Wilder's smoothing method.
 * Returns RSI for the last bar in the series, or null if insufficient data.
 */
export function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average: simple mean of first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining bars
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

/**
 * Compute simple moving average of the last N closes.
 * Returns null if insufficient data.
 */
export function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return +(sum / period).toFixed(4);
}

/**
 * Compute 52-week high and low from price bars.
 */
export function compute52WeekRange(
  bars: PriceBar[],
  asOfIndex: number,
): { high: number | null; low: number | null } {
  const tradingDays252 = 252;
  const start = Math.max(0, asOfIndex - tradingDays252);
  const slice = bars.slice(start, asOfIndex + 1);

  if (slice.length === 0) return { high: null, low: null };

  let high = -Infinity;
  let low = Infinity;
  for (const bar of slice) {
    if (bar.high != null && bar.high > high) high = bar.high;
    if (bar.low != null && bar.low < low) low = bar.low;
  }

  return {
    high: high === -Infinity ? null : +high.toFixed(2),
    low: low === Infinity ? null : +low.toFixed(2),
  };
}

/**
 * Compute average volume over the last N trading days.
 */
export function computeAvgVolume(bars: PriceBar[], period: number, asOfIndex: number): number | null {
  const start = Math.max(0, asOfIndex - period);
  const slice = bars.slice(start, asOfIndex);
  const volumes = slice.map((b) => b.volume).filter((v): v is number => v != null && v > 0);
  if (volumes.length === 0) return null;
  return Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
}

/**
 * Compute return between two prices. Returns as decimal (0.05 = 5%).
 */
export function computeReturn(from: number, to: number): number | null {
  if (from === 0 || from == null || to == null) return null;
  return +((to - from) / from).toFixed(4);
}

/**
 * Find the price bar index for a given date string (YYYY-MM-DD).
 * Returns -1 if not found.
 */
export function findBarIndex(bars: PriceBar[], dateStr: string): number {
  return bars.findIndex((b) => b.date === dateStr);
}

/**
 * Get the close price at a bar offset from a given index.
 * Positive offset = future bars, negative = past bars.
 */
export function getCloseAtOffset(bars: PriceBar[], fromIndex: number, offset: number): number | null {
  const idx = fromIndex + offset;
  if (idx < 0 || idx >= bars.length) return null;
  return bars[idx].close;
}

/**
 * Compute max drawdown and max runup within a window of bars after the event.
 */
export function computeExtremes(
  bars: PriceBar[],
  refPrice: number,
  startIndex: number,
  windowDays: number,
): {
  maxDrawdownPct: number | null;
  maxDrawdownDay: number | null;
  maxRunupPct: number | null;
  maxRunupDay: number | null;
} {
  let maxDrawdown = 0;
  let maxDrawdownDay: number | null = null;
  let maxRunup = 0;
  let maxRunupDay: number | null = null;

  const end = Math.min(startIndex + windowDays, bars.length);
  for (let i = startIndex; i < end; i++) {
    const close = bars[i].close;
    if (close == null) continue;
    const ret = (close - refPrice) / refPrice;
    const day = i - startIndex;

    if (ret < maxDrawdown) {
      maxDrawdown = ret;
      maxDrawdownDay = day;
    }
    if (ret > maxRunup) {
      maxRunup = ret;
      maxRunupDay = day;
    }
  }

  return {
    maxDrawdownPct: maxDrawdownDay != null ? +maxDrawdown.toFixed(4) : null,
    maxDrawdownDay,
    maxRunupPct: maxRunupDay != null ? +maxRunup.toFixed(4) : null,
    maxRunupDay,
  };
}

/**
 * Determine market regime based on SMA cross.
 * bull: price > 50MA > 200MA
 * bear: price < 50MA < 200MA
 * correction: price < 50MA, 50MA > 200MA
 * recovery: price > 50MA, 50MA < 200MA
 * sideways: anything else
 */
export function determineRegime(
  currentPrice: number,
  sma50: number | null,
  sma200: number | null,
): string {
  if (sma50 == null || sma200 == null) return 'sideways';

  if (currentPrice > sma50 && sma50 > sma200) return 'bull';
  if (currentPrice < sma50 && sma50 < sma200) return 'bear';
  if (currentPrice < sma50 && sma50 > sma200) return 'correction';
  if (currentPrice > sma50 && sma50 < sma200) return 'recovery';
  return 'sideways';
}

/**
 * Classify outcome based on T+20 alpha.
 */
export function classifyOutcome(alphaT20: number | null): string | null {
  if (alphaT20 == null) return null;
  if (alphaT20 > 0.10) return 'strong_bull';
  if (alphaT20 > 0.03) return 'bull';
  if (alphaT20 > -0.03) return 'neutral';
  if (alphaT20 > -0.10) return 'bear';
  return 'strong_bear';
}

/**
 * Classify market cap into tiers.
 */
export function classifyMarketCap(marketCapB: number | null): string | null {
  if (marketCapB == null) return null;
  if (marketCapB > 200) return 'mega';
  if (marketCapB > 10) return 'large';
  if (marketCapB > 2) return 'mid';
  return 'small';
}
