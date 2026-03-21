import { useEffect, useRef, useState } from 'react';

export type WebSocketStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UseWebSocketOptions<TEvent = unknown> {
  onEvent?: (event: TEvent) => void;
  url?: string;
}

function buildWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/events`;
}

export function useWebSocket<TEvent = unknown>(
  options?: UseWebSocketOptions<TEvent>,
): { status: WebSocketStatus } {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const onEventRef = useRef(options?.onEvent);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);

  onEventRef.current = options?.onEvent;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }

    // Reset stopped flag on each mount (handles React StrictMode double-mount)
    stoppedRef.current = false;

    const connect = () => {
      const socket = new WebSocket(options?.url ?? buildWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
        setStatus('connected');
      });

      socket.addEventListener('message', (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as {
            type?: string;
            data?: TEvent;
          };

          if (payload.type === 'event' && payload.data !== undefined) {
            onEventRef.current?.(payload.data);
          }
        } catch {
          // Ignore malformed messages and keep the connection alive.
        }
      });

      socket.addEventListener('error', () => {
        // Browsers emit `error` before `close` on failed sockets. The `close` handler owns
        // reconnect scheduling; this listener prevents the error from being unhandled.
      });

      socket.addEventListener('close', () => {
        if (stoppedRef.current) {
          setStatus('disconnected');
          return;
        }

        const delayMs = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 60_000);
        reconnectAttemptsRef.current += 1;
        setStatus('reconnecting');
        reconnectTimeoutRef.current = window.setTimeout(connect, delayMs);
      });
    };

    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimeoutRef.current != null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [options?.url]);

  return { status };
}
