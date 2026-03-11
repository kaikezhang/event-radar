import { describe, it, expect, vi } from 'vitest';
import {
  assignStoryGroup,
  getStoryGroup,
  listActiveStoryGroups,
} from '../services/story-group.js';

// ── Helpers ─────────────────────────────────────────────────────

interface EventRow {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  rawPayload: unknown;
  metadata: unknown;
  severity: string | null;
  receivedAt: Date;
  createdAt: Date;
  mergedFrom: string[] | null;
  sourceUrls: unknown;
  isDuplicate: boolean | null;
}

interface StoryGroupRow {
  id: string;
  title: string;
  tickers: string[];
  eventType: string;
  severity: string;
  status: string;
  eventCount: number;
  firstEventAt: Date;
  lastEventAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: crypto.randomUUID(),
    source: 'sec-8k',
    sourceEventId: null,
    title: 'Test event',
    summary: null,
    rawPayload: null,
    metadata: { ticker: 'AAPL' },
    severity: 'MEDIUM',
    receivedAt: new Date('2024-06-15T12:00:00Z'),
    createdAt: new Date('2024-06-15T12:00:00Z'),
    mergedFrom: null,
    sourceUrls: null,
    isDuplicate: false,
    ...overrides,
  };
}

function makeStoryGroup(overrides: Partial<StoryGroupRow> = {}): StoryGroupRow {
  return {
    id: crypto.randomUUID(),
    title: 'AAPL earnings report',
    tickers: ['AAPL'],
    eventType: 'sec-8k',
    severity: 'MEDIUM',
    status: 'active',
    eventCount: 1,
    firstEventAt: new Date('2024-06-15T12:00:00Z'),
    lastEventAt: new Date('2024-06-15T12:00:00Z'),
    createdAt: new Date('2024-06-15T12:00:00Z'),
    updatedAt: new Date('2024-06-15T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a thenable object that resolves to `rows` but also has chainable
 * query methods (limit, orderBy, innerJoin, where) for drizzle mock compat.
 */
function makeThenable(rows: unknown[]) {
  const obj = {
    limit: vi.fn().mockImplementation(() => makeThenable(rows)),
    orderBy: vi.fn().mockImplementation(() => makeThenable(rows)),
    innerJoin: vi.fn().mockImplementation(() => makeThenable(rows)),
    where: vi.fn().mockImplementation(() => makeThenable(rows)),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return obj;
}

function createMockDb(config: {
  selectResults?: unknown[][];
  updateFn?: () => void;
  insertReturning?: unknown[];
}) {
  let selectCallIndex = 0;
  const selectResults = config.selectResults ?? [[]];

  const mockDb = {
    select: vi.fn().mockImplementation(() => {
      const currentIndex = selectCallIndex++;
      const rows =
        currentIndex < selectResults.length
          ? selectResults[currentIndex]
          : [];

      return {
        from: vi.fn().mockImplementation(() => makeThenable(rows)),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          config.updateFn?.();
          return Promise.resolve();
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(config.insertReturning ?? [{ id: crypto.randomUUID() }]),
        then: (resolve: (v: unknown) => void) => resolve(undefined),
      }),
    }),
  };

  return mockDb;
}

// ── Tests ────────────────────────────────────────────────────────

describe('assignStoryGroup', () => {
  it('should create a new story group for a new event with no matching groups', async () => {
    const event = makeEvent({
      id: 'event-1',
      title: 'AAPL announces quarterly earnings',
      metadata: { ticker: 'AAPL' },
    });
    const newGroupId = crypto.randomUUID();

    const mockDb = createMockDb({
      selectResults: [
        [event],  // 1. fetch event
        [],       // 2. active groups (none)
      ],
      insertReturning: [{ id: newGroupId }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-1');

    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(true);
    expect(result.groupId).toBe(newGroupId);
    expect(result.sequenceNumber).toBe(1);
  });

  it('should assign event to existing group when same ticker + same event type + within time window', async () => {
    const event = makeEvent({
      id: 'event-2',
      source: 'sec-8k',
      title: 'AAPL earnings beat expectations',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:15:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      title: 'AAPL earnings report',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      eventCount: 2,
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    const mockDb = createMockDb({
      selectResults: [
        [event],          // 1. fetch event
        [existingGroup],  // 2. active groups
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-2');

    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(false);
    expect(result.groupId).toBe('group-1');
    expect(result.sequenceNumber).toBe(3); // eventCount + 1
  });

  it('should NOT assign event to group when different ticker', async () => {
    const event = makeEvent({
      id: 'event-3',
      source: 'sec-8k',
      title: 'TSLA announces factory expansion',
      metadata: { ticker: 'TSLA' },
      receivedAt: new Date('2024-06-15T12:10:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });
    const newGroupId = crypto.randomUUID();

    const mockDb = createMockDb({
      selectResults: [
        [event],          // 1. fetch event
        [existingGroup],  // 2. active groups
      ],
      insertReturning: [{ id: newGroupId }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-3');

    // Should create a new group since tickers don't match
    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(true);
    expect(result.groupId).toBe(newGroupId);
  });

  it('should NOT assign event to group when outside time window', async () => {
    const event = makeEvent({
      id: 'event-4',
      source: 'sec-8k',
      title: 'AAPL earnings report',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T14:00:00Z'), // 2 hours later
    });
    // Group's lastEventAt is 12:00 + 30min window = 12:30 — event at 14:00 is outside
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });
    const newGroupId = crypto.randomUUID();

    const mockDb = createMockDb({
      selectResults: [
        [event],          // 1. fetch event
        [existingGroup],  // 2. active groups (returned but won't match due to window)
      ],
      insertReturning: [{ id: newGroupId }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-4');

    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(true);
  });

  it('should extend sliding window when new event is added', async () => {
    // Event arrives 20 min after last event in the group
    const event = makeEvent({
      id: 'event-5',
      source: 'sec-8k',
      title: 'AAPL earnings guidance raised',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:20:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      eventCount: 1,
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    let updatedLastEventAt: Date | null = null;
    const mockDb = createMockDb({
      selectResults: [
        [event],          // 1. fetch event
        [existingGroup],  // 2. active groups
      ],
    });

    // Track what gets updated
    mockDb.update = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if (data.lastEventAt) {
          updatedLastEventAt = data.lastEventAt as Date;
        }
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-5');

    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(false);
    // The update should set lastEventAt to the new event's time
    expect(updatedLastEventAt?.toISOString()).toBe('2024-06-15T12:20:00.000Z');
  });

  it('should upgrade severity when new event has higher severity', async () => {
    const event = makeEvent({
      id: 'event-6',
      source: 'sec-8k',
      title: 'AAPL critical regulatory filing',
      metadata: { ticker: 'AAPL' },
      severity: 'CRITICAL',
      receivedAt: new Date('2024-06-15T12:10:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      severity: 'MEDIUM',
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    let updatedSeverity: string | null = null;
    const mockDb = createMockDb({
      selectResults: [
        [event],          // 1. fetch event
        [existingGroup],  // 2. active groups
      ],
    });

    mockDb.update = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if (data.severity) {
          updatedSeverity = data.severity as string;
        }
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assignStoryGroup(mockDb as any, 'event-6');

    expect(updatedSeverity).toBe('CRITICAL');
  });

  it('should correctly increment sequence number', async () => {
    const event = makeEvent({
      id: 'event-7',
      source: 'sec-8k',
      title: 'AAPL quarterly results update',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:15:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      eventCount: 5,
      lastEventAt: new Date('2024-06-15T12:10:00Z'),
    });

    const mockDb = createMockDb({
      selectResults: [
        [event],
        [existingGroup],
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-7');

    expect(result.sequenceNumber).toBe(6); // 5 + 1
  });

  it('should mark event as key event when severity >= HIGH', async () => {
    const event = makeEvent({
      id: 'event-8',
      source: 'sec-8k',
      title: 'AAPL major announcement',
      metadata: { ticker: 'AAPL' },
      severity: 'HIGH',
      receivedAt: new Date('2024-06-15T12:10:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      eventCount: 1,
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    let insertedIsKeyEvent: boolean | null = null;
    const mockDb = createMockDb({
      selectResults: [
        [event],
        [existingGroup],
      ],
    });

    // Override insert to capture the values
    mockDb.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if (data.isKeyEvent !== undefined) {
          insertedIsKeyEvent = data.isKeyEvent as boolean;
        }
        return {
          returning: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
          then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve(undefined)),
        };
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assignStoryGroup(mockDb as any, 'event-8');

    expect(insertedIsKeyEvent).toBe(true);
  });

  it('should NOT mark event as key event when severity < HIGH', async () => {
    const event = makeEvent({
      id: 'event-9',
      severity: 'LOW',
      receivedAt: new Date('2024-06-15T12:10:00Z'),
    });
    const newGroupId = crypto.randomUUID();

    let insertedIsKeyEvent: boolean | null = null;
    const mockDb = createMockDb({
      selectResults: [
        [event],
        [],  // no active groups
      ],
      insertReturning: [{ id: newGroupId }],
    });

    let insertCallCount = 0;
    mockDb.insert = vi.fn().mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        // First insert is for story_groups — must return { id }
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: newGroupId }]),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }),
        };
      }
      // Second insert is for story_events — capture isKeyEvent
      return {
        values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
          if (data.isKeyEvent !== undefined) {
            insertedIsKeyEvent = data.isKeyEvent as boolean;
          }
          return {
            returning: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          };
        }),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assignStoryGroup(mockDb as any, 'event-9');

    expect(insertedIsKeyEvent).toBe(false);
  });

  it('should return not-assigned when event does not exist', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],  // event not found
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'non-existent');

    expect(result.assigned).toBe(false);
    expect(result.groupId).toBeNull();
    expect(result.isNewGroup).toBe(false);
    expect(result.sequenceNumber).toBeNull();
  });

  it('should match on title similarity when event types differ', async () => {
    // Titles share enough keywords for Jaccard > 0.6:
    // "aapl quarterly earnings beat expectations" vs "aapl quarterly earnings beat forecast"
    // intersection={aapl,quarterly,earnings,beat}=4, union={aapl,quarterly,earnings,beat,expectations,forecast}=6
    // Jaccard = 4/6 ≈ 0.67
    const event = makeEvent({
      id: 'event-10',
      source: 'reuters', // different source/eventType
      title: 'AAPL quarterly earnings beat expectations',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:10:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      title: 'AAPL quarterly earnings beat forecast',
      tickers: ['AAPL'],
      eventType: 'sec-8k', // different event type
      eventCount: 1,
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    const mockDb = createMockDb({
      selectResults: [
        [event],
        [existingGroup],
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-10');

    // Should match because title similarity is high enough (> 0.6)
    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(false);
    expect(result.groupId).toBe('group-1');
  });

  it('should handle event at exact time window boundary', async () => {
    // lastEventAt = 12:00, timeWindow = 30min → window ends at 12:30
    // Event at exactly 12:30 should still be within the window
    const event = makeEvent({
      id: 'event-11',
      source: 'sec-8k',
      title: 'AAPL quarterly update',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:30:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      eventCount: 1,
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    const mockDb = createMockDb({
      selectResults: [
        [event],
        [existingGroup],
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assignStoryGroup(mockDb as any, 'event-11');

    // At the exact boundary (12:30 <= 12:30) — should still match
    expect(result.assigned).toBe(true);
    expect(result.isNewGroup).toBe(false);
    expect(result.groupId).toBe('group-1');
  });

  it('should merge tickers from new event into existing group', async () => {
    const event = makeEvent({
      id: 'event-12',
      source: 'sec-8k',
      title: 'AAPL GOOG partnership announcement',
      metadata: { tickers: ['AAPL', 'GOOG'] },
      receivedAt: new Date('2024-06-15T12:10:00Z'),
    });
    const existingGroup = makeStoryGroup({
      id: 'group-1',
      tickers: ['AAPL'],
      eventType: 'sec-8k',
      eventCount: 1,
      lastEventAt: new Date('2024-06-15T12:00:00Z'),
    });

    let updatedTickers: string[] | null = null;
    const mockDb = createMockDb({
      selectResults: [
        [event],
        [existingGroup],
      ],
    });

    mockDb.update = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if (data.tickers) {
          updatedTickers = data.tickers as string[];
        }
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assignStoryGroup(mockDb as any, 'event-12');

    expect(updatedTickers).toEqual(expect.arrayContaining(['AAPL', 'GOOG']));
    expect(updatedTickers).toHaveLength(2);
  });
});

// ── getStoryGroup ────────────────────────────────────────────────

describe('getStoryGroup', () => {
  it('should return null when group not found', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],  // no group found
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getStoryGroup(mockDb as any, 'non-existent');
    expect(result).toBeNull();
  });

  it('should return story group with events in timeline order', async () => {
    const group = makeStoryGroup({
      id: 'group-1',
      title: 'AAPL earnings story',
      tickers: ['AAPL'],
      eventCount: 2,
    });

    const storyEventRows = [
      {
        eventId: 'evt-1',
        sequenceNumber: 1,
        isKeyEvent: false,
        source: 'sec-8k',
        title: 'AAPL files 8-K',
        receivedAt: new Date('2024-06-15T12:00:00Z'),
      },
      {
        eventId: 'evt-2',
        sequenceNumber: 2,
        isKeyEvent: true,
        source: 'reuters',
        title: 'AAPL earnings beat',
        receivedAt: new Date('2024-06-15T12:15:00Z'),
      },
    ];

    const mockDb = createMockDb({
      selectResults: [
        [group],          // 1. fetch group
        storyEventRows,   // 2. fetch story events
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getStoryGroup(mockDb as any, 'group-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('group-1');
    expect(result!.title).toBe('AAPL earnings story');
    expect(result!.events).toHaveLength(2);
    expect(result!.events[0].sequenceNumber).toBe(1);
    expect(result!.events[1].sequenceNumber).toBe(2);
    expect(result!.events[1].isKeyEvent).toBe(true);
  });
});

// ── listActiveStoryGroups ────────────────────────────────────────

describe('listActiveStoryGroups', () => {
  it('should return empty array when no groups exist', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],  // no groups
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listActiveStoryGroups(mockDb as any, { status: 'active' });
    expect(result).toEqual([]);
  });

  it('should return story groups with their events', async () => {
    const group = makeStoryGroup({
      id: 'group-1',
      title: 'AAPL developing story',
      eventCount: 1,
    });

    const storyEventRows = [
      {
        eventId: 'evt-1',
        sequenceNumber: 1,
        isKeyEvent: false,
        source: 'sec-8k',
        title: 'AAPL filing',
        receivedAt: new Date('2024-06-15T12:00:00Z'),
      },
    ];

    const mockDb = createMockDb({
      selectResults: [
        [group],          // 1. list groups
        storyEventRows,   // 2. fetch events for group
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listActiveStoryGroups(mockDb as any, { status: 'active' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('group-1');
    expect(result[0].events).toHaveLength(1);
    expect(result[0].status).toBe('active');
  });
});
