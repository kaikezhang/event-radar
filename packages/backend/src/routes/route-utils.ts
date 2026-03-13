export function parseJsonValue<T>(value: unknown): T | unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue<Record<string, unknown>>(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return {};
}

export function parseConfidence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
