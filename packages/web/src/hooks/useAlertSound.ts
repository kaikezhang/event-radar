import { useEffect, useRef, useSyncExternalStore, useState } from 'react';
import type { Severity } from '../types/index.js';

interface AlertSoundPreferences {
  enabled: boolean;
  volume: number;
  quietHoursStart: number;
  quietHoursEnd: number;
}

const STORAGE_KEY = 'event-radar.alert-sound';
const DEFAULT_PREFERENCES: AlertSoundPreferences = {
  enabled: true,
  volume: 0.45,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

const listeners = new Set<() => void>();
let cachedPreferences: AlertSoundPreferences | null = null;
let cachedSerializedPreferences: string | null = null;
let sharedAudioContext: AudioContext | null = null;

function clampHour(value: number): number {
  return Math.min(23, Math.max(0, Math.round(value)));
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function readPreferences(): AlertSoundPreferences {
  if (typeof window === 'undefined') {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerializedPreferences = null;
    return cachedPreferences;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (cachedPreferences && stored === cachedSerializedPreferences) {
    return cachedPreferences;
  }

  if (!stored) {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerializedPreferences = null;
    return cachedPreferences;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AlertSoundPreferences>;
    cachedPreferences = {
      enabled: parsed.enabled ?? DEFAULT_PREFERENCES.enabled,
      volume: clampVolume(parsed.volume ?? DEFAULT_PREFERENCES.volume),
      quietHoursStart: clampHour(parsed.quietHoursStart ?? DEFAULT_PREFERENCES.quietHoursStart),
      quietHoursEnd: clampHour(parsed.quietHoursEnd ?? DEFAULT_PREFERENCES.quietHoursEnd),
    };
    cachedSerializedPreferences = stored;
    return cachedPreferences;
  } catch {
    cachedPreferences = DEFAULT_PREFERENCES;
    cachedSerializedPreferences = null;
    return cachedPreferences;
  }
}

function writePreferences(nextPreferences: AlertSoundPreferences): void {
  cachedPreferences = nextPreferences;
  cachedSerializedPreferences = JSON.stringify(nextPreferences);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, cachedSerializedPreferences);
  }

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isQuietHours(preferences: AlertSoundPreferences, now: Date): boolean {
  const hour = now.getHours();
  if (preferences.quietHoursStart === preferences.quietHoursEnd) {
    return false;
  }

  if (preferences.quietHoursStart < preferences.quietHoursEnd) {
    return hour >= preferences.quietHoursStart && hour < preferences.quietHoursEnd;
  }

  return hour >= preferences.quietHoursStart || hour < preferences.quietHoursEnd;
}

function getAudioContext(): AudioContext | null {
  if (sharedAudioContext) {
    return sharedAudioContext;
  }

  if (typeof AudioContext === 'undefined') {
    return null;
  }

  sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}

export function useAlertSound() {
  const preferences = useSyncExternalStore(
    subscribe,
    readPreferences,
    () => DEFAULT_PREFERENCES,
  );
  const [hasInteracted, setHasInteracted] = useState(false);
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    const unlockAudio = () => {
      hasInteractedRef.current = true;
      setHasInteracted(true);
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  return {
    preferences,
    hasInteracted,
    setEnabled(enabled: boolean) {
      const current = readPreferences();
      writePreferences({
        ...current,
        enabled,
      });
    },
    setVolume(volume: number) {
      const current = readPreferences();
      writePreferences({
        ...current,
        volume: clampVolume(volume),
      });
    },
    setQuietHours(start: number, end: number) {
      const current = readPreferences();
      writePreferences({
        ...current,
        quietHoursStart: clampHour(start),
        quietHoursEnd: clampHour(end),
      });
    },
    playForSeverity(severity: Severity | string): boolean {
      if (!preferences.enabled || !hasInteractedRef.current) {
        return false;
      }

      if (severity !== 'HIGH' && severity !== 'CRITICAL') {
        return false;
      }

      if (isQuietHours(preferences, new Date())) {
        return false;
      }

      const audioContext = getAudioContext();
      if (!audioContext) {
        return false;
      }

      if (audioContext.state === 'suspended') {
        void audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const durationSeconds = severity === 'CRITICAL' ? 0.24 : 0.18;
      const peakFrequency = severity === 'CRITICAL' ? 1046.5 : 880;

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(peakFrequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(preferences.volume, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + durationSeconds,
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + durationSeconds);

      return true;
    },
  };
}
