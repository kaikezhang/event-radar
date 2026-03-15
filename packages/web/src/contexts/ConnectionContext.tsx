import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { WebSocketStatus } from '../hooks/useWebSocket.js';

interface ConnectionContextValue {
  status: WebSocketStatus;
  setStatus: (status: WebSocketStatus) => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  status: 'disconnected',
  setStatus: () => {},
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatusRaw] = useState<WebSocketStatus>('disconnected');
  const setStatus = useCallback((s: WebSocketStatus) => setStatusRaw(s), []);

  return (
    <ConnectionContext value={{ status, setStatus }}>
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
