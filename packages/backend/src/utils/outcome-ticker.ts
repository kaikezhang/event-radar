import { isTickerBlocklisted } from '../pipeline/ticker-candidate.js';

const FORD_TICKER = 'FORD';
const NORMALIZED_FORD_TICKER = 'F';

export function normalizeOutcomeTicker(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0 || normalized.length > 10) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return null;
  }

  if (isTickerBlocklisted(normalized)) {
    return null;
  }

  return normalized === FORD_TICKER ? NORMALIZED_FORD_TICKER : normalized;
}
