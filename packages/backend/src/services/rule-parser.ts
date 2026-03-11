import { randomUUID } from 'node:crypto';
import {
  err,
  ok,
  type ConditionGroup,
  type ConditionOperator,
  type ParsedCondition,
  type ParsedRule,
  type Priority,
  type Result,
  type RuleActionValue,
  type RuleConditionNode,
} from '@event-radar/shared';

interface Token {
  type:
    | 'identifier'
    | 'string'
    | 'number'
    | 'symbol'
    | 'keyword'
    | 'boolean'
    | 'eof';
  value: string;
  line: number;
  column: number;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  expected?: string;
  actual?: string;
}

export interface ValidationError {
  path: string;
  message: string;
}

const KEYWORDS = new Set([
  'IF',
  'THEN',
  'AND',
  'OR',
  'NOT',
  'IN',
  'CONTAINS',
  'MATCHES',
  'TRUE',
  'FALSE',
]);
const PRIORITIES = new Set<Priority>(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const MAX_MATCHES_PATTERN_LENGTH = 200;

export function parseRule(
  dsl: string,
  name = 'Parsed rule',
): Result<ParsedRule, ParseError> {
  const tokens = tokenize(dsl.trim());
  if (!tokens.ok) {
    return tokens;
  }

  try {
    return ok(new Parser(tokens.value, dsl.trim(), name).parse());
  } catch (error) {
    return err(error as ParseError);
  }
}

export function validateRule(
  rule: ParsedRule,
): Result<void, ValidationError[]> {
  const errors: ValidationError[] = [];
  validateCondition(rule.conditions, 'conditions', errors);
  validateActions(rule.actions, errors);

  return errors.length === 0 ? ok(undefined) : err(errors);
}

function validateCondition(
  node: RuleConditionNode,
  path: string,
  errors: ValidationError[],
): void {
  if ('field' in node) {
    const conditionPath = `${path}.${String(node.field)}`;
    const operator = String(node.operator);
    const value = node.value;

    switch (String(node.field)) {
      case 'source':
      case 'ticker':
      case 'event_type':
        validateStringCondition(conditionPath, operator, value, errors);
        return;
      case 'keyword':
        validateKeywordCondition(conditionPath, operator, value, errors);
        return;
      case 'severity':
        validateSeverityCondition(conditionPath, operator, value, errors);
        return;
      case 'confidence':
        validateConfidenceCondition(conditionPath, operator, value, errors);
        return;
      default:
        errors.push({
          path: conditionPath,
          message: `field "${String(node.field)}" is not supported`,
        });
        return;
    }
  }

  node.conditions.forEach((child, index) => {
    validateCondition(child, `${path}[${index}]`, errors);
  });
}

function validateStringCondition(
  path: string,
  operator: string,
  value: ParsedCondition['value'],
  errors: ValidationError[],
): void {
  const validOperators = new Set(['=', '!=', 'IN']);
  if (!validOperators.has(operator)) {
    errors.push({
      path,
      message: 'requires =, !=, or IN operator',
    });
    return;
  }

  if (operator === 'IN') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      errors.push({
        path,
        message: 'IN operator requires a string list',
      });
    }
    return;
  }

  if (typeof value !== 'string') {
    errors.push({
      path,
      message: 'requires a string value',
    });
  }
}

function validateKeywordCondition(
  path: string,
  operator: string,
  value: ParsedCondition['value'],
  errors: ValidationError[],
): void {
  if (operator !== 'CONTAINS' && operator !== 'MATCHES') {
    errors.push({
      path,
      message: 'keyword requires CONTAINS or MATCHES operator',
    });
  }

  if (typeof value !== 'string') {
    errors.push({
      path,
      message: 'keyword conditions require a string value',
    });
    return;
  }

  if (operator !== 'MATCHES') {
    return;
  }

  if (value.length > MAX_MATCHES_PATTERN_LENGTH) {
    errors.push({
      path,
      message: `MATCHES patterns must be ${MAX_MATCHES_PATTERN_LENGTH} characters or fewer`,
    });
  }

  try {
    new RegExp(value, 'i');
  } catch {
    errors.push({
      path,
      message: 'MATCHES pattern must be a valid regular expression',
    });
  }
}

