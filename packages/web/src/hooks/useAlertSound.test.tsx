import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAlertSound } from './useAlertSound.js';

class MockGainNode {
  readonly gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };

  connect = vi.fn();
}

class MockOscillatorNode {
  readonly frequency = {
    setValueAtTime: vi.fn(),
  };
  type = 'sine';
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  readonly currentTime = 0;
  readonly destination = {};
  state: 'running' | 'suspended' = 'suspended';

  constructor() {
    MockAudioContext.instances.push(this);
  }

  resume = vi.fn(async () => {
    this.state = 'running';
  });

  createOscillator = vi.fn(() => new MockOscillatorNode());
  createGain = vi.fn(() => new MockGainNode());
}

describe('useAlertSound', () => {
  beforeEach(() => {
    localStorage.clear();
    MockAudioContext.instances = [];
    vi.stubGlobal('AudioContext', MockAudioContext as unknown as typeof AudioContext);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T14:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stores updated sound preferences in localStorage', () => {
    const { result } = renderHook(() => useAlertSound());

    act(() => {
      result.current.setEnabled(false);
      result.current.setVolume(0.35);
    });

    expect(result.current.preferences.enabled).toBe(false);
    expect(result.current.preferences.volume).toBe(0.35);
    expect(JSON.parse(localStorage.getItem('event-radar.alert-sound') ?? '{}')).toMatchObject({
      enabled: false,
      volume: 0.35,
    });
  });

  it('does not play before the user unlocks audio interaction', () => {
    const { result } = renderHook(() => useAlertSound());

    const played = result.current.playForSeverity('CRITICAL');

    expect(played).toBe(false);
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('plays a generated tone for high-severity alerts after interaction', () => {
    const { result } = renderHook(() => useAlertSound());

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    const played = result.current.playForSeverity('HIGH');

    expect(played).toBe(true);
    expect(MockAudioContext.instances).toHaveLength(1);
    expect(MockAudioContext.instances[0]?.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('skips playback during quiet hours', () => {
    vi.setSystemTime(new Date('2026-03-13T23:30:00'));
    const { result } = renderHook(() => useAlertSound());

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    const played = result.current.playForSeverity('CRITICAL');

    expect(played).toBe(false);
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('ignores low-severity alerts', () => {
    const { result } = renderHook(() => useAlertSound());

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    const played = result.current.playForSeverity('LOW');

    expect(played).toBe(false);
    expect(MockAudioContext.instances).toHaveLength(0);
  });
});
