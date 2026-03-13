import { describe, expect, it } from 'vitest';
import { asRecord, parseConfidence, parseJsonValue } from '../routes/route-utils.js';

describe('route utils', () => {
  it('parses JSON strings into structured values', () => {
    expect(parseJsonValue('{"ticker":"AAPL"}')).toEqual({ ticker: 'AAPL' });
  });

  it('returns an empty object for non-record values', () => {
    expect(asRecord('["AAPL"]')).toEqual({});
    expect(asRecord(null)).toEqual({});
  });

  it('parses finite numeric confidence values from strings and numbers', () => {
    expect(parseConfidence('0.84')).toBe(0.84);
    expect(parseConfidence(0.42)).toBe(0.42);
    expect(parseConfidence('not-a-number')).toBeNull();
  });
});
