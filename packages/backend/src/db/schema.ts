import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
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
});

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
