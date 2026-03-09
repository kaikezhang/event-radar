import { describe, it, expect } from 'vitest';
import { classifySeverity } from '../severity-classifier.js';
import type { RawEvent } from '@event-radar/shared';

function makeEvent(itemTypes: string[]): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test filing',
    body: 'Test body',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { item_types: itemTypes },
  };
}

describe('classifySeverity', () => {
  it('should return CRITICAL for 1.03 (Bankruptcy)', () => {
    expect(classifySeverity(makeEvent(['1.03']))).toBe('CRITICAL');
  });

  it('should return HIGH for 5.02 (CEO Departure)', () => {
    expect(classifySeverity(makeEvent(['5.02']))).toBe('HIGH');
  });

  it('should return MEDIUM for 2.02 (Results of Operations)', () => {
    expect(classifySeverity(makeEvent(['2.02']))).toBe('MEDIUM');
  });

  it('should return LOW for 9.01 (Financial Statements)', () => {
    expect(classifySeverity(makeEvent(['9.01']))).toBe('LOW');
  });

  it('should pick the highest severity among multiple items', () => {
    // 9.01=LOW, 1.03=CRITICAL → CRITICAL wins
    expect(classifySeverity(makeEvent(['9.01', '1.03']))).toBe('CRITICAL');
  });

  it('should return MEDIUM for unknown item types', () => {
    expect(classifySeverity(makeEvent(['99.99']))).toBe('MEDIUM');
  });

  it('should return MEDIUM when no metadata present', () => {
    const event: RawEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'test',
      type: 'unknown',
      title: 'No metadata',
      body: '',
      timestamp: new Date(),
    };
    expect(classifySeverity(event)).toBe('MEDIUM');
  });

  it('should return MEDIUM when item_types is empty', () => {
    expect(classifySeverity(makeEvent([]))).toBe('MEDIUM');
  });
});
