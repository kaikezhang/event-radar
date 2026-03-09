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

/**
 * Ring buffer for tracking seen IDs (deduplication).
 * Keeps only the last `capacity` entries.
 */
export class SeenIdBuffer {
  private readonly ids: string[] = [];
  private readonly capacity: number;

  constructor(capacity = 200) {
    this.capacity = capacity;
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
  }

  get size(): number {
    return this.ids.length;
  }
}
