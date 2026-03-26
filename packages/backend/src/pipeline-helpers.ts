/** Primary sources — used for circuit breaker fallback (pass primary, block secondary) */
export const PRIMARY_SOURCES_SET = new Set([
  'sec-edgar', 'fda', 'truth-social', 'federal-register', 'trading-halt',
  'sec-regulatory', 'ftc', 'fed', 'treasury',
  'commerce', 'cfpb',
]);

/** Categorize alert filter reason string into a metric-friendly bucket */
export function categorizeFilterReason(reason: string): string {
  if (reason.includes('stale')) return 'stale';
  if (reason.includes('retrospective')) return 'retrospective';
  if (reason.includes('keyword')) return 'keyword';
  if (reason.includes('cooldown')) return 'cooldown';
  if (reason.includes('social')) return 'social_noise';
  if (reason.includes('newswire')) return 'newswire_noise';
  if (reason.includes('insider')) return 'insider_threshold';
  if (reason.includes('primary source')) return 'primary_pass';
  if (reason.includes('calendar')) return 'calendar';
  if (reason.includes('default')) return 'default';
  return 'other';
}

export function intFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Truncate title for logs */
export function logTitle(title: string): string {
  return title.length > 80 ? title.slice(0, 77) + '...' : title;
}
