import { z } from 'zod';

export const ConditionOperatorSchema = z.enum([
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
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export const LogicalOperatorSchema = z.enum(['AND', 'OR']);
export type LogicalOperator = z.infer<typeof LogicalOperatorSchema>;

export const RuleFieldSchema = z.enum([
  'source',
  'ticker',
  'keyword',
  'event_type',
  'severity',
  'confidence',
]);
export type RuleField = z.infer<typeof RuleFieldSchema>;

export const PrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Priority = z.infer<typeof PrioritySchema>;

export const RuleActionKeySchema = z.enum(['priority', 'tag', 'notify']);
export type RuleActionKey = z.infer<typeof RuleActionKeySchema>;

export const RuleActionValueSchema = z.union([z.string(), z.boolean()]);
export type RuleActionValue = z.infer<typeof RuleActionValueSchema>;

export const ParsedConditionSchema = z.object({
  field: RuleFieldSchema,
  operator: ConditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.array(z.string())]),
  negate: z.boolean(),
});
export type ParsedCondition = z.infer<typeof ParsedConditionSchema>;

export const RuleConditionNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([ParsedConditionSchema, ConditionGroupSchema]),
);

export const ConditionGroupSchema = z.object({
  operator: LogicalOperatorSchema,
  conditions: z.array(RuleConditionNodeSchema).min(2),
  negate: z.boolean(),
});
export type ConditionGroup = z.infer<typeof ConditionGroupSchema>;

export type RuleConditionNode = ParsedCondition | ConditionGroup;
export const RuleLogicalNodeSchema = ConditionGroupSchema;
export const RuleNotNodeSchema = ConditionGroupSchema;
export const RuleExpressionSchema = RuleConditionNodeSchema;
export type RuleLogicalNode = ConditionGroup;
export type RuleNotNode = ConditionGroup;
export type RuleExpression = RuleConditionNode;

export const RuleActionsSchema = z.record(z.string(), RuleActionValueSchema);
export type RuleActions = z.infer<typeof RuleActionsSchema>;

export const ParsedRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dsl: z.string(),
  conditions: RuleConditionNodeSchema,
  actions: RuleActionsSchema,
  order: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ParsedRule = z.infer<typeof ParsedRuleSchema>;

export const RuleResultSchema = z.object({
  matched: z.boolean(),
  ruleId: z.string().nullable(),
  ruleName: z.string().nullable(),
  actions: z.record(z.string(), RuleActionValueSchema),
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const ParseErrorSchema = z.object({
  message: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  expected: z.string().optional(),
  actual: z.string().optional(),
});
export type ParseError = z.infer<typeof ParseErrorSchema>;

export const ValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const RuleInputSchema = z.object({
  name: z.string().min(1),
  dsl: z.string().min(1),
  enabled: z.boolean().optional(),
});
export type RuleInput = z.infer<typeof RuleInputSchema>;

export const RuleTestRequestSchema = z.object({
  dsl: z.string().min(1),
  event: z.record(z.string(), z.unknown()),
});
export type RuleTestRequest = z.infer<typeof RuleTestRequestSchema>;
