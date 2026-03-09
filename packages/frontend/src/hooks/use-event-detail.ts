import { useState, useCallback } from 'react';

export interface EventDetail {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  severity: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface SimilarEvent {
  id: string;
  source: string;
  title: string;
  severity: string | null;
  receivedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface UseEventDetailOptions {
  apiUrl: string;
  apiKey: string;
}

export interface UseEventDetailReturn {
  event: EventDetail | null;
  similarEvents: SimilarEvent[];
  isLoading: boolean;
  error: string | null;
  fetchEvent: (id: string) => Promise<void>;
  clearEvent: () => void;
}

export function useEventDetail(options: UseEventDetailOptions): UseEventDetailReturn {
  const { apiUrl, apiKey } = options;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [similarEvents, setSimilarEvents] = useState<SimilarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch event details
      const eventResponse = await fetch(`${apiUrl}/api/events/${id}`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!eventResponse.ok) {
        if (eventResponse.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error('Failed to fetch event');
      }

      const eventData = await eventResponse.json();
      setEvent(eventData);

      // Fetch similar events
      const similarResponse = await fetch(`${apiUrl}/api/events/${id}/similar?limit=10`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (similarResponse.ok) {
        const similarData = await similarResponse.json();
        setSimilarEvents(similarData.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setEvent(null);
      setSimilarEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, apiKey]);

  const clearEvent = useCallback(() => {
    setEvent(null);
    setSimilarEvents([]);
    setError(null);
  }, []);

  return {
    event,
    similarEvents,
    isLoading,
    error,
    fetchEvent,
    clearEvent,
  };
}

// Star/unstar events in localStorage
export function getStarredEvents(): string[] {
  try {
    const stored = localStorage.getItem('event-radar-starred');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function toggleStarEvent(eventId: string): string[] {
  const starred = getStarredEvents();
  const index = starred.indexOf(eventId);
  
  if (index > -1) {
    starred.splice(index, 1);
  } else {
    starred.push(eventId);
  }
  
  localStorage.setItem('event-radar-starred', JSON.stringify(starred));
  return starred;
}

export function isEventStarred(eventId: string): boolean {
  return getStarredEvents().includes(eventId);
}
