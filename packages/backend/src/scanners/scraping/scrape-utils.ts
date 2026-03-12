import type { Page } from 'playwright';

/**
 * Extract text content from a CSS selector, returning empty string if not found.
 */
export async function extractTextContent(
  page: Page,
  selector: string,
): Promise<string> {
  try {
    const element = await page.$(selector);
    if (!element) return '';
    const text = await element.textContent();
    return text?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Wait for a selector to appear on the page within the given timeout.
 * Returns true if found, false if timeout.
 */
export async function waitForContent(
  page: Page,
  selector: string,
  timeout = 10_000,
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract all matching elements' text content as an array.
 */
export async function extractAllTextContent(
  page: Page,
  selector: string,
): Promise<string[]> {
  try {
    const elements = await page.$$(selector);
    const texts: string[] = [];
    for (const el of elements) {
      const text = await el.textContent();
      if (text?.trim()) texts.push(text.trim());
    }
    return texts;
  } catch {
    return [];
  }
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Ring buffer for tracking seen IDs (deduplication).
 * Keeps only the last `capacity` entries.
 * Persists to disk so IDs survive backend restarts.
 */
export class SeenIdBuffer {
  private readonly ids: string[] = [];
  private readonly capacity: number;
  private readonly persistPath: string | null;

  constructor(capacity = 200, name?: string) {
    this.capacity = capacity;
    // Persist to /tmp/event-radar-seen/<name>.json if name provided
    if (name) {
      const dir = '/tmp/event-radar-seen';
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      this.persistPath = join(dir, `${name}.json`);
      this.load();
    } else {
      this.persistPath = null;
    }
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  add(id: string): void {
    if (this.has(id)) return;
    this.ids.push(id);
    if (this.ids.length > this.capacity) {
      this.ids.shift();
    }
    this.save();
  }

  get size(): number {
    return this.ids.length;
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.persistPath, 'utf-8'));
      if (Array.isArray(data)) {
        this.ids.push(...data.slice(-this.capacity));
      }
    } catch { /* ignore corrupt file */ }
  }

  private save(): void {
    if (!this.persistPath) return;
    try {
      writeFileSync(this.persistPath, JSON.stringify(this.ids));
    } catch { /* ignore write errors */ }
  }
}
