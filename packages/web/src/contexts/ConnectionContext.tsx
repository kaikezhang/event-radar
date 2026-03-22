import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { WebSocketStatus } from '../hooks/useWebSocket.js';

interface ConnectionContextValue {
  status: WebSocketStatus;
  setStatus: (status: WebSocketStatus) => void;
  retry: () => void;
  setRetry: (fn: () => void) => void;
}

const noop = () => {};

const ConnectionContext = createContext<ConnectionContextValue>({
  status: 'disconnected',
  setStatus: noop,
  retry: noop,
  setRetry: noop,
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatusRaw] = useState<WebSocketStatus>('disconnected');
  const [retryFn, setRetryFn] = useState<() => void>(() => noop);
  const setStatus = useCallback((s: WebSocketStatus) => setStatusRaw(s), []);
  const setRetry = useCallback((fn: () => void) => setRetryFn(() => fn), []);

  return (
    <ConnectionContext value={{ status, setStatus, retry: retryFn, setRetry }}>
      {children}
    </ConnectionContext>
  );
}

export function useConnectionStatus(): WebSocketStatus {
  return useContext(ConnectionContext).status;
}

export function useSetConnectionStatus(): (status: WebSocketStatus) => void {
  return useContext(ConnectionContext).setStatus;
}

export function useConnectionRetry(): () => void {
  return useContext(ConnectionContext).retry;
}

export function useSetConnectionRetry(): (fn: () => void) => void {
  return useContext(ConnectionContext).setRetry;
}
