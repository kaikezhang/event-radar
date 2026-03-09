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
  apiKey: string;
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
const RECONNECT_DELAY = 3000;

export function useEventsWebSocket(
  options: UseEventsWebSocketOptions
): UseEventsWebSocketReturn {
  const { apiUrl, apiKey, onCriticalOrHigh, soundEnabled = true } = options;
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const filtersRef = useRef<EventFilters>({});

  // Play sound for critical/high events
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    
    // Create a simple beep sound using Web Audio API
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

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((data: string) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'event': {
          const newEvent = message.payload as EventItem;
          
          setEvents((prev) => {
            // Check for duplicate
            const exists = prev.some((e) => e.id === newEvent.id);
            if (exists) return prev;
            
            const updated = [newEvent, ...prev];
            // Keep only MAX_EVENTS (LRU eviction)
            return updated.slice(0, MAX_EVENTS);
          });

          // Trigger alerts for CRITICAL/HIGH severity
          if (newEvent.severity === 'CRITICAL' || newEvent.severity === 'HIGH') {
            playAlertSound();
            sendNotification(newEvent);
            
            if (onCriticalOrHigh) {
              onCriticalOrHigh(newEvent);
            }
          }
          break;
        }
        
        case 'init': {
          const payload = message.payload as { events: EventItem[] };
          setEvents(payload.events || []);
          break;
        }
        
        case 'heartbeat': {
          // Heartbeat received, connection is alive
          break;
        }
        
        case 'error': {
          const errorPayload = message.payload as { message: string };
          setError(errorPayload.message);
          break;
        }
        
        case 'filters_update': {
          // Filters acknowledged
          break;
        }
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, [playAlertSound, sendNotification, onCriticalOrHigh]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${apiUrl.replace(/^http/, 'ws')}/ws/events?apiKey=${encodeURIComponent(apiKey)}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('WebSocket connected');
      
      // Send initial filters if any
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
      setIsConnected(false);
      console.log('WebSocket disconnected, reconnecting...');
      
      // Schedule reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_DELAY);
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Connection error');
    };
    
    wsRef.current = ws;
  }, [apiUrl, apiKey, handleMessage]);

  // Initial connection
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
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
