import { z } from 'zod';

// ── Story Group Status ──────────────────────────────────────────

export const StoryGroupStatusSchema = z.enum(['active', 'closed']);
export type StoryGroupStatus = z.infer<typeof StoryGroupStatusSchema>;

// ── Story Event ─────────────────────────────────────────────────

export const StoryEventSchema = z.object({
  eventId: z.string().uuid(),
  sequenceNumber: z.number().int().min(1),
  source: z.string(),
  title: z.string(),
  publishedAt: z.string().datetime(),
  isKeyEvent: z.boolean(),
});

export type StoryEvent = z.infer<typeof StoryEventSchema>;

// ── Story Group ─────────────────────────────────────────────────

export const StoryGroupSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  tickers: z.array(z.string()),
  eventType: z.string(),
  severity: z.string(),
  status: StoryGroupStatusSchema,
  eventCount: z.number().int().min(0),
  firstEventAt: z.string().datetime(),
  lastEventAt: z.string().datetime(),
  events: z.array(StoryEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type StoryGroup = z.infer<typeof StoryGroupSchema>;

// ── Story Group Result ──────────────────────────────────────────

export const StoryGroupResultSchema = z.object({
  assigned: z.boolean(),
  groupId: z.string().uuid().nullable(),
  isNewGroup: z.boolean(),
  sequenceNumber: z.number().int().nullable(),
});

export type StoryGroupResult = z.infer<typeof StoryGroupResultSchema>;

// ── Story Group Options ─────────────────────────────────────────

export const StoryGroupOptionsSchema = z.object({
  timeWindowMinutes: z.number().int().min(1).max(1440).default(30),
  closedAfterMinutes: z.number().int().min(1).max(10080).default(120),
  minSimilarity: z.number().min(0).max(1).default(0.6),
  limit: z.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'closed', 'all']).default('all'),
});

export type StoryGroupOptions = z.infer<typeof StoryGroupOptionsSchema>;
