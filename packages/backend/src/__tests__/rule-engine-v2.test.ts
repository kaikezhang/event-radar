import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '../db/connection.js';
import { RuleEngineV2 } from '../services/rule-engine-v2.js';
import { parseRule } from '../services/rule-parser.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
} from './helpers/test-db.js';

function makeEvent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source: 'sec-edgar',
    ticker: 'AAPL',
    keyword: 'bankruptcy filing and restructuring',
    event_type: 'filing',
    severity: 'HIGH',
    confidence: 0.9,
    ...overrides,
  };
}

function parseStoredRule(
  dsl: string,
  overrides: Partial<{
    name: string;
    order: number;
    enabled: boolean;
  }> = {},
) {
  const parsed = parseRule(dsl);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error('expected parsed rule');
  }

  return {
    ...parsed.value,
    name: overrides.name ?? parsed.value.name,
    order: overrides.order ?? parsed.value.order,
    enabled: overrides.enabled ?? parsed.value.enabled,
  };
}

describe('RuleEngineV2 evaluation', () => {
  it('uses first-match-wins after sorting by order', async () => {
    const engine = new RuleEngineV2();
    const lowOrderRule = parseStoredRule(
      'IF source = "sec-edgar" THEN priority = "HIGH"',
      { name: 'Low order', order: 1 },
    );
    const highOrderRule = parseStoredRule(
      'IF source = "sec-edgar" THEN priority = "CRITICAL"',
      { name: 'High order', order: 10 },
    );

    const result = await engine.evaluateRules(makeEvent(), [
      highOrderRule,
      lowOrderRule,
    ]);

    expect(result).toEqual({
      matched: true,
      ruleId: lowOrderRule.id,
      ruleName: 'Low order',
      actions: { priority: 'HIGH' },
    });
  });

  it('matches severity comparisons using ordered severity values', async () => {
    const engine = new RuleEngineV2();
    const rule = parseStoredRule(
      'IF severity >= "HIGH" THEN priority = "CRITICAL"',
      { name: 'Severity rule', order: 1 },
    );

    const result = await engine.evaluateRules(
      makeEvent({ severity: 'CRITICAL' }),
      [rule],
    );

    expect(result.matched).toBe(true);
    expect(result.ruleId).toBe(rule.id);
  });

  it('returns the default priority when no rules match', async () => {
    const engine = new RuleEngineV2();
    const rule = parseStoredRule(
      'IF source = "reddit" THEN priority = "LOW"',
      { name: 'No match', order: 1 },
    );

    const result = await engine.evaluateRules(makeEvent(), [rule]);

    expect(result).toEqual({
      matched: false,
      ruleId: null,
      ruleName: null,
      actions: { priority: 'MEDIUM' },
    });
  });

  it('supports CONTAINS and MATCHES conditions at evaluation time', async () => {
    const engine = new RuleEngineV2();
    const containsRule = parseStoredRule(
      'IF keyword CONTAINS "bankruptcy" THEN priority = "CRITICAL"',
      { name: 'Contains', order: 1 },
    );
    const matchesRule = parseStoredRule(
      'IF keyword MATCHES "restructur.*" THEN priority = "HIGH"',
      { name: 'Matches', order: 2 },
    );

    const result = await engine.evaluateRules(makeEvent(), [
      containsRule,
      matchesRule,
    ]);

    expect(result.ruleId).toBe(containsRule.id);
    expect(result.actions.priority).toBe('CRITICAL');
  });
});

describe('RuleEngineV2 CRUD', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('adds and lists rules in order', async () => {
    const engine = new RuleEngineV2(db);

    const first = await engine.addRule({
      name: 'First rule',
      dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
    });
    const second = await engine.addRule({
      name: 'Second rule',
      dsl: 'IF keyword CONTAINS "bankruptcy" THEN priority = "CRITICAL"',
    });

    const rules = await engine.listRules();

    expect(rules).toHaveLength(2);
    expect(rules.map((rule) => rule.id)).toEqual([first.id, second.id]);
    expect(rules.map((rule) => rule.order)).toEqual([0, 1]);
  });

  it('updates an existing rule', async () => {
    const engine = new RuleEngineV2(db);
    const created = await engine.addRule({
      name: 'Original',
      dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
    });

    const updated = await engine.updateRule(created.id, {
      name: 'Updated',
      dsl: 'IF ticker = "TSLA" THEN priority = "CRITICAL", notify = true',
      enabled: false,
    });

    expect(updated.name).toBe('Updated');
    expect(updated.enabled).toBe(false);
    expect(updated.actions).toEqual({
      priority: 'CRITICAL',
      notify: true,
    });
  });

  it('deletes a rule', async () => {
    const engine = new RuleEngineV2(db);
    const created = await engine.addRule({
      name: 'Delete me',
      dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
    });

    await engine.deleteRule(created.id);

    const rules = await engine.listRules();
    expect(rules).toEqual([]);
  });

  it('reorders rules', async () => {
    const engine = new RuleEngineV2(db);
    const first = await engine.addRule({
      name: 'First',
      dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
    });
    const second = await engine.addRule({
      name: 'Second',
      dsl: 'IF ticker = "AAPL" THEN priority = "CRITICAL"',
    });

    await engine.reorderRules([second.id, first.id]);

    const rules = await engine.listRules();
    expect(rules.map((rule) => rule.id)).toEqual([second.id, first.id]);
    expect(rules.map((rule) => rule.order)).toEqual([0, 1]);
  });
});
