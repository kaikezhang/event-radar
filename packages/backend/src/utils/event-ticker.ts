import type { RawEvent } from '@event-radar/shared';

export function extractTickerFromEvent(event: RawEvent): string | null {
  if (!event.metadata || typeof event.metadata !== 'object') {
    return null;
  }

  const metadata = event.metadata as Record<string, unknown>;
  const directTicker = normalizeTicker(metadata['ticker']);
  if (directTicker) {
    return directTicker;
  }

  if (Array.isArray(metadata['tickers'])) {
    for (const value of metadata['tickers']) {
      const ticker = normalizeTicker(value);
      if (ticker) {
        return ticker;
      }
    }
  }

  const enrichment = metadata['llm_enrichment'];
  if (enrichment && typeof enrichment === 'object') {
    const tickers = (enrichment as Record<string, unknown>)['tickers'];
    if (Array.isArray(tickers)) {
      for (const candidate of tickers) {
        if (candidate && typeof candidate === 'object') {
          const ticker = normalizeTicker((candidate as Record<string, unknown>)['symbol']);
          if (ticker) {
            return ticker;
          }
        }
      }
    }
  }

  return null;
}

function normalizeTicker(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toUpperCase()
    : null;
}
