import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '@event-radar/shared';
import { ok, err } from '@event-radar/shared';

/**
 * Per-plugin configuration entry in plugins.json
 */
export interface PluginConfigEntry {
  /** Whether the plugin is enabled (default true) */
  enabled?: boolean;
  /** Plugin-specific settings, validated against its configSchema */
  settings?: Record<string, unknown>;
}

export type PluginsConfig = Record<string, PluginConfigEntry>;

const ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)}/g;

/**
 * Interpolate `${ENV_VAR}` references in string values.
 */
export function interpolateEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(ENV_VAR_PATTERN, (_match, name: string) => {
      return process.env[name] ?? '';
    });
  }
  if (Array.isArray(value)) {
    return value.map(interpolateEnvVars);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = interpolateEnvVars(v);
    }
    return result;
  }
  return value;
}

/**
 * Load the plugins config file from a directory.
 * Returns an empty config if the file does not exist.
 */
export async function loadPluginsConfig(
  configDir: string,
): Promise<Result<PluginsConfig, Error>> {
  const filePath = join(configDir, 'plugins.json');
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return err(new Error('plugins.json must be a JSON object'));
    }
    const interpolated = interpolateEnvVars(parsed) as PluginsConfig;
    return ok(interpolated);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok({});
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Get the config entry for a specific plugin, falling back to defaults.
 */
export function getPluginConfig(
  config: PluginsConfig,
  pluginId: string,
): PluginConfigEntry {
  return config[pluginId] ?? { enabled: true, settings: {} };
}
