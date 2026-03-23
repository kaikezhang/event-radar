import { useQuery } from '@tanstack/react-query';
import { getTickerPricesBatch } from '../lib/api.js';
import type { AlertSummary, PriceBatchQuote } from '../types/index.js';

const MIN_VIEWPORT_ALERTS = 6;
const ESTIMATED_ALERT_CARD_HEIGHT = 220;

export function getViewportTickerSymbols(
  alerts: AlertSummary[],
  viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight,
): string[] {
  const visibleAlertCount = Math.max(
    MIN_VIEWPORT_ALERTS,
    Math.ceil(viewportHeight / ESTIMATED_ALERT_CARD_HEIGHT) + 2,
  );
  const tickers = new Set<string>();

  for (const alert of alerts.slice(0, visibleAlertCount)) {
    const ticker = alert.tickers[0]?.trim().toUpperCase();
    if (!ticker) {
      continue;
    }

    tickers.add(ticker);
  }

  return Array.from(tickers);
}

export function useTickerBatchPrices(
  alerts: AlertSummary[],
  options?: {
    enabled?: boolean;
    viewportHeight?: number;
  },
): Record<string, PriceBatchQuote> {
  const tickers = getViewportTickerSymbols(alerts, options?.viewportHeight);
  const query = useQuery({
    queryKey: ['ticker-batch-prices', tickers],
    queryFn: async () => {
      try {
        return await getTickerPricesBatch(tickers);
      } catch {
        return {};
      }
    },
    enabled: (options?.enabled ?? true) && tickers.length > 0,
    staleTime: 300_000,
    gcTime: 300_000,
  });

  return query.data ?? {};
}
