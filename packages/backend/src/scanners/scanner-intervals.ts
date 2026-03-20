function parseIntervalMs(rawValue: string | undefined, defaultMs: number): number {
  const parsed = Number.parseInt(rawValue ?? String(defaultMs), 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return defaultMs;
}

export function resolveScannerIntervalMs(
  envKey: string | readonly string[],
  defaultMs: number,
): number {
  const keys = Array.isArray(envKey) ? envKey : [envKey];

  const configuredValue = keys
    .map((key) => process.env[`SCANNER_INTERVAL_${key}`])
    .find((value) => value != null && value.trim().length > 0)
    ?? process.env.SCANNER_INTERVAL_DEFAULT;

  return parseIntervalMs(configuredValue, defaultMs);
}
