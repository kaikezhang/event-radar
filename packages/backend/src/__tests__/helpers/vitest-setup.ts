import { afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

afterEach(() => {
  // If fetch was replaced with a vi.fn() mock, restore it
  if (
    typeof globalThis.fetch === 'function' &&
    'mockRestore' in globalThis.fetch
  ) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRestore();
  }
  // Fallback: if fetch is still not the original, forcibly restore
  if (globalThis.fetch !== originalFetch && originalFetch) {
    globalThis.fetch = originalFetch;
  }
});
