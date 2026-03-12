import { useEffect, useRef, useState, useCallback } from 'react';

export interface EventItem {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  severity: string | null;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
  direction?: string;
  ticker?: string;
  tier?: number;
}

export interface EventFilters {
  ticker?: string;
  severity?: string[];
  source?: string[];
  tier?: number[];
}

export interface SavedPreset {
  id: string;
  name: string;
  filters: EventFilters;
}

export interface UseEventsWebSocketOptions {
  apiUrl: string;
  apiKey?: string;
  onCriticalOrHigh?: (event: EventItem) => void;
  soundEnabled?: boolean;
}

export interface UseEventsWebSocketReturn {
  events: EventItem[];
  isConnected: boolean;
  error: string | null;
  updateFilters: (filters: EventFilters) => void;
  clearEvents: () => void;
  savePreset: (name: string, filters: EventFilters) => void;
  loadPresets: () => SavedPreset[];
  deletePreset: (id: string) => void;
}

const MAX_EVENTS = 500;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const POLL_INTERVAL = 5000;
const MAX_WS_FAILURES = 5;

function buildWsUrl(apiUrl: string): string {
  // Auto-detect protocol based on page protocol or API URL
  const isSecure =
    (typeof window !== 'undefined' && window.location.protocol === 'https:') ||
    apiUrl.startsWith('https');
  const wsProtocol = isSecure ? 'wss' : 'ws';
  // If apiUrl is empty/relative, use current page host (reverse proxy mode)
  const baseUrl = apiUrl
    ? apiUrl.replace(/^https?:\/\//, '')
    : (typeof window !== 'undefined' ? window.location.host : 'localhost:3080');
  return `${wsProtocol}://${baseUrl}/ws/events`;
}

export function useEventsWebSocket(
  options: UseEventsWebSocketOptions
): UseEventsWebSocketReturn {
  const { apiUrl, onCriticalOrHigh, soundEnabled = true } = options;

  const [events, setEvents] = useState<EventItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const filtersRef = useRef<EventFilters>({});
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const wsFailureCountRef = useRef(0);
  const usingPollingRef = useRef(false);
  const mountedRef = useRef(true);

  // Play sound for critical/high events
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;

    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (err) {
      console.error('Failed to play alert sound:', err);
    }
  }, [soundEnabled]);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Send notification for critical/high events
  const sendNotification = useCallback((event: EventItem) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Event Radar: ${event.severity}`, {
        body: event.title,
        icon: '/favicon.ico',
      });
    }
  }, []);

  // Process a new event (shared by WS and polling)
  const processEvent = useCallback((newEvent: EventItem) => {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === newEvent.id);
      if (exists) return prev;

      const updated = [newEvent, ...prev];
      return updated.slice(0, MAX_EVENTS);
    });

    if (newEvent.severity === 'CRITICAL' || newEvent.severity === 'HIGH') {
      playAlertSound();
      sendNotification(newEvent);
      onCriticalOrHigh?.(newEvent);
    }
  }, [playAlertSound, sendNotification, onCriticalOrHigh]);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((data: string) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'event': {
          processEvent(message.payload as EventItem);
          break;
        }

        case 'init': {
          const payload = message.payload as { events: EventItem[] };
          setEvents(payload.events || []);
          break;
        }

        case 'heartbeat':
        case 'filters_update':
          break;

        case 'error': {
          const errorPayload = message.payload as { message: string };
          setError(errorPayload.message);
          break;
        }
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, [processEvent]);

  // Polling fallback: fetch events via REST
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;

    usingPollingRef.current = true;
    console.log('WebSocket unavailable, falling back to polling');

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const response = await fetch(`${apiUrl}/api/events`);
        if (response.ok) {
          const data = await response.json();
          const eventList: EventItem[] = Array.isArray(data) ? data : data.events || [];
          setEvents(eventList.slice(0, MAX_EVENTS));
          setIsConnected(true);
          setError(null);
        }
      } catch {
        setIsConnected(false);
        setError('Polling failed');
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
  }, [apiUrl]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    usingPollingRef.current = false;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // If too many WS failures, switch to polling
    if (wsFailureCountRef.current >= MAX_WS_FAILURES) {
      startPolling();
      return;
    }

    const wsUrl = buildWsUrl(apiUrl);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      wsFailureCountRef.current++;
      startPolling();
      return;
    }

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setIsConnected(true);
      setError(null);
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      wsFailureCountRef.current = 0;
      stopPolling();
      console.log('WebSocket connected');

      if (Object.keys(filtersRef.current).length > 0) {
        ws.send(JSON.stringify({
          type: 'filters_update',
          payload: filtersRef.current,
        }));
      }
    };

    ws.onmessage = (event) => {
      handleMessage(event.data);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsFailureCountRef.current++;

      // Exponential backoff
      const delay = Math.min(reconnectDelayRef.current, MAX_RECONNECT_DELAY);
      console.log(`WebSocket disconnected, reconnecting in ${delay}ms...`);

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Connection error');
    };

    wsRef.current = ws;
  }, [apiUrl, handleMessage, startPolling, stopPolling]);

  // Initial connection
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Update filters
  const updateFilters = useCallback((filters: EventFilters) => {
    filtersRef.current = filters;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'filters_update',
        payload: filters,
      }));
    }
  }, []);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Save preset to localStorage
  const savePreset = useCallback((name: string, filters: EventFilters) => {
    const presets = loadPresetsFromStorage();
    const newPreset: SavedPreset = {
      id: crypto.randomUUID(),
      name,
      filters,
    };
    presets.push(newPreset);
    localStorage.setItem('event-radar-presets', JSON.stringify(presets));
  }, []);

  // Load presets from localStorage
  const loadPresets = useCallback((): SavedPreset[] => {
    return loadPresetsFromStorage();
  }, []);

  // Delete preset from localStorage
  const deletePreset = useCallback((id: string) => {
    const presets = loadPresetsFromStorage();
    const filtered = presets.filter((p) => p.id !== id);
    localStorage.setItem('event-radar-presets', JSON.stringify(filtered));
  }, []);

  return {
    events,
    isConnected,
    error,
    updateFilters,
    clearEvents,
    savePreset,
    loadPresets,
    deletePreset,
  };
}

// Helper function to load presets from localStorage
function loadPresetsFromStorage(): SavedPreset[] {
  try {
    const stored = localStorage.getItem('event-radar-presets');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
