'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import type { EventItem } from '../hooks/use-events-websocket';

interface EventListProps {
  events: EventItem[];
  onEventClick?: (event: EventItem) => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

const SEVERITY_CONFIG: Record<string, { 
  bg: string; 
  border: string; 
  text: string; 
  label: string 
}> = {
  CRITICAL: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/50',
    text: 'text-red-500',
    label: 'CRITICAL',
  },
  HIGH: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/50',
    text: 'text-orange-500',
    label: 'HIGH',
  },
  MEDIUM: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/50',
    text: 'text-yellow-500',
    label: 'MEDIUM',
  },
  LOW: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/50',
    text: 'text-green-500',
    label: 'LOW',
  },
};

const SOURCE_ICONS: Record<string, string> = {
  'sec': '📋',
  'x': '𝕏',
  'truth-social': '🦅',
  'pr-newswire': '📰',
  'businesswire': '💼',
  'globenewswire': '🌐',
  'political': '🏛️',
  'newswire': '📰',
};

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

export function EventList({
  events,
  onEventClick,
  soundEnabled,
  onSoundToggle,
}: EventListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Track new events for highlight animation
  const newestEventId = events[0]?.id;
  useEffect(() => {
    if (newestEventId) {
      setHighlightedIds((prev) => new Set([...prev, newestEventId]));
      
      // Remove highlight after animation
      setTimeout(() => {
        setHighlightedIds((prev) => {
          const next = new Set(prev);
          next.delete(newestEventId);
          return next;
        });
      }, 2000);
    }
  }, [newestEventId]);

  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Group events by date for sticky headers
  const { itemsWithHeaders } = useMemo(() => {
    const result: Array<{ type: 'header' | 'event'; data: string | EventItem }> = [];
    let currentDate = '';

    events.forEach((event) => {
      const eventDate = new Date(event.receivedAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

      if (eventDate !== currentDate) {
        currentDate = eventDate;
        result.push({ type: 'header', data: eventDate });
      }

      result.push({ type: 'event', data: event });
    });

    return { itemsWithHeaders: result };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <p className="text-lg">No events yet</p>
        <p className="text-sm">Waiting for incoming events...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with sound toggle and count */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSoundToggle}
          className="gap-2"
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
          {soundEnabled ? 'Sound On' : 'Sound Off'}
        </Button>
      </div>

      {/* Virtual list */}
      <div
        ref={parentRef}
        className="h-[calc(100vh-280px)] min-h-[400px] overflow-auto rounded-lg border bg-card"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = itemsWithHeaders[virtualItem.index];
            
            if (item.type === 'header') {
              return (
                <div
                  key={`header-${item.data}`}
                  className="sticky top-0 z-10 px-4 py-2 bg-muted/90 backdrop-blur text-sm font-medium text-muted-foreground"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {item.data as string}
                </div>
              );
            }

            const event = item.data as EventItem;
            const severityConfig = SEVERITY_CONFIG[event.severity || 'LOW'];
            const isHighlighted = highlightedIds.has(event.id);
            const sourceIcon = SOURCE_ICONS[event.source?.toLowerCase()] || '📰';

            return (
              <div
                key={event.id}
                onClick={() => onEventClick?.(event)}
                className={cn(
                  'absolute top-0 left-0 w-full px-4 py-3 cursor-pointer',
                  'border-b border-border transition-all duration-500',
                  'hover:bg-muted/50',
                  severityConfig.bg,
                  severityConfig.border,
                  isHighlighted && 'animate-pulse bg-yellow-500/20'
                )}
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Source Icon */}
                  <div className="text-2xl flex-shrink-0 mt-0.5">
                    {sourceIcon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Ticker Badge */}
                      {event.ticker && (
                        <span className="font-mono text-sm font-bold text-foreground">
                          ${event.ticker}
                        </span>
                      )}

                      {/* Direction Icon */}
                      {event.direction === 'positive' && (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      )}
                      {event.direction === 'negative' && (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      {event.direction === 'neutral' && (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      )}

                      {/* Severity Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-medium',
                          severityConfig.text,
                          severityConfig.bg
                        )}
                      >
                        {severityConfig.label}
                      </Badge>

                      {/* Tier Badge */}
                      {event.tier && (
                        <Badge variant="outline" className="text-xs">
                          Tier {event.tier}
                        </Badge>
                      )}
                    </div>

                    {/* Title */}
                    <p className="text-sm font-medium truncate pr-4">
                      {event.title}
                    </p>

                    {/* Summary */}
                    {event.summary && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {event.summary}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(event.receivedAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
