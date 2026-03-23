import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertSummary } from '../types/index.js';
import { useAudioSquawk } from './useAudioSquawk.js';

interface MockSpeechSynthesisUtterance {
  text: string;
  rate: number;
  pitch: number;
  voice?: { lang: string };
  onend: null | (() => void);
  onerror: null | (() => void);
}

class SpeechSynthesisUtteranceMock implements MockSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  voice?: { lang: string };
  onend = null;
  onerror = null;

  constructor(text: string) {
    this.text = text;
  }
}

const speakMock = vi.fn();
const cancelMock = vi.fn();
const getVoicesMock = vi.fn(() => [{ lang: 'en-US' }]);
const oscillatorStartMock = vi.fn();
const oscillatorStopMock = vi.fn();
const oscillatorConnectMock = vi.fn();
const gainConnectMock = vi.fn();
const gainSetValueAtTimeMock = vi.fn();
const gainRampMock = vi.fn();

class AudioContextMock {
  currentTime = 0;

  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: oscillatorConnectMock,
      start: oscillatorStartMock,
      stop: oscillatorStopMock,
    };
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: gainSetValueAtTimeMock,
        exponentialRampToValueAtTime: gainRampMock,
      },
      connect: gainConnectMock,
    };
  }

  get destination() {
    return {};
  }
}

function createAlert(overrides: Partial<AlertSummary> = {}): AlertSummary {
  return {
    id: 'evt-critical-1',
    severity: 'CRITICAL',
    source: 'sec-edgar',
    title: 'Critical NVDA alert',
    summary: 'Test critical event',
    tickers: ['NVDA'],
    time: '2026-03-23T10:00:00.000Z',
    ...overrides,
  };
}

describe('useAudioSquawk', () => {
  beforeEach(() => {
    localStorage.clear();
    speakMock.mockReset();
    cancelMock.mockReset();
    getVoicesMock.mockClear();
    oscillatorStartMock.mockReset();
    oscillatorStopMock.mockReset();
    oscillatorConnectMock.mockReset();
    gainConnectMock.mockReset();
    gainSetValueAtTimeMock.mockReset();
    gainRampMock.mockReset();

    vi.useFakeTimers();

    vi.stubGlobal('SpeechSynthesisUtterance', SpeechSynthesisUtteranceMock);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: speakMock,
        cancel: cancelMock,
        getVoices: getVoicesMock,
      },
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextMock,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
  });

  it('defaults critical audio alerts to disabled', () => {
    const { result } = renderHook(() => useAudioSquawk());

    expect(result.current.preferences.enabled).toBe(false);
  });

  it('plays a beep and speaks the critical alert title when enabled', () => {
    const { result } = renderHook(() => useAudioSquawk());

    act(() => {
      result.current.setEnabled(true);
    });

    act(() => {
      result.current.announceEvent(createAlert());
      vi.runAllTimers();
    });

    expect(oscillatorStartMock).toHaveBeenCalledOnce();
    expect(oscillatorStopMock).toHaveBeenCalledOnce();
    expect(speakMock).toHaveBeenCalledOnce();
    const utterance = speakMock.mock.calls[0]?.[0] as MockSpeechSynthesisUtterance;
    expect(utterance.text).toBe('Critical alert: Critical NVDA alert');
  });

  it('does not speak or beep when the feature is disabled', () => {
    const { result } = renderHook(() => useAudioSquawk());

    act(() => {
      result.current.announceEvent(createAlert());
      vi.runAllTimers();
    });

    expect(oscillatorStartMock).not.toHaveBeenCalled();
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('ignores non-critical events', () => {
    const { result } = renderHook(() => useAudioSquawk());

    act(() => {
      result.current.setEnabled(true);
    });

    act(() => {
      result.current.announceEvent(createAlert({
        id: 'evt-high-1',
        severity: 'HIGH',
        title: 'High alert should stay silent',
      }));
      vi.runAllTimers();
    });

    expect(oscillatorStartMock).not.toHaveBeenCalled();
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('does not repeat the same event id twice', () => {
    const { result } = renderHook(() => useAudioSquawk());
    const alert = createAlert();

    act(() => {
      result.current.setEnabled(true);
    });

    act(() => {
      result.current.announceEvent(alert);
      result.current.announceEvent(alert);
      vi.runAllTimers();
    });

    expect(oscillatorStartMock).toHaveBeenCalledOnce();
    expect(speakMock).toHaveBeenCalledOnce();
  });

  it('suppresses speech in hidden tabs by default', () => {
    const { result } = renderHook(() => useAudioSquawk());

    act(() => {
      result.current.setEnabled(true);
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });

    act(() => {
      result.current.announceEvent(createAlert());
      vi.runAllTimers();
    });

    expect(speakMock).not.toHaveBeenCalled();
  });

  it('can speak while the tab is hidden when that preference is enabled', () => {
    const { result } = renderHook(() => useAudioSquawk());

    act(() => {
      result.current.setEnabled(true);
      result.current.setSpeakWhenHidden(true);
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });

    act(() => {
      result.current.announceEvent(createAlert({ id: 'evt-critical-2' }));
      vi.runAllTimers();
    });

    expect(speakMock).toHaveBeenCalledOnce();
  });

  it('cancels speech when the feature is turned off', () => {
    const { result } = renderHook(() => useAudioSquawk());

    act(() => {
      result.current.setEnabled(true);
      result.current.setEnabled(false);
    });

    expect(cancelMock).toHaveBeenCalledOnce();
  });
});
