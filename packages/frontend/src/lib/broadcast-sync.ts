"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SyncMessage =
  | { type: "ticker-changed"; ticker: string }
  | { type: "date-range-changed"; dateFrom: string; dateTo: string }
  | { type: "event-selected"; eventId: string }
  | { type: "filters-changed"; filters: Record<string, unknown> }
  | { type: "ping"; windowId: string }
  | { type: "pong"; windowId: string };

interface SyncEnvelope {
  sourceWindowId: string;
  message: SyncMessage;
}

interface BroadcastSnapshot {
  activeWindowCount: number;
  isSupported: boolean;
  windowId: string;
  ticker?: string;
  dateFrom?: string;
  dateTo?: string;
  selectedEventId?: string;
  filters: Record<string, unknown>;
}

interface BroadcastSyncOptions {
  onTickerChanged?: (ticker: string) => void;
  onDateRangeChanged?: (dateFrom: string, dateTo: string) => void;
  onEventSelected?: (eventId: string) => void;
  onFiltersChanged?: (filters: Record<string, unknown>) => void;
}

interface BroadcastSyncResult extends BroadcastSnapshot {
  broadcastTicker: (ticker: string) => void;
  broadcastDateRange: (dateFrom: string, dateTo: string) => void;
  broadcastEventSelected: (eventId: string) => void;
  broadcastFilters: (filters: Record<string, unknown>) => void;
}

const CHANNEL_NAME = "event-radar-sync";
const PING_INTERVAL_MS = 15_000;
const ACTIVE_WINDOW_TTL_MS = 35_000;

let sharedManager: BroadcastSyncManager | null = null;
let cachedWindowId: string | null = null;

function getWindowId(): string {
  if (cachedWindowId) {
    return cachedWindowId;
  }

  cachedWindowId = crypto.randomUUID();
  return cachedWindowId;
}

function isEnvelope(value: unknown): value is SyncEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.sourceWindowId === "string" && typeof record.message === "object";
}

class BroadcastSyncManager {
  private readonly windowId = getWindowId();
  private readonly channel: BroadcastChannel | null;
  private readonly activeWindows = new Map<string, number>();
  private currentTicker?: string;
  private currentDateFrom?: string;
  private currentDateTo?: string;
  private currentSelectedEventId?: string;
  private currentFilters: Record<string, unknown> = {};
  private readonly snapshotListeners = new Set<(snapshot: BroadcastSnapshot) => void>();
  private readonly messageListeners = new Set<(message: SyncMessage) => void>();
  private readonly pingTimer: number | null;
  private readonly pruneTimer: number | null;

  constructor() {
    this.activeWindows.set(this.windowId, Date.now());

    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      this.channel = null;
      this.pingTimer = null;
      this.pruneTimer = null;
      return;
    }

    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent<unknown>) => {
      this.handleIncoming(event.data);
    };

    this.post({ type: "ping", windowId: this.windowId });
    this.pingTimer = window.setInterval(() => {
      this.prune();
      this.post({ type: "ping", windowId: this.windowId });
    }, PING_INTERVAL_MS);
    this.pruneTimer = window.setInterval(() => {
      this.prune();
    }, PING_INTERVAL_MS);
  }

  getSnapshot(): BroadcastSnapshot {
    return {
      activeWindowCount: this.activeWindows.size,
      isSupported: this.channel != null,
      windowId: this.windowId,
      ticker: this.currentTicker,
      dateFrom: this.currentDateFrom,
      dateTo: this.currentDateTo,
      selectedEventId: this.currentSelectedEventId,
      filters: this.currentFilters,
    };
  }

  subscribe(listener: (snapshot: BroadcastSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  subscribeMessages(listener: (message: SyncMessage) => void): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  private notifySnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }

  broadcastTicker(ticker: string): void {
    this.currentTicker = ticker;
    this.post({ type: "ticker-changed", ticker });
  }

  broadcastDateRange(dateFrom: string, dateTo: string): void {
    this.currentDateFrom = dateFrom;
    this.currentDateTo = dateTo;
    this.post({ type: "date-range-changed", dateFrom, dateTo });
  }

  broadcastEventSelected(eventId: string): void {
    this.currentSelectedEventId = eventId;
    this.post({ type: "event-selected", eventId });
  }

  broadcastFilters(filters: Record<string, unknown>): void {
    this.currentFilters = { ...filters };
    this.post({ type: "filters-changed", filters: { ...filters } });
  }

  private handleIncoming(payload: unknown): void {
    if (!isEnvelope(payload)) {
      return;
    }

    const { sourceWindowId, message } = payload;
    if (sourceWindowId === this.windowId) {
      return;
    }

    this.markWindow(sourceWindowId);

    if (message.type === "ping") {
      this.post({ type: "pong", windowId: this.windowId });
      return;
    }

    if (message.type === "pong") {
      return;
    }

    // Track state from incoming messages
    if (message.type === "ticker-changed") {
      this.currentTicker = message.ticker;
    } else if (message.type === "date-range-changed") {
      this.currentDateFrom = message.dateFrom;
      this.currentDateTo = message.dateTo;
    } else if (message.type === "event-selected") {
      this.currentSelectedEventId = message.eventId;
    } else if (message.type === "filters-changed") {
      this.currentFilters = message.filters;
    }

    this.notifySnapshot();

    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private post(message: SyncMessage): void {
    this.markWindow(this.windowId);

    if (!this.channel) {
      return;
    }

    this.channel.postMessage({
      sourceWindowId: this.windowId,
      message,
    } satisfies SyncEnvelope);
  }

  private markWindow(windowId: string): void {
    this.activeWindows.set(windowId, Date.now());
    this.emit();
  }

  private prune(): void {
    const cutoff = Date.now() - ACTIVE_WINDOW_TTL_MS;

    for (const [windowId, seenAt] of this.activeWindows.entries()) {
      if (windowId === this.windowId) {
        continue;
      }

      if (seenAt < cutoff) {
        this.activeWindows.delete(windowId);
      }
    }

    this.activeWindows.set(this.windowId, Date.now());
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();

    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }

  destroy(): void {
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer);
    }
    if (this.pruneTimer != null) {
      window.clearInterval(this.pruneTimer);
    }
    this.channel?.close();
  }
}

