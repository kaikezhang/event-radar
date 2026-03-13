import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocket } from './useWebSocket.js';

type ListenerMap = Map<string, Set<(event?: unknown) => void>>;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  static OPEN = 1;
  static CLOSED = 3;

  readonly url: string;
  readyState = 0;
  private readonly listeners: ListenerMap = new Map();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.listeners.get('open')?.forEach((listener) => listener());
  }

  emitMessage(payload: unknown): void {
    this.listeners.get('message')?.forEach((listener) => {
      listener({ data: JSON.stringify(payload) });
    });
  }

  emitClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.listeners.get('close')?.forEach((listener) => listener());
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it('connects to the event feed and reports connected status', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost:3000/ws/events?apiKey=er-dev-2026');
    expect(result.current.status).toBe('disconnected');

    act(() => {
      MockWebSocket.instances[0]?.emitOpen();
    });

    expect(result.current.status).toBe('connected');
  });

  it('forwards incoming event payloads to the callback', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ onEvent }));

    act(() => {
      MockWebSocket.instances[0]?.emitOpen();
      MockWebSocket.instances[0]?.emitMessage({
        type: 'event',
        data: { id: 'evt-1', severity: 'HIGH' },
      });
      MockWebSocket.instances[0]?.emitMessage({ type: 'ping' });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ id: 'evt-1', severity: 'HIGH' });
  });

  it('reconnects with exponential backoff after the socket closes', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      MockWebSocket.instances[0]?.emitOpen();
      MockWebSocket.instances[0]?.emitClose();
    });

    expect(result.current.status).toBe('reconnecting');
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    act(() => {
      MockWebSocket.instances[1]?.emitClose();
      vi.advanceTimersByTime(2000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });
});
