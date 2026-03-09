import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from '../pipeline/rule-engine.js';
import { DEFAULT_RULES } from '../pipeline/default-rules.js';
import type { RawEvent, Rule } from '@event-radar/shared';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test filing',
    body: 'Test body',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { item_types: [] },
    ...overrides,
  };
}

function makeSecEvent(itemTypes: string[], ticker?: string): RawEvent {
  return makeEvent({
    source: 'sec-edgar',
    type: '8-K',
    metadata: {
      item_types: itemTypes,
      ...(ticker ? { ticker } : {}),
    },
  });
}

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('basic matching', () => {
    it('should return default MEDIUM severity when no rules loaded', () => {
      const result = engine.classify(makeEvent());
      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toEqual([]);
      expect(result.matchedRules).toEqual([]);
    });

    it('should return default MEDIUM severity when no rules match', () => {
      engine.loadRules([
        {
          id: 'test-rule',
          name: 'Only matches source X',
          conditions: [{ type: 'sourceEquals', value: 'unknown-source' }],
          actions: [{ type: 'setSeverity', value: 'CRITICAL' }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.severity).toBe('MEDIUM');
      expect(result.matchedRules).toEqual([]);
    });

    it('should match sourceEquals condition', () => {
      engine.loadRules([
        {
          id: 'source-match',
          name: 'Match SEC source',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setSeverity', value: 'HIGH' }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.severity).toBe('HIGH');
      expect(result.matchedRules).toEqual(['source-match']);
    });

    it('should match itemTypeContains condition', () => {
      engine.loadRules([
        {
          id: 'item-match',
          name: 'Match 1.03 Bankruptcy',
          conditions: [
            { type: 'sourceEquals', value: 'sec-edgar' },
            { type: 'itemTypeContains', value: '1.03' },
          ],
          actions: [{ type: 'setSeverity', value: 'CRITICAL' }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeSecEvent(['1.03']));
      expect(result.severity).toBe('CRITICAL');
    });

    it('should match titleContains condition (case insensitive)', () => {
      engine.loadRules([
        {
          id: 'title-match',
          name: 'Match bankruptcy keyword',
          conditions: [{ type: 'titleContains', value: 'bankruptcy' }],
          actions: [
            { type: 'setSeverity', value: 'CRITICAL' },
            { type: 'addTags', values: ['bankruptcy'] },
          ],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(
        makeEvent({ title: 'XYZ Corp files for BANKRUPTCY protection' }),
      );
      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('bankruptcy');
    });

    it('should match tickerInList condition', () => {
      engine.loadRules([
        {
          id: 'ticker-match',
          name: 'Watchlist ticker',
          conditions: [{ type: 'tickerInList', values: ['AAPL', 'TSLA'] }],
          actions: [{ type: 'addTags', values: ['watchlist'] }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(
        makeEvent({ metadata: { ticker: 'TSLA' } }),
      );
      expect(result.tags).toContain('watchlist');
      expect(result.matchedRules).toEqual(['ticker-match']);
    });

    it('should not match tickerInList when ticker not in list', () => {
      engine.loadRules([
        {
          id: 'ticker-match',
          name: 'Watchlist ticker',
          conditions: [{ type: 'tickerInList', values: ['AAPL', 'TSLA'] }],
          actions: [{ type: 'addTags', values: ['watchlist'] }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(
        makeEvent({ metadata: { ticker: 'MSFT' } }),
      );
      expect(result.tags).not.toContain('watchlist');
      expect(result.matchedRules).toEqual([]);
    });

    it('should not match tickerInList when no ticker in metadata', () => {
      engine.loadRules([
        {
          id: 'ticker-match',
          name: 'Watchlist ticker',
          conditions: [{ type: 'tickerInList', values: ['AAPL'] }],
          actions: [{ type: 'addTags', values: ['watchlist'] }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ metadata: {} }));
      expect(result.matchedRules).toEqual([]);
    });
  });

  describe('all conditions must match (AND logic)', () => {
    it('should not match when only some conditions are met', () => {
      engine.loadRules([
        {
          id: 'multi-condition',
          name: 'SEC + specific item',
          conditions: [
            { type: 'sourceEquals', value: 'sec-edgar' },
            { type: 'itemTypeContains', value: '1.03' },
          ],
          actions: [{ type: 'setSeverity', value: 'CRITICAL' }],
          priority: 10,
          enabled: true,
        },
      ]);

      // Source matches but item type doesn't
      const result = engine.classify(makeSecEvent(['2.02']));
      expect(result.severity).toBe('MEDIUM');
      expect(result.matchedRules).toEqual([]);
    });
  });

  describe('severity priority (highest wins)', () => {
    it('should pick the highest severity across multiple matching rules', () => {
      engine.loadRules([
        {
          id: 'low-rule',
          name: 'Low severity rule',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setSeverity', value: 'LOW' }],
          priority: 50,
          enabled: true,
        },
        {
          id: 'critical-rule',
          name: 'Critical severity rule',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setSeverity', value: 'CRITICAL' }],
          priority: 10,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.severity).toBe('CRITICAL');
      expect(result.matchedRules).toContain('low-rule');
      expect(result.matchedRules).toContain('critical-rule');
    });

    it('should not downgrade severity when a lower-severity rule matches after a higher one', () => {
      engine.loadRules([
        {
          id: 'high-rule',
          name: 'High rule',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setSeverity', value: 'HIGH' }],
          priority: 10,
          enabled: true,
        },
        {
          id: 'medium-rule',
          name: 'Medium rule',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setSeverity', value: 'MEDIUM' }],
          priority: 20,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.severity).toBe('HIGH');
    });
  });

  describe('multi-rule combinations', () => {
    it('should accumulate tags from multiple matching rules', () => {
      engine.loadRules([
        {
          id: 'rule-a',
          name: 'Tag A',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'addTags', values: ['sec', '8-K'] }],
          priority: 10,
          enabled: true,
        },
        {
          id: 'rule-b',
          name: 'Tag B',
          conditions: [
            { type: 'sourceEquals', value: 'sec-edgar' },
            { type: 'itemTypeContains', value: '1.03' },
          ],
          actions: [{ type: 'addTags', values: ['bankruptcy'] }],
          priority: 20,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeSecEvent(['1.03']));
      expect(result.tags).toEqual(['sec', '8-K', 'bankruptcy']);
      expect(result.matchedRules).toEqual(['rule-a', 'rule-b']);
    });

    it('should not duplicate tags', () => {
      engine.loadRules([
        {
          id: 'rule-a',
          name: 'Tag A',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'addTags', values: ['8-K'] }],
          priority: 10,
          enabled: true,
        },
        {
          id: 'rule-b',
          name: 'Tag B',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'addTags', values: ['8-K', 'extra'] }],
          priority: 20,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.tags).toEqual(['8-K', 'extra']);
    });

    it('should use lowest priority value from setPriority across matched rules', () => {
      engine.loadRules([
        {
          id: 'rule-a',
          name: 'Priority 30',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setPriority', value: 30 }],
          priority: 10,
          enabled: true,
        },
        {
          id: 'rule-b',
          name: 'Priority 10',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setPriority', value: 10 }],
          priority: 20,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.priority).toBe(10);
    });

    it('should combine severity, tags, and priority from multiple rules', () => {
      engine.loadRules([
        {
          id: 'severity-rule',
          name: 'Set severity',
          conditions: [{ type: 'itemTypeContains', value: '1.03' }],
          actions: [{ type: 'setSeverity', value: 'CRITICAL' }],
          priority: 10,
          enabled: true,
        },
        {
          id: 'tag-rule',
          name: 'Add tags',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [
            { type: 'addTags', values: ['urgent'] },
            { type: 'setPriority', value: 5 },
          ],
          priority: 20,
          enabled: true,
        },
      ]);

      const result = engine.classify(makeSecEvent(['1.03']));
      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('urgent');
      expect(result.priority).toBe(5);
      expect(result.matchedRules).toEqual(['severity-rule', 'tag-rule']);
    });
  });

  describe('disabled rules', () => {
    it('should skip disabled rules', () => {
      engine.loadRules([
        {
          id: 'disabled-rule',
          name: 'Disabled',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'setSeverity', value: 'CRITICAL' }],
          priority: 10,
          enabled: false,
        },
      ]);

      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));
      expect(result.severity).toBe('MEDIUM');
      expect(result.matchedRules).toEqual([]);
    });
  });

  describe('rule priority ordering', () => {
    it('should process rules in priority order (lower number first)', () => {
      const rules: Rule[] = [
        {
          id: 'rule-high-prio',
          name: 'High priority (50)',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'addTags', values: ['second'] }],
          priority: 50,
          enabled: true,
        },
        {
          id: 'rule-low-prio',
          name: 'Low priority (10)',
          conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
          actions: [{ type: 'addTags', values: ['first'] }],
          priority: 10,
          enabled: true,
        },
      ];

      engine.loadRules(rules);
      const result = engine.classify(makeEvent({ source: 'sec-edgar' }));

      // Tags should be added in priority order: 'first' (priority 10) before 'second' (priority 50)
      expect(result.tags).toEqual(['first', 'second']);
      expect(result.matchedRules).toEqual(['rule-low-prio', 'rule-high-prio']);
    });
  });

  describe('default rules (8-K item mapping)', () => {
    beforeEach(() => {
      engine.loadRules(DEFAULT_RULES);
    });

    it('should classify 1.03 (Bankruptcy) as CRITICAL', () => {
      const result = engine.classify(makeSecEvent(['1.03']));
      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('bankruptcy');
    });

    it('should classify 1.02 (Material Agreement Termination) as CRITICAL', () => {
      const result = engine.classify(makeSecEvent(['1.02']));
      expect(result.severity).toBe('CRITICAL');
    });

    it('should classify 5.02 (CEO Change) as HIGH', () => {
      const result = engine.classify(makeSecEvent(['5.02']));
      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('leadership-change');
    });

    it('should classify 2.01 (Acquisition) as HIGH', () => {
      const result = engine.classify(makeSecEvent(['2.01']));
      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('acquisition');
    });

    it('should classify 1.01 (Material Agreement) as HIGH', () => {
      const result = engine.classify(makeSecEvent(['1.01']));
      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('material-agreement');
    });

    it('should classify 7.01 (Reg FD) as LOW', () => {
      const result = engine.classify(makeSecEvent(['7.01']));
      expect(result.severity).toBe('LOW');
      expect(result.tags).toContain('reg-fd');
    });

    it('should classify 2.02 (Earnings) as MEDIUM', () => {
      const result = engine.classify(makeSecEvent(['2.02']));
      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('earnings');
    });

    it('should pick highest severity for multi-item filing', () => {
      // 9.01=LOW, 1.03=CRITICAL → CRITICAL wins
      const result = engine.classify(makeSecEvent(['9.01', '1.03']));
      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('bankruptcy');
      expect(result.tags).toContain('exhibits');
    });

    it('should return MEDIUM for unknown item types from sec-edgar', () => {
      const result = engine.classify(makeSecEvent(['99.99']));
      expect(result.severity).toBe('MEDIUM');
    });

    it('should not match default rules for non-SEC sources', () => {
      const event = makeEvent({
        source: 'truth-social',
        metadata: { item_types: ['1.03'] },
      });
      const result = engine.classify(event);
      expect(result.severity).toBe('MEDIUM');
      expect(result.matchedRules).toEqual([]);
    });
  });
});
