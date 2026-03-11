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
