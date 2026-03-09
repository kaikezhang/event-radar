import type { ScannerHealth } from './schemas/scanner-health.js';
import type { BaseScanner } from './base-scanner.js';

export class ScannerRegistry {
  private readonly scanners = new Map<string, BaseScanner>();

  register(scanner: BaseScanner): void {
    if (this.scanners.has(scanner.name)) {
      throw new Error(`Scanner "${scanner.name}" is already registered`);
    }
    this.scanners.set(scanner.name, scanner);
  }

  unregister(name: string): void {
    const scanner = this.scanners.get(name);
    if (scanner) {
      scanner.stop();
      this.scanners.delete(name);
    }
  }

  getById(name: string): BaseScanner | undefined {
    return this.scanners.get(name);
  }

  startAll(): void {
    for (const scanner of this.scanners.values()) {
      scanner.start();
    }
  }

  stopAll(): void {
    for (const scanner of this.scanners.values()) {
      scanner.stop();
    }
  }

  healthAll(): ScannerHealth[] {
    return [...this.scanners.values()].map((s) => s.health());
  }
}
