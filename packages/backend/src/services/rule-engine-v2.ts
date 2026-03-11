import { asc, eq } from 'drizzle-orm';
import type {
  ConditionGroup,
  ParsedCondition,
  ParsedRule,
  Priority,
  RuleConditionNode,
  RuleResult,
} from '@event-radar/shared';
import { alertRules } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { parseRule, validateRule } from './rule-parser.js';

const SEVERITY_ORDER: Record<Priority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const DEFAULT_RULE_ACTIONS: RuleResult['actions'] = {
  priority: 'MEDIUM',
};

interface RuleCreateInput {
  name: string;
  dsl: string;
  enabled?: boolean;
}

interface RuleUpdateInput {
  name?: string;
  dsl?: string;
  enabled?: boolean;
}

export class RuleEngineV2 {
  constructor(private readonly db?: Database) {}

  async evaluateRules(
    event: Record<string, unknown>,
    rules?: ParsedRule[],
  ): Promise<RuleResult> {
    const resolvedRules = (rules ?? (this.db ? await this.listRules() : []))
      .filter((rule) => rule.enabled)
      .sort((left, right) => left.order - right.order);

    for (const rule of resolvedRules) {
      if (this.matchesCondition(rule.conditions, event)) {
        return {
          matched: true,
          ruleId: rule.id,
          ruleName: rule.name,
          actions: rule.actions,
        };
      }
    }

    return {
      matched: false,
      ruleId: null,
      ruleName: null,
      actions: { ...DEFAULT_RULE_ACTIONS },
    };
  }

  async addRule(input: RuleCreateInput): Promise<ParsedRule> {
    const nextOrder = this.db ? await this.getNextOrder() : 0;
    const parsed = this.parseAndValidate(input.dsl, {
      name: input.name,
      order: nextOrder,
      enabled: input.enabled ?? true,
    });

    if (!this.db) {
      return parsed;
    }

    const [row] = await this.db
      .insert(alertRules)
      .values({
        id: parsed.id,
        name: parsed.name,
        dsl: parsed.dsl,
        conditionsAst: parsed.conditions,
        actions: parsed.actions,
        ruleOrder: parsed.order,
        enabled: parsed.enabled,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      })
      .returning();

    return this.mapRow(row);
  }

  async updateRule(id: string, input: RuleUpdateInput): Promise<ParsedRule> {
    if (!this.db) {
      throw new Error('Database is required to update rules');
    }

    const existing = await this.getRuleById(id);
    if (!existing) {
      throw new Error(`Rule ${id} not found`);
    }

    const parsed = this.parseAndValidate(input.dsl ?? existing.dsl, {
      id: existing.id,
      name: input.name ?? existing.name,
      order: existing.order,
      enabled: input.enabled ?? existing.enabled,
      createdAt: existing.createdAt,
    });

    const [row] = await this.db
      .update(alertRules)
      .set({
        name: parsed.name,
        dsl: parsed.dsl,
        conditionsAst: parsed.conditions,
        actions: parsed.actions,
        enabled: parsed.enabled,
        updatedAt: new Date(parsed.updatedAt),
      })
      .where(eq(alertRules.id, id))
      .returning();

    return this.mapRow(row);
  }

  async deleteRule(id: string): Promise<void> {
    if (!this.db) {
      return;
    }

    await this.db.delete(alertRules).where(eq(alertRules.id, id));
  }

  async listRules(): Promise<ParsedRule[]> {
    if (!this.db) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(alertRules)
      .orderBy(asc(alertRules.ruleOrder));

    return rows.map((row) => this.mapRow(row));
  }

