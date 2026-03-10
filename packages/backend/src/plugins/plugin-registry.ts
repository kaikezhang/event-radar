import type { BaseScanner, ScannerHealth } from '@event-radar/shared';
import type { ScannerPlugin, PluginDeps } from './scanner-plugin.js';
import type { PluginConfigEntry } from './plugin-config.js';

export interface PluginEntry {
  readonly plugin: ScannerPlugin;
  readonly scanner: BaseScanner;
  readonly config: PluginConfigEntry;
}

/**
 * Extended scanner registry that supports dynamic plugin lifecycle.
 *
 * Plugin lifecycle: register → start → poll (via BaseScanner) → stop → unregister
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, PluginEntry>();

  /**
   * Register a plugin, validate its config if a schema is provided,
   * and create the scanner instance.
   */
  registerPlugin(
    plugin: ScannerPlugin,
    config: PluginConfigEntry,
    deps: PluginDeps,
  ): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`);
    }

    const settings = config.settings ?? {};

    // Validate config against plugin's schema if provided
    if (plugin.configSchema) {
      const parseResult = plugin.configSchema.safeParse(settings);
      if (!parseResult.success) {
        throw new Error(
          `Invalid config for plugin "${plugin.id}": ${parseResult.error.message}`,
        );
      }
    }

    const scanner = plugin.create(settings, deps);

    this.plugins.set(plugin.id, { plugin, scanner, config });
  }

  /**
   * Stop and remove a plugin.
   */
  unregisterPlugin(id: string): boolean {
    const entry = this.plugins.get(id);
    if (!entry) return false;

    entry.scanner.stop();
    this.plugins.delete(id);
    return true;
  }

  /**
   * List all registered plugins with metadata.
   */
  listPlugins(): Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    running: boolean;
  }> {
    return [...this.plugins.values()].map(({ plugin, scanner, config }) => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      enabled: config.enabled !== false,
      running: scanner.running,
    }));
  }

  /**
   * Get a plugin entry by id.
   */
  getPlugin(id: string): PluginEntry | undefined {
    return this.plugins.get(id);
  }

  /**
   * Start all enabled plugins.
   */
  startAll(): void {
    for (const entry of this.plugins.values()) {
      if (entry.config.enabled !== false) {
        entry.scanner.start();
      }
    }
  }

  /**
   * Stop all plugins.
   */
  stopAll(): void {
    for (const entry of this.plugins.values()) {
      entry.scanner.stop();
    }
  }

  /**
   * Collect health from all registered plugin scanners.
   */
  healthAll(): ScannerHealth[] {
    return [...this.plugins.values()].map(({ scanner }) => scanner.health());
  }

  /**
   * Number of registered plugins.
   */
  get size(): number {
    return this.plugins.size;
  }
}
