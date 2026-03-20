import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { AlertSummary } from '../types/index.js';

export type SquawkThreshold = 'critical' | 'critical+high' | 'all';

export interface AudioSquawkPreferences {
  enabled: boolean;
  threshold: SquawkThreshold;
}

const STORAGE_KEY = 'audioSquawk';
const DEFAULT_PREFERENCES: AudioSquawkPreferences = {
  enabled: false,
  threshold: 'critical+high',
};

const RATE_LIMIT_MS = 10_000;

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

const THRESHOLD_MIN_RANK: Record<SquawkThreshold, number> = {
  critical: 3,
  'critical+high': 2,
  all: 0,
};

// --- External store for preferences (same pattern as useAlertSound) ---

const prefListeners = new Set<() => void>();
let cachedPreferences: AudioSquawkPreferences | null = null;
let cachedSerialized: string | null = null;

function readPreferences(): AudioSquawkPreferences {
  if (typeof window === 'undefined') {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerialized = null;
    return cachedPreferences;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (cachedPreferences && stored === cachedSerialized) {
    return cachedPreferences;
  }

  if (!stored) {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerialized = null;
    return cachedPreferences;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AudioSquawkPreferences>;
    cachedPreferences = {
      enabled: parsed.enabled ?? DEFAULT_PREFERENCES.enabled,
      threshold: isValidThreshold(parsed.threshold) ? parsed.threshold : DEFAULT_PREFERENCES.threshold,
    };
    cachedSerialized = stored;
    return cachedPreferences;
  } catch {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerialized = null;
    return cachedPreferences;
  }
}

function isValidThreshold(value: unknown): value is SquawkThreshold {
  return value === 'critical' || value === 'critical+high' || value === 'all';
}

function writePreferences(next: AudioSquawkPreferences): void {
  cachedPreferences = next;
  cachedSerialized = JSON.stringify(next);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, cachedSerialized);
  }

  for (const listener of prefListeners) {
    listener();
  }
}

function subscribePref(listener: () => void): () => void {
  prefListeners.add(listener);
  return () => prefListeners.delete(listener);
}

// --- External store for speaking state ---

const speakingListeners = new Set<() => void>();
let speakingSnapshot = false;

function subscribeSpeaking(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

function getSpeakingSnapshot(): boolean {
  return speakingSnapshot;
}

function setSpeaking(value: boolean): void {
  if (speakingSnapshot !== value) {
    speakingSnapshot = value;
    for (const listener of speakingListeners) {
      listener();
    }
  }
}

// --- Speak helper ---

function speakText(text: string): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  utterance.pitch = 1.0;

  // Prefer en-US voice if available
  const voices = window.speechSynthesis.getVoices();
  const enUS = voices.find((v) => v.lang === 'en-US');
  if (enUS) {
    utterance.voice = enUS;
  }

  window.speechSynthesis.speak(utterance);
  return utterance;
}

// --- Hook ---

export function useAudioSquawk() {
  const preferences = useSyncExternalStore(subscribePref, readPreferences, () => DEFAULT_PREFERENCES);
  const lastSpokenRef = useRef(0);
  const isSpeaking = useSyncExternalStore(subscribeSpeaking, getSpeakingSnapshot, () => false);

  // Cancel speech when squawk is toggled off
  useEffect(() => {
    if (!preferences.enabled && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [preferences.enabled]);

  const announceEvent = useCallback(
    (alert: AlertSummary) => {
      if (!preferences.enabled) return;
      if (document.hidden) return;
      if (!window.speechSynthesis) return;

      const rank = SEVERITY_RANK[alert.severity] ?? 0;
      const minRank = THRESHOLD_MIN_RANK[preferences.threshold];
      if (rank < minRank) return;

      // Rate limit: max 1 announcement per 10 seconds
      const now = Date.now();
      if (now - lastSpokenRef.current < RATE_LIMIT_MS) return;
      lastSpokenRef.current = now;

      const ticker = alert.tickers.length > 0 ? ` — ${alert.tickers[0]}` : '';
      const text = `${alert.severity}: ${alert.title}${ticker}`;

      const utterance = speakText(text);
      if (utterance) {
        setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
      }
    },
    [preferences.enabled, preferences.threshold],
  );

  return {
    preferences,
    isSpeaking,
    announceEvent,
    setEnabled(enabled: boolean) {
      writePreferences({ ...readPreferences(), enabled });
    },
    setThreshold(threshold: SquawkThreshold) {
      writePreferences({ ...readPreferences(), threshold });
    },
  };
}
