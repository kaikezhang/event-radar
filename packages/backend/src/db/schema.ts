import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  serial,
  integer,
  decimal,
  date,
  index,
  primaryKey,
  boolean,
} from 'drizzle-orm/pg-core';
import type { BudgetConfig, Priority, RuleActionValue, RuleConditionNode } from '@event-radar/shared';

/**
 * Pipeline audit trail — records every event's journey through the pipeline.
 * Enables per-event debugging: "why was this delivered?" / "where was this blocked?"
 */
export const pipelineAudit = pgTable('pipeline_audit', {
  id: serial('id').primaryKey(),
  eventId: varchar('event_id', { length: 100 }).notNull(),
  source: varchar('source', { length: 100 }).notNull(),
  title: text('title').notNull(),
  severity: varchar('severity', { length: 20 }),
  ticker: varchar('ticker', { length: 20 }),
  /** Final outcome: delivered | filtered | deduped | grace_period | error */
  outcome: varchar('outcome', { length: 30 }).notNull(),
  /** Pipeline stage where event stopped (or 'delivery' if it went all the way) */
  stoppedAt: varchar('stopped_at', { length: 30 }).notNull(),
  /** Human-readable reason for the outcome */
  reason: text('reason'),
  /** Filter reason category (for filtered events) */
  reasonCategory: varchar('reason_category', { length: 30 }),
  /** Delivery channels attempted (for delivered events) */
  deliveryChannels: jsonb('delivery_channels'),
  /** Historical enrichment result */
  historicalMatch: boolean('historical_match'),
  historicalConfidence: varchar('historical_confidence', { length: 20 }),
  /** Processing duration in ms */
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_pipeline_audit_created_at').on(table.createdAt),
  index('idx_pipeline_audit_source').on(table.source),
  index('idx_pipeline_audit_outcome').on(table.outcome),
  index('idx_pipeline_audit_ticker').on(table.ticker),
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: varchar('source', { length: 100 }).notNull(),
  sourceEventId: varchar('source_event_id', { length: 255 }),
  title: text('title').notNull(),
  summary: text('summary'),
  rawPayload: jsonb('raw_payload'),
  metadata: jsonb('metadata'),
  severity: varchar('severity', { length: 20 }),
  receivedAt: timestamp('received_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Dedup fields
  mergedFrom: text('merged_from').array(),
  sourceUrls: jsonb('source_urls'),
  isDuplicate: boolean('is_duplicate').default(false),
  // Multi-source confirmation fields
  confirmedSources: jsonb('confirmed_sources').$type<string[]>(),
  confirmationCount: integer('confirmation_count').default(1),
});

export const priceCache = pgTable(
  'price_cache',
  {
    ticker: varchar('ticker', { length: 10 }).notNull(),
    date: date('date').notNull(),
    closePrice: decimal('close_price', { precision: 10, scale: 2 }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ticker, table.date] })],
);

export const eventOutcomes = pgTable(
  'event_outcomes',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' })
      .unique(),
    ticker: varchar('ticker', { length: 10 }).notNull(),
    eventTime: timestamp('event_time', { withTimezone: true }).notNull(),
    eventPrice: decimal('event_price', { precision: 10, scale: 2 }),
    price1h: decimal('price_1h', { precision: 10, scale: 2 }),
    price1d: decimal('price_1d', { precision: 10, scale: 2 }),
    price1w: decimal('price_1w', { precision: 10, scale: 2 }),
    price1m: decimal('price_1m', { precision: 10, scale: 2 }),
    change1h: decimal('change_1h', { precision: 10, scale: 4 }),
    change1d: decimal('change_1d', { precision: 10, scale: 4 }),
    change1w: decimal('change_1w', { precision: 10, scale: 4 }),
    change1m: decimal('change_1m', { precision: 10, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_event_outcomes_ticker').on(table.ticker),
    index('idx_event_outcomes_event_time').on(table.eventTime),
  ],
);

export const classificationPredictions = pgTable(
  'classification_predictions',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' })
      .unique(),
    predictedSeverity: varchar('predicted_severity', { length: 20 }).notNull(),
    predictedDirection: varchar('predicted_direction', { length: 20 }).notNull(),
    confidence: decimal('confidence', { precision: 5, scale: 4 }).notNull(),
    classifiedBy: varchar('classified_by', { length: 20 }).notNull(),
    classifiedAt: timestamp('classified_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_classification_predictions_event_id').on(table.eventId),
    index('idx_classification_predictions_classified_at').on(table.classifiedAt),
  ],
);

export const classificationOutcomes = pgTable(
  'classification_outcomes',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' })
      .unique(),
    actualDirection: varchar('actual_direction', { length: 20 }).notNull(),
    priceChange1h: decimal('price_change_1h', { precision: 10, scale: 4 }).notNull(),
    priceChange1d: decimal('price_change_1d', { precision: 10, scale: 4 }).notNull(),
    priceChange1w: decimal('price_change_1w', { precision: 10, scale: 4 }).notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_classification_outcomes_event_id').on(table.eventId),
    index('idx_classification_outcomes_evaluated_at').on(table.evaluatedAt),
  ],
);

