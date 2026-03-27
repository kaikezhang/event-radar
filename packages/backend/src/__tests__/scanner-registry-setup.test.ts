import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { registerScanners } from '../scanner-registry-setup.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, ORIGINAL_ENV);
}

describe('scanner registry setup', () => {
  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it('registers only the surviving scanners when enabled', () => {
    process.env.TRUTH_SOCIAL_ENABLED = 'true';
    process.env.ECON_CALENDAR_ENABLED = 'true';
    process.env.BREAKING_NEWS_ENABLED = 'true';
    process.env.FDA_ENABLED = 'true';
    process.env.FEDERAL_REGISTER_ENABLED = 'true';
    process.env.NEWSWIRE_ENABLED = 'true';
    process.env.SEC_EDGAR_ENABLED = 'true';
    process.env.HALT_SCANNER_ENABLED = 'true';

    const registry = { register: vi.fn() };
    registerScanners(registry as never, new InMemoryEventBus());

    const registeredNames = registry.register.mock.calls.map(([scanner]) => scanner.name);
    expect(registeredNames).toContain('truth-social');
    expect(registeredNames).toContain('econ-calendar');
    expect(registeredNames).toContain('breaking-news');
    expect(registeredNames).toContain('fda');
    expect(registeredNames).toContain('federal-register');
    expect(registeredNames).toContain('newswire');
    expect(registeredNames).toContain('sec-edgar');
    expect(registeredNames).toContain('trading-halt');
  });

  it('registers nothing when all live scanners are disabled', () => {
    process.env.TRUTH_SOCIAL_ENABLED = 'false';
    process.env.BREAKING_NEWS_ENABLED = 'false';
    process.env.FDA_ENABLED = 'false';
    process.env.FEDERAL_REGISTER_ENABLED = 'false';
    process.env.ECON_CALENDAR_ENABLED = 'false';
    process.env.NEWSWIRE_ENABLED = 'false';
    process.env.SEC_EDGAR_ENABLED = 'false';
    process.env.HALT_SCANNER_ENABLED = 'false';

    const registry = { register: vi.fn() };
    registerScanners(registry as never, new InMemoryEventBus());

    const registeredNames = registry.register.mock.calls.map(([scanner]) => scanner.name);
    expect(registeredNames).toEqual([]);
  });
});
