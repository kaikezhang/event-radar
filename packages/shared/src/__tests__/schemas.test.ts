import { describe, it, expect } from 'vitest';
import { RawEventSchema, ScannerHealthSchema, ok, err } from '../index.js';

describe('RawEventSchema', () => {
  it('should parse a valid raw event', () => {
    const event = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'sec-edgar',
      type: '8-K',
      title: 'Apple Inc. files 8-K',
      body: 'Item 2.02 Results of Operations',
      url: 'https://sec.gov/filing/123',
      timestamp: '2024-01-15T10:30:00Z',
      metadata: { cik: '0000320193' },
    };
    const result = RawEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should reject an event with missing required fields', () => {
    const result = RawEventSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('ScannerHealthSchema', () => {
  it('should parse valid scanner health', () => {
    const health = {
      scanner: 'sec-edgar',
      status: 'healthy',
      lastScanAt: new Date().toISOString(),
      errorCount: 0,
    };
    const result = ScannerHealthSchema.safeParse(health);
    expect(result.success).toBe(true);
  });
});

describe('Result', () => {
  it('should create ok result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('should create err result', () => {
    const result = err(new Error('failed'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('failed');
    }
  });
});