function validateSeverityCondition(
  path: string,
  operator: string,
  value: ParsedCondition['value'],
  errors: ValidationError[],
): void {
  const validOperators = new Set(['=', '!=', '>', '>=', '<', '<=', 'IN']);
  if (!validOperators.has(operator)) {
    errors.push({
      path,
      message: 'severity requires comparison or IN operator',
    });
    return;
  }

  if (operator === 'IN') {
    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string' || !PRIORITIES.has(entry as Priority))
    ) {
      errors.push({
        path,
        message: 'severity IN requires LOW, MEDIUM, HIGH, or CRITICAL values',
      });
    }
    return;
  }

  if (typeof value !== 'string' || !PRIORITIES.has(value as Priority)) {
    errors.push({
      path,
      message: 'severity must be one of LOW, MEDIUM, HIGH, or CRITICAL',
    });
  }
}

function validateConfidenceCondition(
  path: string,
  operator: string,
  value: ParsedCondition['value'],
  errors: ValidationError[],
): void {
  const validOperators = new Set(['=', '!=', '>', '>=', '<', '<=']);
  if (!validOperators.has(operator) || typeof value !== 'number') {
    errors.push({
      path,
      message: 'confidence requires numeric comparison with =, !=, >, >=, <, or <=',
    });
    return;
  }

  if (value < 0 || value > 1) {
    errors.push({
      path,
      message: 'confidence must be between 0 and 1',
    });
  }
}

