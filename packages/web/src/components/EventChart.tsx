'use client';

import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { getTickerPrice } from '../lib/api.js';
import type { AlertSummary, ChartRange, PriceCandle } from '../types/index.js';

const RANGE_OPTIONS: Array<{ label: string; value: ChartRange }> = [
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
];

const SEVERITY_CLASSNAME: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-200 ring-1 ring-red-400/30',
  HIGH: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',
  MEDIUM: 'bg-yellow-500/15 text-yellow-100 ring-1 ring-yellow-400/30',
  LOW: 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-300/20',
};

function toDayKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function alignMarkerTime(candles: PriceCandle[], eventTime: string): string | null {
  if (candles.length === 0) {
    return null;
  }

  const target = toDayKey(eventTime);
  let candidate: string | null = null;

  for (const candle of candles) {
    if (candle.time > target) {
      break;
    }
    candidate = candle.time;
  }

  return candidate ?? candles[0]?.time ?? null;
}

export function buildEventMarkers(
  candles: PriceCandle[],
  events: AlertSummary[],
): Array<SeriesMarker<Time>> {
  const markers: Array<SeriesMarker<Time>> = [];

  for (const event of events) {
    const alignedTime = alignMarkerTime(candles, event.time);
    if (!alignedTime) {
      continue;
    }

    if (event.direction === 'bullish') {
      markers.push({
        time: alignedTime,
        position: 'belowBar',
        shape: 'arrowUp',
        color: '#22c55e',
        text: '▲',
      });
      continue;
    }

    if (event.direction === 'bearish') {
      markers.push({
        time: alignedTime,
        position: 'aboveBar',
        shape: 'arrowDown',
        color: '#ef4444',
        text: '▼',
      });
      continue;
    }

    markers.push({
      time: alignedTime,
      position: 'inBar',
      shape: 'circle',
      color: '#94a3b8',
      text: '●',
    });
  }

  return markers;
}

interface EventChartProps {
  symbol: string;
  events: AlertSummary[];
  compact?: boolean;
  height?: number;
  defaultRange?: ChartRange;
}

export function EventChart({ symbol, events, compact, height: heightProp, defaultRange }: EventChartProps) {
  const navigate = useNavigate();
  const chartHeight = heightProp ?? 300;
  const [range, setRange] = useState<ChartRange>(defaultRange ?? '1m');
  const [selectedEvent, setSelectedEvent] = useState<AlertSummary | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ticker-price', symbol, range],
    queryFn: () => getTickerPrice(symbol, range),
    enabled: symbol.length > 0,
    staleTime: 300_000,
  });

  // Deduplicate candles by timestamp — lightweight-charts requires strictly ascending unique times
  const candles = useMemo(() => {
    const raw = data?.candles ?? [];
    const seen = new Map<string, typeof raw[number]>();
    for (const candle of raw) {
      seen.set(candle.time, candle); // keep latest value per timestamp
    }
    return Array.from(seen.values()).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  }, [data?.candles]);
  const markers = buildEventMarkers(candles, events);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth || 640,
      height: chartHeight,
      layout: {
        background: { color: '#111111' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.18)',
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.18)',
      },
      crosshair: {
        vertLine: { color: 'rgba(59, 130, 246, 0.28)' },
        horzLine: { color: 'rgba(59, 130, 246, 0.2)' },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeChart = () => {
      chart.resize(container.clientWidth || 640, chartHeight);
    };

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resizeChart);
      observer.observe(container);
    } else {
      window.addEventListener('resize', resizeChart);
    }

    return () => {
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener('resize', resizeChart);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartHeight]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || candles.length === 0) {
      return;
    }

    seriesRef.current.setData(candles);
    const markerPlugin = createSeriesMarkers(seriesRef.current, markers);
    markerPlugin.setMarkers(markers);
    chartRef.current.timeScale().fitContent();

    const alignedEvents = new Map<string, AlertSummary>();
    for (const event of events) {
      const alignedTime = alignMarkerTime(candles, event.time);
      if (alignedTime && !alignedEvents.has(alignedTime)) {
        alignedEvents.set(alignedTime, event);
      }
    }

    const handleClick = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setSelectedEvent(null);
        return;
      }

      const match = alignedEvents.get(String(param.time)) ?? null;
      setSelectedEvent(match);
    };

    chartRef.current.subscribeClick(handleClick);

    return () => {
      chartRef.current?.unsubscribeClick?.(handleClick);
    };
  }, [candles, events, markers]);

  useEffect(() => {
    setSelectedEvent(null);
  }, [range]);

  return (
    <section className={compact ? '' : 'rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(9,9,11,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]'}>
      {!compact && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-default">
              Market Reaction
            </p>
            <h2 className="mt-2 text-[17px] font-semibold leading-[1.4] text-text-primary">
              {symbol} price action
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setRange(option.value);
                  });
                }}
                aria-pressed={range === option.value}
                className={`min-h-10 rounded-full px-3 text-xs font-semibold tracking-[0.18em] transition ${
                  range === option.value
                    ? 'bg-accent-default text-white'
                    : 'bg-white/6 text-text-secondary hover:bg-white/10 hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`relative overflow-hidden rounded-[24px] border border-white/6 bg-[#111111]`} style={{ height: `${chartHeight}px` }}>
        <div ref={containerRef} className="h-full w-full" aria-label={`${symbol} candlestick chart`} />

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#111111]/80 text-sm text-text-secondary">
            Loading chart…
          </div>
        ) : null}

        {isError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#111111]/80 text-sm text-text-secondary">
            Chart data unavailable.
          </div>
        ) : null}

        {!isLoading && !isError && candles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#111111]/80 text-sm text-text-secondary">
            No price data for this range.
          </div>
        ) : null}

        {selectedEvent ? (
          <button
            type="button"
            onClick={() => navigate(`/event/${selectedEvent.id}`)}
            aria-label={`Open event ${selectedEvent.title}`}
            className="absolute left-4 top-4 max-w-[240px] rounded-2xl border border-white/10 bg-black/85 px-4 py-3 text-left shadow-[0_14px_28px_rgba(0,0,0,0.3)] backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${SEVERITY_CLASSNAME[selectedEvent.severity] ?? SEVERITY_CLASSNAME['LOW']}`}>
                {selectedEvent.severity}
              </span>
              <span className="text-xs text-text-secondary">{selectedEvent.direction ?? 'neutral'}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-5 text-white">{selectedEvent.title}</p>
          </button>
        ) : null}
      </div>
    </section>
  );
}
