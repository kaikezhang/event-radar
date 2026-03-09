'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Share2,
  Star,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  AlertTriangle,
  Brain,
  FileJson,
  Link2,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { cn } from '../lib/utils';
import {
  useEventDetail,
  getStarredEvents,
  toggleStarEvent,
  type EventDetail,
  type SimilarEvent,
} from '../hooks/use-event-detail';
import type { EventItem } from '../hooks/use-events-websocket';

// Type guard to check if displayEvent is EventItem (has ticker/tier/direction)
function isEventItem(item: EventItem | EventDetail): item is EventItem {
  return 'ticker' in item;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'dev-api-key-12345';

interface EventDetailPanelProps {
  event: EventItem | null;
  onClose: () => void;
}

const SEVERITY_CONFIG: Record<string, {
  bg: string;
  border: string;
  text: string;
  label: string;
  icon: React.ReactNode;
}> = {
  CRITICAL: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/50',
    text: 'text-red-500',
    label: 'CRITICAL',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  HIGH: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/50',
    text: 'text-orange-500',
    label: 'HIGH',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  MEDIUM: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/50',
    text: 'text-yellow-500',
    label: 'MEDIUM',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  LOW: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/50',
    text: 'text-green-500',
    label: 'LOW',
    icon: <AlertTriangle className="h-4 w-4" />,
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

function formatFullTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Confidence bar component
function ConfidenceBar({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  const level = percentage >= 70 ? 'high' : percentage >= 50 ? 'medium' : percentage >= 30 ? 'low' : 'unconfirmed';

  const colorClass = {
    high: 'bg-green-500',
    medium: 'bg-yellow-500',
    low: 'bg-orange-500',
    unconfirmed: 'bg-red-500',
  }[level];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className={cn('font-medium', colorClass.replace('bg-', 'text-'))}>
          {percentage}% ({level})
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  const level = percentage >= 70 ? 'high' : percentage >= 50 ? 'medium' : percentage >= 30 ? 'low' : 'unconfirmed';

  const config = {
    high: { label: '✅ Confirmed', className: 'bg-green-500/10 text-green-500 border-green-500/50' },
    medium: { label: '⚠️ Medium', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/50' },
    low: { label: '🔶 Low', className: 'bg-orange-500/10 text-orange-500 border-orange-500/50' },
    unconfirmed: { label: '🔍 Unconfirmed', className: 'bg-red-500/10 text-red-500 border-red-500/50' },
  }[level];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className={cn('text-xs', config.className)}>
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Confidence: {percentage}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Direction indicator
function DirectionIndicator({ direction }: { direction?: string }) {
  if (direction === 'positive') {
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  }
  if (direction === 'negative') {
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

// Similar event item
function SimilarEventItem({
  event,
  onClick,
}: {
  event: SimilarEvent;
  onClick: () => void;
}) {
  const severityConfig = SEVERITY_CONFIG[event.severity || 'LOW'];

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-medium flex-shrink-0',
            severityConfig.text,
            severityConfig.bg
          )}
        >
          {severityConfig.label}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{event.title}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{event.source}</span>
            <span>•</span>
            <span>{formatTimestamp(event.receivedAt)}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>
    </button>
  );
}

// Classification section
function ClassificationSection({ event }: { event: EventDetail }) {
  const metadata = event.metadata as Record<string, unknown> | null;
  const confidence = (metadata?.confidence as number) ?? 0.8;
  const matchedRules = (metadata?.matchedRules as string[]) ?? [];
  const tags = (metadata?.tags as string[]) ?? [];
  const aiReasoning = metadata?.aiReasoning as string | null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Brain className="h-4 w-4" />
        Classification
      </h3>

      {/* Confidence */}
      <ConfidenceBar confidence={confidence} />
      <ConfidenceBadge confidence={confidence} />

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* AI Reasoning */}
      {aiReasoning && (
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground mb-1 font-medium">AI Reasoning</p>
          <p className="text-sm">{aiReasoning}</p>
        </div>
      )}

      {/* Rule Matches */}
      {matchedRules.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Matched Rules</p>
          <div className="flex flex-wrap gap-1">
            {matchedRules.map((rule) => (
              <Badge key={rule} variant="outline" className="text-xs">
                {rule}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Event Detail Panel
export function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  const [isStarred, setIsStarred] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const {
    event: fullEvent,
    similarEvents,
    isLoading,
    error,
    fetchEvent,
  } = useEventDetail({
    apiUrl: API_URL,
    apiKey: API_KEY,
  });

  // Fetch full event details when event changes
  useEffect(() => {
    if (event?.id) {
      fetchEvent(event.id);
      setIsStarred(getStarredEvents().includes(event.id));
    }
  }, [event?.id, fetchEvent]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Get source URL from metadata
  const getSourceUrl = useCallback(() => {
    if (!fullEvent) return null;
    const metadata = fullEvent.metadata as Record<string, unknown> | null;
    return metadata?.sourceUrl as string | null;
  }, [fullEvent]);

  // Handle star toggle
  const handleStarToggle = useCallback(() => {
    if (!event?.id) return;
    const newStarred = toggleStarEvent(event.id);
    setIsStarred(newStarred.includes(event.id));
  }, [event?.id]);

  // Handle copy JSON
  const handleCopyJson = useCallback(() => {
    if (!fullEvent) return;
    navigator.clipboard.writeText(JSON.stringify(fullEvent, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }, [fullEvent]);

  // Handle share
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/dashboard?event=${event?.id}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  }, [event?.id]);

  // Handle similar event click
  const handleSimilarEventClick = useCallback((similarEvent: SimilarEvent) => {
    // Trigger navigation to similar event
    fetchEvent(similarEvent.id);
  }, [fetchEvent]);

  // Combine lightweight event with full details
  const displayEvent = fullEvent || event;
  const sourceKey = displayEvent?.source?.toLowerCase() || '';
  const sourceIcon = SOURCE_ICONS[sourceKey] || '📰';
  const severityKey = displayEvent?.severity || 'LOW';
  const severityConfig = SEVERITY_CONFIG[severityKey];

  if (!event) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[600px] bg-background border-l border-border z-50 shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Event Details</h2>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleStarToggle}
                    className={cn(isStarred && 'text-yellow-500')}
                  >
                    <Star className={cn('h-4 w-4', isStarred && 'fill-current')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isStarred ? 'Unstar' : 'Star'} event</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Loading/Error states */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {error && (
          <div className="flex-1 p-4">
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
              {error}
            </div>
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && displayEvent && (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Main Info */}
              <div className="space-y-3">
                {/* Ticker and Severity */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(isEventItem(displayEvent) ? displayEvent.ticker : (displayEvent.metadata?.ticker as string | undefined)) && (
                    <span className="font-mono text-lg font-bold">
                      ${(isEventItem(displayEvent) ? displayEvent.ticker : (displayEvent.metadata?.ticker as string | undefined))}
                    </span>
                  )}
                  <DirectionIndicator direction={isEventItem(displayEvent) ? displayEvent.direction : undefined} />
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-medium',
                      severityConfig.text,
                      severityConfig.bg
                    )}
                  >
                    {severityConfig.icon}
                    <span className="ml-1">{severityConfig.label}</span>
                  </Badge>
                  {isEventItem(displayEvent) && displayEvent.tier && (
                    <Badge variant="outline" className="text-xs">
                      Tier {displayEvent.tier}
                    </Badge>
                  )}
                </div>

                {/* Source and Time */}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="text-2xl">{sourceIcon}</span>
                  <span>{displayEvent.source}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(displayEvent.receivedAt)}
                  </div>
                </div>

                {/* Headline */}
                <h3 className="text-xl font-semibold">{displayEvent.title}</h3>

                {/* Summary */}
                {displayEvent.summary && (
                  <p className="text-muted-foreground">{displayEvent.summary}</p>
                )}

                {/* Full Timestamp */}
                <p className="text-xs text-muted-foreground">
                  Received: {formatFullTimestamp(displayEvent.receivedAt)}
                </p>
              </div>

              {/* Classification Section (only if we have full event details) */}
              {fullEvent && <ClassificationSection event={fullEvent} />}

              {/* Source Link */}
              {getSourceUrl() && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Source
                  </h3>
                  <a
                    href={getSourceUrl()!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Original
                  </a>
                </div>
              )}

              {/* Similar Events */}
              {similarEvents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Similar Events ({similarEvents.length})
                  </h3>
                  <div className="space-y-2">
                    {similarEvents.map((similar) => (
                      <SimilarEventItem
                        key={similar.id}
                        event={similar}
                        onClick={() => handleSimilarEventClick(similar)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Actions Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              className="gap-2"
            >
              {copiedJson ? (
                <>
                  <FileJson className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2"
            >
              {copiedShare ? (
                'Copied!'
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Share
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
