import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { AlertSummary } from '../types/index.js';

export interface AudioSquawkPreferences {
  enabled: boolean;
  speakWhenHidden: boolean;
}

const STORAGE_KEY = 'audioSquawk';
const DEFAULT_PREFERENCES: AudioSquawkPreferences = {
  enabled: false,
  speakWhenHidden: false,
};
const BEEP_DURATION_MS = 220;

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
      speakWhenHidden: parsed.speakWhenHidden ?? DEFAULT_PREFERENCES.speakWhenHidden,
    };
    cachedSerialized = stored;
    return cachedPreferences;
  } catch {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerialized = null;
    return cachedPreferences;
  }
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
  if (speakingSnapshot === value) {
    return;
  }

  speakingSnapshot = value;
  for (const listener of speakingListeners) {
    listener();
  }
}

function playCriticalTone(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextCtor) {
    return 0;
  }

  try {
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(880, context.currentTime);

    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);

    window.setTimeout(() => {
      void context.close?.();
    }, BEEP_DURATION_MS);

    return BEEP_DURATION_MS;
  } catch {
    return 0;
  }
}

function speakText(text: string): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const enUS = voices.find((voice) => voice.lang === 'en-US');
  if (enUS) {
    utterance.voice = enUS;
  }

  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function useAudioSquawk() {
  const preferences = useSyncExternalStore(subscribePref, readPreferences, () => DEFAULT_PREFERENCES);
  const isSpeaking = useSyncExternalStore(subscribeSpeaking, getSpeakingSnapshot, () => false);
  const announcedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!preferences.enabled && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [preferences.enabled]);

  const announceEvent = useCallback((alert: AlertSummary) => {
    if (!preferences.enabled) return;
    if (alert.severity !== 'CRITICAL') return;
    if (!preferences.speakWhenHidden && document.hidden) return;
    if (announcedIdsRef.current.has(alert.id)) return;

    announcedIdsRef.current.add(alert.id);

    const speak = () => {
      const utterance = speakText(`Critical alert: ${alert.title}`);
      if (!utterance) {
        return;
      }

      setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
    };

    const delay = playCriticalTone();
    if (delay > 0) {
      window.setTimeout(speak, delay);
      return;
    }

    speak();
  }, [preferences.enabled, preferences.speakWhenHidden]);

  return {
    preferences,
    isSpeaking,
    announceEvent,
    setEnabled(enabled: boolean) {
      writePreferences({ ...readPreferences(), enabled });
    },
    setSpeakWhenHidden(speakWhenHidden: boolean) {
      writePreferences({ ...readPreferences(), speakWhenHidden });
    },
  };
}
