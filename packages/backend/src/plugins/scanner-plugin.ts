import type { z } from 'zod';
import type { BaseScanner, EventBus } from '@event-radar/shared';

/**
 * Dependencies injected into scanner plugins by the host.
 */
export interface PluginDeps {
  readonly logger: PluginLogger;
  readonly eventBus: EventBus;
  readonly httpClient: PluginHttpClient;
}

/**
 * Minimal logger interface provided to plugins.
 */
export interface PluginLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Rate-limited HTTP client provided to plugins.
 */
export interface PluginHttpClient {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Metadata about a scanner plugin.
 */
export interface PluginMeta {
  readonly author?: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly tags?: readonly string[];
}

/**
 * Interface that all scanner plugins must implement.
 */
export interface ScannerPlugin {
  /** Unique plugin identifier (e.g. "my-rss-scanner") */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Semver version string */
  readonly version: string;
  /** Short description of what this plugin scans */
  readonly description: string;
  /** Optional zod schema for plugin-specific configuration */
  readonly configSchema?: z.ZodType;
  /** Optional metadata */
  readonly meta?: PluginMeta;
  /**
   * Factory: create a BaseScanner instance from validated config and host deps.
   */
  create(config: Record<string, unknown>, deps: PluginDeps): BaseScanner;
}

/**
 * The shape of a plugin module's default export.
 */
export interface ScannerPluginModule {
  default: ScannerPlugin;
}