function getManager(): BroadcastSyncManager | null {
  if (typeof window === "undefined") {
    return null;
  }

  sharedManager ??= new BroadcastSyncManager();
  return sharedManager;
}

export function useBroadcastSync(
  options: BroadcastSyncOptions = {},
): BroadcastSyncResult {
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const onTickerChanged = useCallback((...args: Parameters<NonNullable<typeof options.onTickerChanged>>) => callbacksRef.current.onTickerChanged?.(...args), []);
  const onDateRangeChanged = useCallback((...args: Parameters<NonNullable<typeof options.onDateRangeChanged>>) => callbacksRef.current.onDateRangeChanged?.(...args), []);
  const onEventSelected = useCallback((...args: Parameters<NonNullable<typeof options.onEventSelected>>) => callbacksRef.current.onEventSelected?.(...args), []);
  const onFiltersChanged = useCallback((...args: Parameters<NonNullable<typeof options.onFiltersChanged>>) => callbacksRef.current.onFiltersChanged?.(...args), []);

  const [snapshot, setSnapshot] = useState<BroadcastSnapshot>(() => {
    return getManager()?.getSnapshot() ?? {
      activeWindowCount: 1,
      isSupported: false,
      windowId: "server",
      filters: {},
    };
  });

  useEffect(() => {
    const manager = getManager();
    if (!manager) {
      return;
    }

    const unsubscribeSnapshot = manager.subscribe(setSnapshot);
    const unsubscribeMessages = manager.subscribeMessages((message) => {
      switch (message.type) {
        case "ticker-changed":
          onTickerChanged(message.ticker);
          break;
        case "date-range-changed":
          onDateRangeChanged(message.dateFrom, message.dateTo);
          break;
        case "event-selected":
          onEventSelected(message.eventId);
          break;
        case "filters-changed":
          onFiltersChanged(message.filters);
          break;
        default:
          break;
      }
    });

    return () => {
      unsubscribeMessages();
      unsubscribeSnapshot();
    };
  }, [onDateRangeChanged, onEventSelected, onFiltersChanged, onTickerChanged]);

  return {
    ...snapshot,
    broadcastTicker: (ticker) => {
      getManager()?.broadcastTicker(ticker);
    },
    broadcastDateRange: (dateFrom, dateTo) => {
      getManager()?.broadcastDateRange(dateFrom, dateTo);
    },
    broadcastEventSelected: (eventId) => {
      getManager()?.broadcastEventSelected(eventId);
    },
    broadcastFilters: (filters) => {
      getManager()?.broadcastFilters(filters);
    },
  };
}

export function __resetBroadcastSyncForTests(): void {
  sharedManager?.destroy();
  sharedManager = null;
  cachedWindowId = null;
}
