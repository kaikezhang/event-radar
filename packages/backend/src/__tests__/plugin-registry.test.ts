import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { InMemoryEventBus } from '@event-radar/shared';
import { PluginRegistry } from '../plugins/plugin-registry.js';
import type { ScannerPlugin, PluginDeps } from '../plugins/scanner-plugin.js';
import type { PluginConfigEntry } from '../plugins/plugin-config.js';
import { DummyScanner } from '../scanners/dummy-scanner.js';

function makeDeps(eventBus?: InMemoryEventBus): PluginDeps {
  const bus = eventBus ?? new InMemoryEventBus();
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    eventBus: bus,
    httpClient: { fetch: vi.fn() },
  };
}

function makePlugin(
  overrides?: Partial<ScannerPlugin>,
): ScannerPlugin {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    create(_config, deps) {
      return new DummyScanner(deps.eventBus);
    },
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;
  let deps: PluginDeps;
  const config: PluginConfigEntry = { enabled: true, settings: {} };

  beforeEach(() => {
    registry = new PluginRegistry();
    deps = makeDeps();
  });

  it('should register a plugin', () => {
    const plugin = makePlugin();
    registry.registerPlugin(plugin, config, deps);
    expect(registry.size).toBe(1);
    expect(registry.getPlugin('test-plugin')).toBeDefined();
  });

  it('should throw when registering duplicate plugin id', () => {
    const plugin = makePlugin();
    registry.registerPlugin(plugin, config, deps);
    expect(() => registry.registerPlugin(plugin, config, deps)).toThrow(
      'already registered',
    );
  });

  it('should unregister a plugin', () => {
    const plugin = makePlugin();
    registry.registerPlugin(plugin, config, deps);
    expect(registry.unregisterPlugin('test-plugin')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.getPlugin('test-plugin')).toBeUndefined();
  });

  it('should return false when unregistering non-existent plugin', () => {
    expect(registry.unregisterPlugin('nonexistent')).toBe(false);
  });

  it('should list registered plugins', () => {
    registry.registerPlugin(makePlugin(), config, deps);
    registry.registerPlugin(
      makePlugin({ id: 'other', name: 'Other' }),
      config,
      deps,
    );
    const list = registry.listPlugins();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('test-plugin');
    expect(list[1].id).toBe('other');
  });

  it('should validate config against configSchema', () => {
    const schema = z.object({
      apiKey: z.string().min(1),
    });
    const plugin = makePlugin({ configSchema: schema });
    expect(() =>
      registry.registerPlugin(plugin, { settings: {} }, deps),
    ).toThrow('Invalid config');
  });

  it('should accept valid config when schema is provided', () => {
    const schema = z.object({
      apiKey: z.string().min(1),
    });
    const plugin = makePlugin({ configSchema: schema });
    registry.registerPlugin(
      plugin,
      { settings: { apiKey: 'abc123' } },
      deps,
    );
    expect(registry.size).toBe(1);
  });

  it('should start all enabled plugins', () => {
    const plugin = makePlugin();
    registry.registerPlugin(plugin, { enabled: true }, deps);
    registry.startAll();
    const entry = registry.getPlugin('test-plugin');
    expect(entry?.scanner.running).toBe(true);
    registry.stopAll();
  });

  it('should skip disabled plugins on startAll', () => {
    const plugin = makePlugin();
    registry.registerPlugin(plugin, { enabled: false }, deps);
    registry.startAll();
    const entry = registry.getPlugin('test-plugin');
    expect(entry?.scanner.running).toBe(false);
  });

  it('should stop all running plugins', () => {
    const plugin = makePlugin();
    registry.registerPlugin(plugin, { enabled: true }, deps);
    registry.startAll();
    registry.stopAll();
    const entry = registry.getPlugin('test-plugin');
    expect(entry?.scanner.running).toBe(false);
  });

  it('should collect health from all plugins', () => {
    registry.registerPlugin(makePlugin(), config, deps);
    registry.registerPlugin(
      makePlugin({ id: 'other', name: 'Other' }),
      config,
      deps,
    );
    const health = registry.healthAll();
    expect(health).toHaveLength(2);
    expect(health[0].scanner).toBe('dummy');
    expect(health[0].status).toBe('healthy');
  });
});
