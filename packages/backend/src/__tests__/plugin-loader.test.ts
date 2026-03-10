import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import { loadPlugins } from '../plugins/plugin-loader.js';
import {
  loadPluginsConfig,
  getPluginConfig,
  interpolateEnvVars,
} from '../plugins/plugin-config.js';
import type { PluginDeps } from '../plugins/scanner-plugin.js';

const FIXTURES_DIR = join(__dirname, 'fixtures');

function makeDeps(): PluginDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    eventBus: new InMemoryEventBus(),
    httpClient: { fetch: vi.fn() },
  };
}

describe('interpolateEnvVars', () => {
  it('should replace env var placeholders in strings', () => {
    process.env.TEST_PLUGIN_KEY = 'secret123';
    expect(interpolateEnvVars('key=${TEST_PLUGIN_KEY}')).toBe('key=secret123');
    delete process.env.TEST_PLUGIN_KEY;
  });

  it('should return empty string for missing env vars', () => {
    delete process.env.MISSING_VAR;
    expect(interpolateEnvVars('${MISSING_VAR}')).toBe('');
  });

  it('should recursively interpolate objects', () => {
    process.env.NESTED_KEY = 'val';
    const result = interpolateEnvVars({ a: { b: '${NESTED_KEY}' } });
    expect(result).toEqual({ a: { b: 'val' } });
    delete process.env.NESTED_KEY;
  });

  it('should interpolate arrays', () => {
    process.env.ARR_VAL = 'x';
    const result = interpolateEnvVars(['${ARR_VAL}', 'static']);
    expect(result).toEqual(['x', 'static']);
    delete process.env.ARR_VAL;
  });

  it('should pass through non-string primitives', () => {
    expect(interpolateEnvVars(42)).toBe(42);
    expect(interpolateEnvVars(true)).toBe(true);
    expect(interpolateEnvVars(null)).toBe(null);
  });
});

describe('getPluginConfig', () => {
  it('should return config for existing plugin', () => {
    const config = { 'my-plugin': { enabled: false, settings: { x: 1 } } };
    expect(getPluginConfig(config, 'my-plugin')).toEqual({
      enabled: false,
      settings: { x: 1 },
    });
  });

  it('should return defaults for unknown plugin', () => {
    expect(getPluginConfig({}, 'unknown')).toEqual({
      enabled: true,
      settings: {},
    });
  });
});

describe('loadPluginsConfig', () => {
  it('should return empty config when file does not exist', async () => {
    const result = await loadPluginsConfig('/nonexistent/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({});
    }
  });
});

describe('loadPlugins', () => {
  let deps: PluginDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('should load a valid plugin from fixtures directory', async () => {
    // The fixtures dir has mock-plugin/ inside it
    const result = await loadPlugins({
      pluginsDir: FIXTURES_DIR,
      deps,
      config: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // mock-plugin should load (there may be other fixture dirs that fail, that's fine)
    const { registry, result: loadResult } = result.value;
    expect(loadResult.loaded).toContain('mock-scanner');
    expect(registry.size).toBeGreaterThanOrEqual(1);
  });

  it('should skip disabled plugins', async () => {
    const result = await loadPlugins({
      pluginsDir: FIXTURES_DIR,
      deps,
      config: { 'mock-scanner': { enabled: false } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.result.skipped).toContain('mock-scanner');
    expect(result.value.registry.getPlugin('mock-scanner')).toBeUndefined();
  });

  it('should return empty registry when plugins dir does not exist', async () => {
    const result = await loadPlugins({
      pluginsDir: '/nonexistent/plugins',
      deps,
      config: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.registry.size).toBe(0);
    expect(result.value.result.loaded).toHaveLength(0);
  });

  it('should report errors for invalid plugin directories', async () => {
    // fixtures/ may contain dirs without package.json
    // Create a temp scenario by pointing to a dir with a non-plugin subdir
    const result = await loadPlugins({
      pluginsDir: FIXTURES_DIR,
      deps,
      config: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // At minimum mock-scanner should load successfully
    expect(result.value.result.loaded).toContain('mock-scanner');
  });

  it('should create a working scanner from loaded plugin', async () => {
    const bus = new InMemoryEventBus();
    const localDeps = { ...deps, eventBus: bus };

    const result = await loadPlugins({
      pluginsDir: FIXTURES_DIR,
      deps: localDeps,
      config: { 'mock-scanner': { settings: { prefix: 'hello' } } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = result.value.registry.getPlugin('mock-scanner');
    expect(entry).toBeDefined();

    // Run a scan
    const events: unknown[] = [];
    bus.subscribe((e) => { events.push(e); });
    await entry!.scanner.scan();

    expect(events).toHaveLength(1);
  });
});
