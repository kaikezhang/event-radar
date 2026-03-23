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

  it('does not register dead scanners even when their env flags are enabled', () => {
    process.env.CONGRESS_ENABLED = 'true';
    process.env.UNUSUAL_OPTIONS_ENABLED = 'true';
    process.env.SHORT_INTEREST_ENABLED = 'true';
    process.env.DOJ_ENABLED = 'true';
    process.env.ANALYST_ENABLED = 'true';
    process.env.NEWSWIRE_ENABLED = 'true';
    process.env.SEC_EDGAR_ENABLED = 'true';

    const registry = { register: vi.fn() };
    registerScanners(registry as never, new InMemoryEventBus());

    const registeredNames = registry.register.mock.calls.map(([scanner]) => scanner.name);
    expect(registeredNames).toContain('newswire');
    expect(registeredNames).toContain('sec-edgar');
    expect(registeredNames).not.toContain('congress');
    expect(registeredNames).not.toContain('unusual-options');
    expect(registeredNames).not.toContain('short-interest');
    expect(registeredNames).not.toContain('doj');
    expect(registeredNames).not.toContain('analyst');
  });

  it('keeps active scanners registered by their existing env gates', () => {
    process.env.REDDIT_ENABLED = 'true';
    process.env.STOCKTWITS_ENABLED = 'true';
    process.env.FDA_ENABLED = 'true';
    process.env.WHITEHOUSE_ENABLED = 'true';
    process.env.FEDERAL_REGISTER_ENABLED = 'true';

    const registry = { register: vi.fn() };
    registerScanners(registry as never, new InMemoryEventBus());

    const registeredNames = registry.register.mock.calls.map(([scanner]) => scanner.name);
    expect(registeredNames).toContain('reddit');
    expect(registeredNames).toContain('stocktwits');
    expect(registeredNames).toContain('fda');
    expect(registeredNames).toContain('whitehouse');
    expect(registeredNames).toContain('federal-register');
  });
});
