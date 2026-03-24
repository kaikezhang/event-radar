export const MAX_OUTCOME_CHANGE_PERCENT = 200;

export function clampOutcomePercent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(-MAX_OUTCOME_CHANGE_PERCENT, Math.min(MAX_OUTCOME_CHANGE_PERCENT, value));
}
