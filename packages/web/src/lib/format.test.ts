import { describe, expect, it } from 'vitest';
import { formatPercent } from './format.js';

describe('formatPercent', () => {
  it('prefixes positive values with a plus sign', () => {
    expect(formatPercent(2.34, 1)).toBe('+2.3%');
  });

  it('does not prefix zero or negative values with a plus sign', () => {
    expect(formatPercent(0, 1)).toBe('0.0%');
    expect(formatPercent(-1.25, 1)).toBe('-1.3%');
  });
});
