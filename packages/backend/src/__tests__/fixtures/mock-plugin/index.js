// Mock scanner plugin for testing the plugin SDK
// This is intentionally plain JS so it can be dynamically imported in tests.

import { randomUUID } from 'node:crypto';

class MockPluginScanner {
  constructor(options) {
    this.name = options.name;
    this.source = options.source;
    this.pollIntervalMs = options.pollIntervalMs;
    this._eventBus = options.eventBus;
    this._timer = null;
    this._lastScanAt = null;
    this._errorCount = 0;
    this._running = false;
    this._config = options.config;
  }

  async poll() {
    return {
      ok: true,
      value: [
        {
          id: randomUUID(),
          source: 'mock-plugin',
          type: 'mock-event',
          title: `Mock event: ${this._config.prefix || 'default'}`,
          body: 'Test event from mock plugin',
          timestamp: new Date(),
        },
      ],
    };
  }

  async scan() {
    try {
      const result = await this.poll();
      if (result.ok) {
        this._errorCount = 0;
        this._lastScanAt = new Date();
        for (const event of result.value) {
          await this._eventBus.publish(event);
        }
      } else {
        this._errorCount++;
        this._lastScanAt = new Date();
      }
      return result;
    } catch (e) {
      this._errorCount++;
      this._lastScanAt = new Date();
      return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => void this.scan(), this.pollIntervalMs);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  get running() {
    return this._running;
  }

  health() {
    let status = 'healthy';
    if (this._errorCount >= 3) status = 'down';
    else if (this._errorCount >= 1) status = 'degraded';
    return {
      scanner: this.name,
      status,
      lastScanAt: this._lastScanAt,
      errorCount: this._errorCount,
    };
  }
}

const plugin = {
  id: 'mock-scanner',
  name: 'Mock Scanner',
  version: '1.0.0',
  description: 'A mock scanner for testing the plugin SDK',
  meta: {
    author: 'event-radar',
    license: 'MIT',
    tags: ['test', 'mock'],
  },
  create(config, deps) {
    return new MockPluginScanner({
      name: 'mock-scanner',
      source: 'mock-plugin',
      pollIntervalMs: 60_000,
      eventBus: deps.eventBus,
      config,
    });
  },
};

export default plugin;
