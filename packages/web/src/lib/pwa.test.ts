import { describe, expect, test, vi } from 'vitest';
import { canRegisterServiceWorker, registerPwaServiceWorker } from './pwa.js';

describe('canRegisterServiceWorker', () => {
  test('returns false outside production', () => {
    expect(
      canRegisterServiceWorker({
        isProduction: false,
        navigator: { serviceWorker: { register: vi.fn() } },
      }),
    ).toBe(false);
  });

  test('returns false when navigator is unavailable', () => {
    expect(canRegisterServiceWorker({ isProduction: true })).toBe(false);
  });

  test('returns false when service workers are unsupported', () => {
    expect(canRegisterServiceWorker({ isProduction: true, navigator: {} })).toBe(false);
  });

  test('returns true when production and service workers are supported', () => {
    expect(
      canRegisterServiceWorker({
        isProduction: true,
        navigator: { serviceWorker: { register: vi.fn() } },
      }),
    ).toBe(true);
  });
});

describe('registerPwaServiceWorker', () => {
  test('adds a load listener when registration is allowed', () => {
    const addEventListener = vi.fn();

    registerPwaServiceWorker({
      isProduction: true,
      navigator: { serviceWorker: { register: vi.fn() } },
      window: { addEventListener },
    });

    expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
  });

  test('does not add a load listener outside production', () => {
    const addEventListener = vi.fn();

    registerPwaServiceWorker({
      isProduction: false,
      navigator: { serviceWorker: { register: vi.fn() } },
      window: { addEventListener },
    });

    expect(addEventListener).not.toHaveBeenCalled();
  });

  test('does not add a load listener when service workers are unsupported', () => {
    const addEventListener = vi.fn();

    registerPwaServiceWorker({
      isProduction: true,
      navigator: {},
      window: { addEventListener },
    });

    expect(addEventListener).not.toHaveBeenCalled();
  });

  test('registers the default service worker on load', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn((_event: string, callback: () => void) => {
      callback();
    });

    registerPwaServiceWorker({
      isProduction: true,
      navigator: { serviceWorker: { register } },
      window: { addEventListener },
    });

    await Promise.resolve();

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  test('registers a custom service worker path and scope on load', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn((_event: string, callback: () => void) => {
      callback();
    });

    registerPwaServiceWorker({
      isProduction: true,
      navigator: { serviceWorker: { register } },
      window: { addEventListener },
      serviceWorkerPath: '/assets/sw.js',
      scope: '/app/',
    });

    await Promise.resolve();

    expect(register).toHaveBeenCalledWith('/assets/sw.js', { scope: '/app/' });
  });

  test('logs a warning when registration fails', async () => {
    const error = new Error('registration failed');
    const register = vi.fn().mockRejectedValue(error);
    const addEventListener = vi.fn((_event: string, callback: () => void) => {
      callback();
    });
    const warn = vi.fn();

    registerPwaServiceWorker({
      isProduction: true,
      navigator: { serviceWorker: { register } },
      window: { addEventListener },
      logger: { warn },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith('Service worker registration failed', error);
  });

  test('does not warn when registration succeeds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn((_event: string, callback: () => void) => {
      callback();
    });
    const warn = vi.fn();

    registerPwaServiceWorker({
      isProduction: true,
      navigator: { serviceWorker: { register } },
      window: { addEventListener },
      logger: { warn },
    });

    await Promise.resolve();

    expect(warn).not.toHaveBeenCalled();
  });
});
