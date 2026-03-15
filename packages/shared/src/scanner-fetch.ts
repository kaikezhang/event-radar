export interface ScannerFetchOptions extends RequestInit {
  timeoutMs?: number;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError')
    || (
      typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'AbortError'
    )
  );
}

export async function scannerFetch(
  url: string | URL,
  options?: ScannerFetchOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const existingSignal = options?.signal;
  const signal = existingSignal
    ? AbortSignal.any([existingSignal, controller.signal])
    : controller.signal;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _timeoutMs, signal: _existingSignal, ...fetchOptions } = options ?? {};
    return await fetch(url, { ...fetchOptions, signal });
  } catch (error) {
    if (controller.signal.aborted && !(existingSignal?.aborted ?? false) && isAbortError(error)) {
      const timeoutError = new Error(`request timed out after ${timeoutMs}ms`);
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
