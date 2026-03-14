import type { ScannerHealth } from './schemas/scanner-health.js';
import type { BaseScanner } from './base-scanner.js';

const SOURCE_ALIASES: Record<string, string> = {
  'x': 'x-elonmusk',
  'twitter': 'x-elonmusk',
  'form-4': 'sec-edgar',
  'form4': 'sec-edgar',
  '8-k': 'sec-edgar',
  '8k': 'sec-edgar',
};

export function normalizeScannerId(id: string): string {
  const normalized = id.trim().toLowerCase();
  return SOURCE_ALIASES[normalized] ?? normalized;
}

export class ScannerRegistry {
  private readonly scanners = new Map<string, BaseScanner>();

  register(scanner: BaseScanner): void {
    if (this.scanners.has(scanner.name)) {
      throw new Error(`Scanner "${scanner.name}" is already registered`);
    }
    this.scanners.set(scanner.name, scanner);
  }

  unregister(name: string): void {
    const normalized = normalizeScannerId(name);
    const scanner = this.scanners.get(normalized);
    if (scanner) {
      scanner.stop();
      this.scanners.delete(normalized);
    }
  }
  getById(name: string): BaseScanner | undefined {
    const normalized = normalizeScannerId(name);
    return this.scanners.get(normalized);
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