export const storyGroups = pgTable(
  'story_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    tickers: jsonb('tickers').notNull().$type<string[]>(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    eventCount: integer('event_count').notNull().default(1),
    firstEventAt: timestamp('first_event_at', { withTimezone: true }).notNull(),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_story_groups_status').on(table.status),
    index('idx_story_groups_last_event_at').on(table.lastEventAt),
  ],
);

export const storyEvents = pgTable(
  'story_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyGroupId: uuid('story_group_id')
      .notNull()
      .references(() => storyGroups.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sequenceNumber: integer('sequence_number').notNull(),
    isKeyEvent: boolean('is_key_event').notNull().default(false),
  },
  (table) => [
    index('idx_story_events_story_group_id').on(table.storyGroupId),
    index('idx_story_events_event_id').on(table.eventId),
  ],
);

export const userFeedback = pgTable(
  'user_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' })
      .unique(),
    verdict: varchar('verdict', { length: 30 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_user_feedback_event_id').on(table.eventId)],
);

export const sourceWeights = pgTable(
  'source_weights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: varchar('source', { length: 100 }).notNull().unique(),
    weight: decimal('weight', { precision: 5, scale: 4 }).notNull(),
    sampleSize: integer('sample_size').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_source_weights_source').on(table.source)],
);

export const weightAdjustments = pgTable(
  'weight_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    previousWeights: jsonb('previous_weights')
      .notNull()
      .$type<Record<string, number>>(),
    newWeights: jsonb('new_weights')
      .notNull()
      .$type<Record<string, number>>(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_weight_adjustments_created_at').on(table.createdAt)],
);

export const reclassificationQueue = pgTable(
  'reclassification_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' })
      .unique(),
    reason: varchar('reason', { length: 50 }).notNull(),
    priority: integer('priority').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_reclassification_queue_status').on(table.status),
    index('idx_reclassification_queue_priority').on(table.priority),
  ],
);

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id),
  channel: varchar('channel', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    dsl: text('dsl').notNull(),
    conditionsAst: jsonb('conditions_ast').notNull().$type<RuleConditionNode>(),
    actions: jsonb('actions')
      .notNull()
      .$type<Record<string, RuleActionValue>>(),
    ruleOrder: integer('rule_order').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_alert_rules_rule_order').on(table.ruleOrder),
    index('idx_alert_rules_enabled').on(table.enabled),
  ],
);

export const alertLog = pgTable(
  'alert_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    priority: varchar('priority', { length: 20 }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    suppressed: boolean('suppressed').notNull().default(false),
    suppressionReason: text('suppression_reason'),
  },
  (table) => [
    index('idx_alert_log_event_id').on(table.eventId),
    index('idx_alert_log_sent_at').on(table.sentAt),
    index('idx_alert_log_suppressed').on(table.suppressed),
  ],
);

export const budgetConfig = pgTable(
  'budget_config',
  {
    id: integer('id').primaryKey().default(1),
    maxAlertsPerHour: integer('max_alerts_per_hour').notNull().default(50),
    priorityShares: jsonb('priority_shares')
      .notNull()
      .$type<BudgetConfig['priorityShares']>(),
    windowMinutes: integer('window_minutes').notNull().default(60),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_budget_config_updated_at').on(table.updatedAt)],
);

export const severityOverrides = pgTable(
  'severity_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' })
      .unique(),
    severity: varchar('severity', { length: 20 }).notNull().$type<Priority>(),
    locked: boolean('locked').notNull().default(false),
    lockedBy: varchar('locked_by', { length: 20 }),
    sourceCount: integer('source_count').notNull().default(1),
    reason: text('reason').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_severity_overrides_event_id').on(table.eventId),
    index('idx_severity_overrides_locked').on(table.locked),
  ],
);

export const watchlist = pgTable(
  'watchlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticker: varchar('ticker', { length: 10 }).notNull().unique(),
    addedAt: timestamp('added_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
  },
  (table) => [index('idx_watchlist_ticker').on(table.ticker)],
);

export const deliveryKillSwitch = pgTable('delivery_kill_switch', {
  id: integer('id').primaryKey().default(1),
  enabled: boolean('enabled').notNull().default(false),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  reason: text('reason'),
  updatedBy: varchar('updated_by', { length: 50 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const severityChanges = pgTable(
  'severity_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    previousSeverity: varchar('previous_severity', { length: 20 })
      .notNull()
      .$type<Priority>(),
    newSeverity: varchar('new_severity', { length: 20 }).notNull().$type<Priority>(),
    reason: text('reason').notNull(),
    changedBy: varchar('changed_by', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_severity_changes_event_id').on(table.eventId),
    index('idx_severity_changes_created_at').on(table.createdAt),
  ],
);