  async reorderRules(ids: string[]): Promise<void> {
    if (!this.db || ids.length === 0) {
      return;
    }

    await this.db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(alertRules)
          .set({
            ruleOrder: index,
            updatedAt: new Date(),
          })
          .where(eq(alertRules.id, id));
      }
    });
  }

  async getRuleById(id: string): Promise<ParsedRule | null> {
    if (!this.db) {
      return null;
    }

    const [row] = await this.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  private async getNextOrder(): Promise<number> {
    const existing = await this.listRules();
    return existing.length;
  }

  private parseAndValidate(
    dsl: string,
    overrides: Partial<ParsedRule> = {},
  ): ParsedRule {
    const parsed = parseRule(dsl);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }

    const now = new Date().toISOString();
    const rule: ParsedRule = {
      ...parsed.value,
      ...overrides,
      dsl,
      updatedAt: now,
    };

    const validation = validateRule(rule);
    if (!validation.ok) {
      throw new Error(validation.error.map((issue) => issue.message).join('; '));
    }

    return rule;
  }

  private matchesCondition(
    node: RuleConditionNode,
    event: Record<string, unknown>,
  ): boolean {
    const result = 'field' in node
      ? this.matchesLeaf(node, event)
      : this.matchesGroup(node, event);

    return node.negate ? !result : result;
  }

  private matchesGroup(
    node: ConditionGroup,
    event: Record<string, unknown>,
  ): boolean {
    if (node.operator === 'AND') {
      return node.conditions.every((condition) => this.matchesCondition(condition, event));
    }

    return node.conditions.some((condition) => this.matchesCondition(condition, event));
  }

  private matchesLeaf(
    node: ParsedCondition,
    event: Record<string, unknown>,
  ): boolean {
    const actual = this.extractFieldValue(node.field, event);

    switch (node.operator) {
      case '=':
        return !Array.isArray(node.value) &&
          compareEquality(actual, node.value, node.field);
      case '!=':
        return !Array.isArray(node.value) &&
          !compareEquality(actual, node.value, node.field);
      case 'IN':
        return Array.isArray(node.value)
          ? node.value.some((entry) => compareEquality(actual, entry, node.field))
          : false;
      case 'CONTAINS':
        return typeof actual === 'string' &&
          typeof node.value === 'string' &&
          actual.toLowerCase().includes(node.value.toLowerCase());
      case 'MATCHES':
        return typeof actual === 'string' &&
          typeof node.value === 'string' &&
          new RegExp(node.value, 'i').test(actual);
      case '>':
      case '>=':
      case '<':
      case '<=':
        return !Array.isArray(node.value) &&
          compareOrdered(actual, node.value, node.operator, node.field);
    }
  }

  private extractFieldValue(
    field: ParsedCondition['field'],
    event: Record<string, unknown>,
  ): string | number | undefined {
    switch (field) {
      case 'source':
        return asString(event.source);
      case 'ticker':
        return asString(event.ticker) ?? readMetadataValue(event, 'ticker');
      case 'keyword':
        return (
          asString(event.keyword) ??
          [asString(event.title), asString(event.body)]
            .filter((value): value is string => Boolean(value))
            .join(' ')
        );
      case 'event_type':
        return asString(event.event_type) ?? asString(event.type);
      case 'severity':
        return asString(event.severity);
      case 'confidence':
        return asNumber(event.confidence);
    }
  }

  private mapRow(row: typeof alertRules.$inferSelect): ParsedRule {
    return {
      id: row.id,
      name: row.name,
      dsl: row.dsl,
      conditions: row.conditionsAst,
      actions: row.actions,
      order: row.ruleOrder,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function compareEquality(
  actual: string | number | undefined,
  expected: string | number,
  field: ParsedCondition['field'],
): boolean {
  if (typeof actual === 'number' || typeof expected === 'number') {
    return Number(actual) === Number(expected);
  }

  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return false;
  }

  return normalizeString(actual, field) === normalizeString(expected, field);
}

function compareOrdered(
  actual: string | number | undefined,
  expected: string | number,
  operator: '>' | '>=' | '<' | '<=',
  field: ParsedCondition['field'],
): boolean {
  if (field === 'severity') {
    const actualValue = typeof actual === 'string' ? SEVERITY_ORDER[actual.toUpperCase() as Priority] : undefined;
    const expectedValue = typeof expected === 'string' ? SEVERITY_ORDER[expected.toUpperCase() as Priority] : undefined;

    if (actualValue == null || expectedValue == null) {
      return false;
    }

    switch (operator) {
      case '>':
        return actualValue > expectedValue;
      case '>=':
        return actualValue >= expectedValue;
      case '<':
        return actualValue < expectedValue;
      case '<=':
        return actualValue <= expectedValue;
    }
  }

  if (typeof actual !== 'number' || typeof expected !== 'number') {
    return false;
  }

  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
  }
}

function normalizeString(
  value: string,
  field: ParsedCondition['field'],
): string {
  if (field === 'ticker' || field === 'severity') {
    return value.toUpperCase();
  }

  return value;
}

function readMetadataValue(
  event: Record<string, unknown>,
  key: string,
): string | undefined {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
