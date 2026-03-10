'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface PriceData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartEvent {
  id: string;
  time: number;
  direction: 'up' | 'down';
  title: string;
  severity: string;
  ticker: string;
}

export interface UsePriceDataOptions {
  ticker: string;
  interval?: '1d' | '1h' | '5m';
  range?: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y';
  events?: ChartEvent[];
}

export interface UsePriceDataReturn {
  priceData: PriceData[];
  events: ChartEvent[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface CacheEntry {
  data: PriceData[];
  timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const priceCache = new Map<string, CacheEntry>();

// Parse Yahoo Finance CSV response
function parseYahooCSV(csv: string): PriceData[] {
  const lines = csv.trim().split('\n');
  const data: PriceData[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 6) {
      const timestamp = parseInt(parts[0], 10) * 1000;
      const open = parseFloat(parts[1]);
      const high = parseFloat(parts[2]);
      const low = parseFloat(parts[3]);
      const close = parseFloat(parts[4]);
      const volume = parseInt(parts[5], 10);

      if (!isNaN(timestamp) && !isNaN(open) && !isNaN(close)) {
        data.push({
          time: Math.floor(timestamp / 1000), // Convert to seconds for lightweight-charts
          open,
          high,
          low,
          close,
          volume,
        });
      }
    }
  }

  return data.reverse(); // Reverse to get chronological order
}

// Fetch price data from Yahoo Finance
async function fetchYahooPriceData(
  ticker: string,
  interval: string = '1d',
  _range: string = '1mo'
): Promise<PriceData[]> {
  const url = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(
    ticker
  )}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=${interval}&events=history&includeAdjustedClose=true`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Ticker ${ticker} not found`);
    }
    throw new Error(`Failed to fetch price data: ${response.status}`);
  }

  const csv = await response.text();
  return parseYahooCSV(csv);
}

export function usePriceData(options: UsePriceDataOptions): UsePriceDataReturn {
  const { ticker, interval = '1d', range = '1mo', events: providedEvents = [] } = options;

  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [events, setEvents] = useState<ChartEvent[]>(providedEvents);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${ticker}-${interval}-${range}`;
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Check cache first
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setPriceData(cached.data);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchYahooPriceData(ticker, interval, range);
      
      // Update cache
      priceCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      setPriceData(data);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [ticker, interval, range, cacheKey]);

  // Fetch data on mount and when ticker changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update events when provided
  useEffect(() => {
    setEvents(providedEvents);
  }, [providedEvents]);

  return {
    priceData,
    events,
    isLoading,
    error,
    refetch: fetchData,
  };
}

// Get unique tickers from events
export function getTickersFromEvents(eventList: { ticker?: string }[]): string[] {
  const tickers = new Set<string>();
  eventList.forEach((event) => {
    if (event.ticker) {
      tickers.add(event.ticker.toUpperCase());
    }
  });
  return Array.from(tickers).sort();
}

// Common stock tickers for quick selection
export const COMMON_TICKERS = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'META',
  'NVDA',
  'TSLA',
  'JPM',
  'V',
  'WMT',
  'DIS',
  'NFLX',
  'AMD',
  'INTC',
  'BA',
  'GS',
  'SPY',
  'QQQ',
  'IWM',
  'DIA',
];
