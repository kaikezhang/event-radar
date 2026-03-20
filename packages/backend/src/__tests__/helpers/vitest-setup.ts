import { afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

afterEach(() => {
  if (
    typeof globalThis.fetch === 'function' &&
    'mockRestore' in globalThis.fetch
  ) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRestore();
  }
  if (globalThis.fetch !== originalFetch && originalFetch) {
    globalThis.fetch = originalFetch;
  }
});