function validateActions(
  actions: Record<string, RuleActionValue>,
  errors: ValidationError[],
): void {
  for (const [key, value] of Object.entries(actions)) {
    const path = `actions.${key}`;

    if (key === 'priority') {
      if (typeof value !== 'string' || !PRIORITIES.has(value as Priority)) {
        errors.push({
          path,
          message: 'priority must be one of CRITICAL, HIGH, MEDIUM, or LOW',
        });
      }
      continue;
    }

    if (key === 'tag') {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push({
          path,
          message: 'tag must be a non-empty string',
        });
      }
      continue;
    }

    if (key === 'notify') {
      if (typeof value !== 'boolean') {
        errors.push({
          path,
          message: 'notify must be a boolean',
        });
      }
      continue;
    }

    errors.push({
      path,
      message: `unsupported action "${key}"`,
    });
  }
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly dsl: string,
    private readonly name: string,
  ) {}

  parse(): ParsedRule {
    this.expectKeyword('IF');
    const conditions = this.parseOrExpression();
    this.expectKeyword('THEN');
    const actions = this.parseActions();
    this.expectType('eof');

    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      name: this.name,
      dsl: this.dsl,
      conditions,
      actions,
      order: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  private parseOrExpression(): RuleConditionNode {
    let node = this.parseAndExpression();

    while (this.matchKeyword('OR')) {
      node = mergeConditionGroup('OR', node, this.parseAndExpression());
    }

    return node;
  }

  private parseAndExpression(): RuleConditionNode {
    let node = this.parseNotExpression();

    while (this.matchKeyword('AND')) {
      node = mergeConditionGroup('AND', node, this.parseNotExpression());
    }

    return node;
  }

  private parseNotExpression(): RuleConditionNode {
    if (this.matchKeyword('NOT')) {
      return toggleNegate(this.parseNotExpression());
    }

    return this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): RuleConditionNode {
    if (this.matchSymbol('(')) {
      const expression = this.parseOrExpression();
      this.expectSymbol(')');
      return expression;
    }

    return this.parseCondition();
  }

  private parseCondition(): ParsedCondition {
    const field = this.expectIdentifier();
    const operator = this.expectConditionOperator();
    const value = this.parseConditionValue(operator.value as ConditionOperator);

    return {
      field: field.value as ParsedCondition['field'],
      operator: operator.value as ConditionOperator,
      value,
      negate: false,
    };
  }

  private parseConditionValue(operator: ConditionOperator): ParsedCondition['value'] {
    if (operator === 'IN') {
      this.expectSymbol('(');
      const values: string[] = [];

      do {
        values.push(this.expectType('string').value);
      } while (this.matchSymbol(','));

      this.expectSymbol(')');
      return values;
    }

    const token = this.current();
    if (token.type === 'string') {
      this.index += 1;
      return token.value;
    }
    if (token.type === 'number') {
      this.index += 1;
      return Number(token.value);
    }

    throw makeParseError(
      `Unexpected token ${formatActual(token)} while parsing condition value`,
      token,
      'string or number',
    );
  }

  private parseActions(): Record<string, RuleActionValue> {
    const actions: Record<string, RuleActionValue> = {};

    do {
      const key = this.expectIdentifier().value;
      this.expectSymbol('=');
      actions[key] = this.parseActionValue();
    } while (this.matchSymbol(','));

    return actions;
  }

  private parseActionValue(): RuleActionValue {
    const token = this.current();
    if (token.type === 'string') {
      this.index += 1;
      return token.value;
    }
    if (token.type === 'boolean') {
      this.index += 1;
      return token.value.toLowerCase() === 'true';
    }

    throw makeParseError(
      `Unexpected token ${formatActual(token)} while parsing action value`,
      token,
      'string or boolean',
    );
  }

  private expectIdentifier(): Token {
    const token = this.current();
    if (token.type === 'identifier') {
      this.index += 1;
      return token;
    }

    throw makeParseError(
      token.type === 'symbol'
        ? `Unexpected token ${formatActual(token)}`
        : `Expected identifier but found ${formatActual(token)}`,
      token,
      'identifier',
    );
  }

  private expectConditionOperator(): Token {
    const token = this.current();
    const validOperators = new Set([
      '=',
      '!=',
      '>',
      '>=',
      '<',
      '<=',
      'IN',
      'CONTAINS',
      'MATCHES',
    ]);
    const normalized = token.value.toUpperCase();

    if (token.type === 'symbol' && validOperators.has(token.value)) {
      this.index += 1;
      return token;
    }

    if (token.type === 'keyword' && validOperators.has(normalized)) {
      this.index += 1;
      return {
        ...token,
        value: normalized,
      };
    }

    throw makeParseError(
      `Expected condition operator but found ${formatActual(token)}`,
      token,
      'condition operator',
    );
  }

  private expectKeyword(keyword: string): Token {
    const token = this.current();
    if (token.type === 'keyword' && token.value.toUpperCase() === keyword) {
      this.index += 1;
      return token;
    }

    throw makeParseError(
      `Expected ${keyword} but found ${formatActual(token)}`,
      token,
      keyword,
    );
  }

  private matchKeyword(keyword: string): boolean {
    const token = this.current();
    if (token.type === 'keyword' && token.value.toUpperCase() === keyword) {
      this.index += 1;
      return true;
    }

    return false;
  }

  private expectSymbol(symbol: string): Token {
    const token = this.current();
    if (token.type === 'symbol' && token.value === symbol) {
      this.index += 1;
      return token;
    }

    throw makeParseError(
      `Expected ${symbol} but found ${formatActual(token)}`,
      token,
      symbol,
    );
  }

  private matchSymbol(symbol: string): boolean {
    const token = this.current();
    if (token.type === 'symbol' && token.value === symbol) {
      this.index += 1;
      return true;
    }

    return false;
  }

  private expectType(type: Token['type']): Token {
    const token = this.current();
    if (token.type === type) {
      this.index += 1;
      return token;
    }

    throw makeParseError(
      `Expected ${type} but found ${formatActual(token)}`,
      token,
      type,
    );
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }
}

