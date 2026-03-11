import { describe, expect, it } from 'vitest';
import { parseRule, validateRule } from '../services/rule-parser.js';

describe('parseRule', () => {
  it('parses a simple equality condition', () => {
    const result = parseRule(
      'IF source = "sec-edgar" THEN priority = "CRITICAL"',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.dsl).toBe(
      'IF source = "sec-edgar" THEN priority = "CRITICAL"',
    );
    expect(result.value.conditions).toEqual({
      field: 'source',
      operator: '=',
      value: 'sec-edgar',
      negate: false,
    });
    expect(result.value.actions).toEqual({ priority: 'CRITICAL' });
  });

  it('parses compound conditions with AND and OR precedence', () => {
    const result = parseRule(
      'IF source = "sec-edgar" OR ticker = "AAPL" AND severity >= "HIGH" THEN priority = "HIGH"',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.conditions).toEqual({
      operator: 'OR',
      negate: false,
      conditions: [
        {
          field: 'source',
          operator: '=',
          value: 'sec-edgar',
          negate: false,
        },
        {
          operator: 'AND',
          negate: false,
          conditions: [
            {
              field: 'ticker',
              operator: '=',
              value: 'AAPL',
              negate: false,
            },
            {
              field: 'severity',
              operator: '>=',
              value: 'HIGH',
              negate: false,
            },
          ],
        },
      ],
    });
  });

  it('parses IN lists', () => {
    const result = parseRule(
      'IF ticker IN ("AAPL", "TSLA") THEN priority = "HIGH"',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.conditions).toEqual({
      field: 'ticker',
      operator: 'IN',
      value: ['AAPL', 'TSLA'],
      negate: false,
    });
  });

  it('parses CONTAINS and MATCHES operators', () => {
    const containsRule = parseRule(
      'IF keyword CONTAINS "bankruptcy" THEN priority = "CRITICAL"',
    );
    const matchesRule = parseRule(
      'IF keyword MATCHES "acqui.*" THEN priority = "HIGH"',
    );

    expect(containsRule.ok).toBe(true);
    expect(matchesRule.ok).toBe(true);

    if (containsRule.ok) {
      expect(containsRule.value.conditions).toEqual({
        field: 'keyword',
        operator: 'CONTAINS',
        value: 'bankruptcy',
        negate: false,
      });
    }

    if (matchesRule.ok) {
      expect(matchesRule.value.conditions).toEqual({
        field: 'keyword',
        operator: 'MATCHES',
        value: 'acqui.*',
        negate: false,
      });
    }
  });

  it('parses NOT with grouped conditions', () => {
    const result = parseRule(
      'IF NOT (source = "reddit" OR source = "stocktwits") THEN priority = "MEDIUM"',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.conditions).toEqual({
      operator: 'OR',
      negate: true,
      conditions: [
        {
          field: 'source',
          operator: '=',
          value: 'reddit',
          negate: false,
        },
        {
          field: 'source',
          operator: '=',
          value: 'stocktwits',
          negate: false,
        },
      ],
    });
  });

  it('parses numeric confidence comparisons and multiple actions', () => {
    const result = parseRule(
      'IF confidence < 0.3 THEN tag = "low-quality", notify = false',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.conditions).toEqual({
      field: 'confidence',
      operator: '<',
      value: 0.3,
      negate: false,
    });
    expect(result.value.actions).toEqual({
      tag: 'low-quality',
      notify: false,
    });
  });

  it('accepts a custom parsed rule name', () => {
    const result = parseRule(
      'IF source = "sec-edgar" THEN priority = "HIGH"',
      'Custom name',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.name).toBe('Custom name');
  });

  it('returns a clear parse error for a missing THEN clause', () => {
    const result = parseRule('IF source = "sec-edgar" priority = "HIGH"');

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain('Expected THEN');
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBeGreaterThan(1);
    expect(result.error.expected).toBe('THEN');
  });

  it('returns a clear parse error for unexpected tokens', () => {
    const result = parseRule(
      'IF source = "sec-edgar" AND ) THEN priority = "HIGH"',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain('Unexpected token');
    expect(result.error.actual).toBe(')');
  });
});

describe('validateRule', () => {
  it('accepts a valid parsed rule', () => {
    const parsed = parseRule(
      'IF source = "sec-edgar" AND severity >= "HIGH" THEN priority = "CRITICAL", notify = true',
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const validation = validateRule(parsed.value);
    expect(validation.ok).toBe(true);
  });

  it('rejects invalid operator/value combinations', () => {
    const parsed = parseRule(
      'IF confidence IN ("HIGH", "LOW") THEN priority = "HIGH"',
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const validation = validateRule(parsed.value);
    expect(validation.ok).toBe(false);
    if (validation.ok) {
      return;
    }

    expect(validation.error[0]?.path).toBe('conditions.confidence');
    expect(validation.error[0]?.message).toContain('requires numeric comparison');
  });

  it('rejects invalid priority action values', () => {
    const parsed = parseRule(
      'IF source = "sec-edgar" THEN priority = "URGENT"',
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const validation = validateRule(parsed.value);
    expect(validation.ok).toBe(false);
    if (validation.ok) {
      return;
    }

    expect(validation.error[0]?.path).toBe('actions.priority');
    expect(validation.error[0]?.message).toContain('must be one of');
  });

  it('rejects invalid regex patterns in MATCHES conditions', () => {
    const parsed = parseRule(
      'IF keyword MATCHES "[" THEN priority = "HIGH"',
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const validation = validateRule(parsed.value);
    expect(validation.ok).toBe(false);
    if (validation.ok) {
      return;
    }

    expect(validation.error[0]?.path).toBe('conditions.keyword');
    expect(validation.error[0]?.message).toContain('valid regular expression');
  });

  it('rejects MATCHES patterns longer than 200 characters', () => {
    const parsed = parseRule(
      `IF keyword MATCHES "${'a'.repeat(201)}" THEN priority = "HIGH"`,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const validation = validateRule(parsed.value);
    expect(validation.ok).toBe(false);
    if (validation.ok) {
      return;
    }

    expect(validation.error[0]?.path).toBe('conditions.keyword');
    expect(validation.error[0]?.message).toContain('200 characters');
  });
});
