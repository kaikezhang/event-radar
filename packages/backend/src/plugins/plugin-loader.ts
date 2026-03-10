import { readdir, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '@event-radar/shared';
import { ok, err } from '@event-radar/shared';
import type { ScannerPlugin, ScannerPluginModule, PluginDeps } from './scanner-plugin.js';
import type { PluginsConfig } from './plugin-config.js';
import { getPluginConfig } from './plugin-config.js';
import { PluginRegistry } from './plugin-registry.js';

export interface PluginLoaderOptions {
  /** Directory containing plugin sub-directories */
  pluginsDir: string;
  /** Host dependencies to inject into plugins */
  deps: PluginDeps;
  /** Per-plugin config (from plugins.json) */
  config: PluginsConfig;
}

export interface LoadResult {
  loaded: string[];
  skipped: string[];
  errors: Array<{ dir: string; error: string }>;
}

/**
 * Validate that a loaded module looks like a ScannerPlugin.
 */
function isScannerPlugin(value: unknown): value is ScannerPlugin {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.create === 'function'
  );
}

/**
 * Load a single plugin from a directory.
 */
async function loadSinglePlugin(
  pluginDir: string,
): Promise<Result<ScannerPlugin, Error>> {
  // Check for package.json
  const pkgPath = join(pluginDir, 'package.json');
  try {
    await access(pkgPath);
  } catch {
    return err(new Error(`Missing package.json in ${pluginDir}`));
  }

  // Read package.json to find main entry
  let mainEntry = 'index.js';
  try {
    const pkgRaw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    if (typeof pkg.main === 'string') {
      mainEntry = pkg.main;
    }
  } catch (e) {
    return err(new Error(`Invalid package.json in ${pluginDir}: ${e}`));
  }

  const entryPath = join(pluginDir, mainEntry);
  try {
    await access(entryPath);
  } catch {
    return err(new Error(`Entry file not found: ${entryPath}`));
  }

  try {
    const mod = (await import(entryPath)) as ScannerPluginModule;
    const plugin = mod.default;

    if (!isScannerPlugin(plugin)) {
      return err(
        new Error(
          `Plugin in ${pluginDir} does not export a valid ScannerPlugin as default`,
        ),
      );
    }

    return ok(plugin);
  } catch (e) {
    return err(
      new Error(`Failed to import plugin from ${pluginDir}: ${e}`),
    );
  }
}

/**
 * Scan the plugins directory and load all valid plugins into a PluginRegistry.
 */
export async function loadPlugins(
  options: PluginLoaderOptions,
): Promise<Result<{ registry: PluginRegistry; result: LoadResult }, Error>> {
  const { pluginsDir, deps, config } = options;
  const registry = new PluginRegistry();
  const result: LoadResult = { loaded: [], skipped: [], errors: [] };

  let entries: string[];
  try {
    const dirEntries = await readdir(pluginsDir, { withFileTypes: true });
    entries = dirEntries
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      // No plugins directory — that's fine
      return ok({ registry, result });
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }

  for (const dirName of entries) {
    const pluginDir = join(pluginsDir, dirName);
    const loadResult = await loadSinglePlugin(pluginDir);

    if (!loadResult.ok) {
      result.errors.push({ dir: dirName, error: loadResult.error.message });
      continue;
    }

    const plugin = loadResult.value;
    const pluginConfig = getPluginConfig(config, plugin.id);

    if (pluginConfig.enabled === false) {
      result.skipped.push(plugin.id);
      continue;
    }

    try {
      registry.registerPlugin(plugin, pluginConfig, deps);
      result.loaded.push(plugin.id);
    } catch (e) {
      result.errors.push({
        dir: dirName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return ok({ registry, result });
}