function mergeConditionGroup(
  operator: ConditionGroup['operator'],
  left: RuleConditionNode,
  right: RuleConditionNode,
): ConditionGroup {
  const conditions: RuleConditionNode[] = [];

  if (isConditionGroup(left) && left.operator === operator && left.negate === false) {
    conditions.push(...left.conditions);
  } else {
    conditions.push(left);
  }

  if (isConditionGroup(right) && right.operator === operator && right.negate === false) {
    conditions.push(...right.conditions);
  } else {
    conditions.push(right);
  }

  return {
    operator,
    conditions,
    negate: false,
  };
}

function toggleNegate(node: RuleConditionNode): RuleConditionNode {
  return {
    ...node,
    negate: !node.negate,
  };
}

function isConditionGroup(node: RuleConditionNode): node is ConditionGroup {
  return !('field' in node);
}

function tokenize(input: string): Result<Token[], ParseError> {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  while (index < input.length) {
    const char = input[index]!;

    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1;
      column += 1;
      continue;
    }

    if (char === '\n') {
      index += 1;
      line += 1;
      column = 1;
      continue;
    }

    if (char === '(' || char === ')' || char === ',' || char === '=') {
      tokens.push({
        type: 'symbol',
        value: char,
        line,
        column,
      });
      index += 1;
      column += 1;
      continue;
    }

    if (char === '!' || char === '>' || char === '<') {
      const next = input[index + 1];
      const value = next === '=' ? `${char}=` : char;
      tokens.push({
        type: 'symbol',
        value,
        line,
        column,
      });
      index += value.length;
      column += value.length;
      continue;
    }

    if (char === '"') {
      const startColumn = column;
      let value = '';
      index += 1;
      column += 1;

      while (index < input.length) {
        const current = input[index]!;

        if (current === '\\') {
          const escaped = input[index + 1];
          if (escaped === undefined) {
            return err({
              message: 'Unterminated string literal',
              line,
              column: startColumn,
              actual: 'EOF',
            });
          }
          value += escaped;
          index += 2;
          column += 2;
          continue;
        }

        if (current === '"') {
          break;
        }

        value += current;
        index += 1;
        column += 1;
      }

      if (input[index] !== '"') {
        return err({
          message: 'Unterminated string literal',
          line,
          column: startColumn,
          actual: 'EOF',
        });
      }

      tokens.push({
        type: 'string',
        value,
        line,
        column: startColumn,
      });
      index += 1;
      column += 1;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = index;
      const startColumn = column;
      while (index < input.length && /[0-9.]/.test(input[index]!)) {
        index += 1;
        column += 1;
      }
      tokens.push({
        type: 'number',
        value: input.slice(start, index),
        line,
        column: startColumn,
      });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      const startColumn = column;
      while (index < input.length && /[A-Za-z0-9_-]/.test(input[index]!)) {
        index += 1;
        column += 1;
      }

      const value = input.slice(start, index);
      const upper = value.toUpperCase();
      const type =
        upper === 'TRUE' || upper === 'FALSE'
          ? 'boolean'
          : KEYWORDS.has(upper)
            ? 'keyword'
            : 'identifier';

      tokens.push({
        type,
        value,
        line,
        column: startColumn,
      });
      continue;
    }

    return err({
      message: `Unexpected character "${char}"`,
      line,
      column,
      actual: char,
    });
  }

  tokens.push({
    type: 'eof',
    value: 'EOF',
    line,
    column,
  });

  return ok(tokens);
}

function makeParseError(
  message: string,
  token: Pick<Token, 'line' | 'column' | 'value'>,
  expected?: string,
): ParseError {
  return {
    message,
    line: token.line,
    column: token.column,
    expected,
    actual: token.value,
  };
}

function formatActual(token: Token): string {
  return token.type === 'eof' ? 'EOF' : `"${token.value}"`;
}
