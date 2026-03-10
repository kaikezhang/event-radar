'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, createUpDownMarkers, ISeriesUpDownMarkerPluginApi, MarkerSign } from 'lightweight-charts';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { usePriceData, getTickersFromEvents, COMMON_TICKERS, ChartEvent } from '../hooks/use-price-data';
import type { EventItem } from '../hooks/use-events-websocket';
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface PriceChartProps {
  events: EventItem[];
  selectedEvent?: EventItem | null;
  onEventClick?: (event: EventItem) => void;
  className?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  price: string;
  time: string;
}

export function PriceChart({
  events,
  onEventClick,
  className,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const markersPluginRef = useRef<ISeriesUpDownMarkerPluginApi<Time> | null>(null);
  
  const [selectedTicker, setSelectedTicker] = useState<string>('AAPL');
  const [availableTickers, setAvailableTickers] = useState<string[]>(COMMON_TICKERS);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    price: '',
    time: '',
  });
  const [hoveredEvent, setHoveredEvent] = useState<ChartEvent | null>(null);

  // Extract tickers from events and combine with common tickers
  useEffect(() => {
    const eventTickers = getTickersFromEvents(events);
    const combined = [...new Set([...COMMON_TICKERS, ...eventTickers])];
    setAvailableTickers(combined.slice(0, 20));
    
    if (eventTickers.length > 0 && !selectedTicker) {
      setSelectedTicker(eventTickers[0]);
    }
  }, [events, selectedTicker]);

  // Convert events to chart events
  const chartEvents: ChartEvent[] = events
    .filter((e) => e.ticker?.toUpperCase() === selectedTicker.toUpperCase())
    .map((e) => ({
      id: e.id,
      time: Math.floor(new Date(e.receivedAt).getTime() / 1000) as number & Time,
      direction: (e.direction === 'up' || e.severity === 'HIGH' || e.severity === 'CRITICAL') ? 'up' as const : 'down' as const,
      title: e.title,
      severity: e.severity || 'LOW',
      ticker: e.ticker || selectedTicker,
    }));

  const { priceData, isLoading, error, refetch } = usePriceData({
    ticker: selectedTicker,
    interval: '1d',
    range: '1mo',
    events: chartEvents,
  });

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0f0f0f' },
        textColor: '#9ca3af',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#1f1f1f' },
        horzLines: { color: '#1f1f1f' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#4b5563',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#4b5563',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: '#1f1f1f',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#1f1f1f',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
      handleScroll: {
        vertTouchDrag: true,
      },
    });

    // Use type assertion for series creation - v5 API uses addSeries with series definition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candleSeries = chart.addSeries('Candlestick' as any, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Create up/down markers plugin
    const markersPlugin = createUpDownMarkers(candleSeries, {
      positiveColor: '#22c55e',
      negativeColor: '#ef4444',
      updateVisibilityDuration: 5000,
    });

    chartRef.current = chart;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candlestickSeriesRef.current = candleSeries as any;
    markersPluginRef.current = markersPlugin;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update chart data and markers
  useEffect(() => {
    if (!candlestickSeriesRef.current || priceData.length === 0) return;

    const chartData: CandlestickData<Time>[] = priceData.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candlestickSeriesRef.current.setData(chartData);

    // Update markers using the plugin
    if (markersPluginRef.current && chartEvents.length > 0) {
      const markerData = chartEvents.map((event) => ({
        time: event.time,
        position: 'aboveBar' as const,
        color: event.direction === 'up' ? '#22c55e' : '#ef4444',
        shape: event.direction === 'up' ? 'arrowUp' : 'arrowDown',
        text: event.title,
        size: 1,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (markersPluginRef.current as any).setMarkers(markerData);
    }
  }, [priceData, chartEvents]);

  // Handle click on markers
  useEffect(() => {
    if (!chartRef.current) return;

    const handleClick = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (!param.time || !param.point) return;

      const event = chartEvents.find((e) => e.time === param.time);
      if (event) {
        const eventItem = events.find((ev) => ev.id === event.id);
        if (eventItem && onEventClick) {
          onEventClick(eventItem);
        }
      }
    };

    chartRef.current.subscribeClick(handleClick);

    return () => {
      chartRef.current?.unsubscribeClick(handleClick);
    };
  }, [chartEvents, events, onEventClick]);

  // Handle crosshair move for tooltip
  useEffect(() => {
    if (!chartRef.current) return;

    const handleCrosshairMove = (param: any) => {
      if (!param.point || !param.time || !candlestickSeriesRef.current) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }

      const data = param.seriesData?.get(candlestickSeriesRef.current) as CandlestickData | undefined;
      if (data) {
        const date = new Date((param.time as number) * 1000);
        setTooltip({
          visible: true,
          x: param.point.x,
          y: param.point.y,
          price: `O: ${data.open.toFixed(2)} H: ${data.high.toFixed(2)} L: ${data.low.toFixed(2)} C: ${data.close.toFixed(2)}`,
          time: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        });
      }

      const event = chartEvents.find((e) => e.time === param.time);
      setHoveredEvent(event || null);
    };

    chartRef.current.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      chartRef.current?.unsubscribeCrosshairMove(handleCrosshairMove);
    };
  }, [chartEvents]);

  return (
    <div className={cn('flex flex-col h-full min-h-[400px] bg-background rounded-lg border', className)}>
      {/* Header with ticker selector */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-3">
          <Select value={selectedTicker} onValueChange={setSelectedTicker}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Select ticker" />
            </SelectTrigger>
            <SelectContent>
              {availableTickers.map((ticker) => (
                <SelectItem key={ticker} value={ticker}>
                  {ticker}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {isLoading && (
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          
          {error && (
            <div className="flex items-center gap-1 text-red-500 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Chart container */}
      <div className="relative flex-1 min-h-[350px]">
        <div ref={chartContainerRef} className="absolute inset-0" />
        
        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="absolute pointer-events-none bg-black/90 border border-gray-700 rounded px-2 py-1 text-xs z-10"
            style={{
              left: Math.min(tooltip.x + 10, (chartContainerRef.current?.clientWidth || 400) - 150),
              top: Math.max(tooltip.y - 40, 10),
            }}
          >
            <div className="text-gray-400">{tooltip.time}</div>
            <div className={cn(
              'font-mono',
              tooltip.price.includes('C:') && parseFloat(tooltip.price.split('C:')[1] || '0') >= parseFloat(tooltip.price.split('O:')[1]?.split(' ')[0] || '0')
                ? 'text-green-500'
                : 'text-red-500'
            )}>
              {tooltip.price}
            </div>
          </div>
        )}
        
        {/* Hovered event tooltip */}
        {hoveredEvent && (
          <div
            className="absolute pointer-events-none bg-black/90 border rounded px-3 py-2 text-sm z-10 max-w-xs"
            style={{
              left: Math.min(tooltip.x + 10, (chartContainerRef.current?.clientWidth || 400) - 200),
              top: Math.max(tooltip.y + 20, 10),
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              {hoveredEvent.direction === 'up' ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className={cn(
                'font-semibold',
                hoveredEvent.severity === 'CRITICAL' || hoveredEvent.severity === 'HIGH'
                  ? 'text-red-500'
                  : hoveredEvent.severity === 'MEDIUM'
                  ? 'text-yellow-500'
                  : 'text-green-500'
              )}>
                {hoveredEvent.severity}
              </span>
            </div>
            <div className="text-gray-200 line-clamp-2">{hoveredEvent.title}</div>
            <div className="text-xs text-gray-500 mt-1">Click for details</div>
          </div>
        )}
      </div>

      {/* Event markers legend */}
      {chartEvents.length > 0 && (
        <div className="flex items-center gap-4 p-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500/50" />
            <span>Positive Event</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500/50" />
            <span>Negative Event</span>
          </div>
          <div className="ml-auto">
            {chartEvents.length} event{chartEvents.length !== 1 ? 's' : ''} for {selectedTicker}
          </div>
        </div>
      )}
    </div>
  );
}

export default PriceChart;
