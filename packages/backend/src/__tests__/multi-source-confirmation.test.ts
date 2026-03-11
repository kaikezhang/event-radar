import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  checkConfirmation,
  processNewConfirmation,
  checkStoryGroupConfirmation,
} from '../services/multi-source-confirmation.js';

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
  confirmedSources: string[] | null;
  confirmationCount: number | null;
}

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: crypto.randomUUID(),
    source: 'sec-8k',
    sourceEventId: null,
    title: 'Test event',
    summary: null,
    rawPayload: null,
    metadata: { ticker: 'AAPL', confidence: 0.7 },
    severity: 'MEDIUM',
    receivedAt: new Date('2024-06-15T12:00:00Z'),
    createdAt: new Date('2024-06-15T12:00:00Z'),
    mergedFrom: null,
    sourceUrls: null,
    isDuplicate: false,
    confirmedSources: null,
    confirmationCount: 1,
    ...overrides,
  };
}

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
  updateFn?: (data: Record<string, unknown>) => void;
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
      set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        config.updateFn?.(data);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
        then: (resolve: (v: unknown) => void) => resolve(undefined),
      }),
    }),
  };

  return mockDb;
}

// ── Tests ────────────────────────────────────────────────────────

describe('checkConfirmation', () => {
  it('should return no upgrade for a single-source event', async () => {
    const event = makeEvent({
      id: 'event-1',
      source: 'sec-8k',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkConfirmation(mockDb as any, 'event-1');

    expect(result.upgraded).toBe(false);
    expect(result.sourceCount).toBe(1);
    expect(result.newSeverity).toBe('MEDIUM');
    expect(result.confidenceBoost).toBe(0);
  });

  it('should return empty result for non-existent event', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkConfirmation(mockDb as any, 'non-existent');

    expect(result.sourceCount).toBe(0);
    expect(result.upgraded).toBe(false);
  });
});

describe('processNewConfirmation', () => {
  it('should upgrade LOW → MEDIUM with 2 sources', async () => {
    const event = makeEvent({
      id: 'event-1',
      source: 'sec-8k',
      severity: 'LOW',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const updatedData: Record<string, unknown>[] = [];
    const mockDb = createMockDb({
      selectResults: [[event]],
      updateFn: (data) => updatedData.push(data),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-1', 'reuters');

    expect(result.upgraded).toBe(true);
    expect(result.previousSeverity).toBe('LOW');
    expect(result.newSeverity).toBe('MEDIUM');
    expect(result.sourceCount).toBe(2);
    expect(result.sources).toContain('sec-8k');
    expect(result.sources).toContain('reuters');
    expect(result.confidenceBoost).toBe(0.15);
  });

  it('should upgrade MEDIUM → HIGH with 2 sources', async () => {
    const event = makeEvent({
      id: 'event-2',
      source: 'sec-8k',
      severity: 'MEDIUM',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-2', 'bloomberg');

    expect(result.upgraded).toBe(true);
    expect(result.previousSeverity).toBe('MEDIUM');
    expect(result.newSeverity).toBe('HIGH');
    expect(result.confidenceBoost).toBe(0.15);
  });

  it('should upgrade to CRITICAL with 3+ sources when already HIGH', async () => {
    const event = makeEvent({
      id: 'event-3',
      source: 'sec-8k',
      severity: 'HIGH',
      confirmedSources: ['sec-8k', 'reuters'],
      confirmationCount: 2,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-3', 'bloomberg');

    expect(result.upgraded).toBe(true);
    expect(result.newSeverity).toBe('CRITICAL');
    expect(result.sourceCount).toBe(3);
    expect(result.confidenceBoost).toBe(0.25);
  });

  it('should upgrade LOW to HIGH with 3+ sources', async () => {
    const event = makeEvent({
      id: 'event-3b',
      source: 'sec-8k',
      severity: 'LOW',
      confirmedSources: ['sec-8k', 'reuters'],
      confirmationCount: 2,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-3b', 'bloomberg');

    expect(result.upgraded).toBe(true);
    expect(result.newSeverity).toBe('HIGH');
    expect(result.confidenceBoost).toBe(0.25);
  });

  it('should NOT upgrade already CRITICAL severity', async () => {
    const event = makeEvent({
      id: 'event-4',
      source: 'sec-8k',
      severity: 'CRITICAL',
      confirmedSources: ['sec-8k', 'reuters'],
      confirmationCount: 2,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-4', 'bloomberg');

    expect(result.upgraded).toBe(false);
    expect(result.newSeverity).toBe('CRITICAL');
    expect(result.confidenceBoost).toBe(0);
  });

  it('should NOT count same source as new confirmation', async () => {
    const event = makeEvent({
      id: 'event-5',
      source: 'sec-8k',
      severity: 'LOW',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-5', 'sec-8k');

    expect(result.upgraded).toBe(false);
    expect(result.sourceCount).toBe(1);
    expect(result.confidenceBoost).toBe(0);
    expect(result.newSeverity).toBe('LOW');
  });

  it('should correctly compute confidence boost and cap at maxConfidence', async () => {
    const event = makeEvent({
      id: 'event-6',
      source: 'sec-8k',
      severity: 'LOW',
      metadata: { ticker: 'AAPL', confidence: 0.9 },
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-6', 'reuters');

    expect(result.confidenceBoost).toBe(0.15);
    // 0.9 + 0.15 = 1.05, capped at 0.99
    expect(result.newConfidence).toBe(0.99);
  });

  it('should correctly compute confidence when below cap', async () => {
    const event = makeEvent({
      id: 'event-6b',
      source: 'sec-8k',
      severity: 'LOW',
      metadata: { ticker: 'AAPL', confidence: 0.5 },
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'event-6b', 'reuters');

    expect(result.confidenceBoost).toBe(0.15);
    expect(result.newConfidence).toBeCloseTo(0.65, 2);
  });

  it('should emit event:severity-upgraded when upgraded', async () => {
    const event = makeEvent({
      id: 'event-7',
      source: 'sec-8k',
      severity: 'LOW',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    const emitter = new EventEmitter();
    const emittedEvents: unknown[] = [];
    emitter.on('event:severity-upgraded', (data) => emittedEvents.push(data));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processNewConfirmation(mockDb as any, 'event-7', 'reuters', undefined, emitter);

    expect(emittedEvents).toHaveLength(1);
    const emitted = emittedEvents[0] as Record<string, unknown>;
    expect(emitted.eventId).toBe('event-7');
    expect(emitted.previousSeverity).toBe('LOW');
    expect(emitted.newSeverity).toBe('MEDIUM');
  });

  it('should NOT emit event:severity-upgraded when not upgraded', async () => {
    const event = makeEvent({
      id: 'event-8',
      source: 'sec-8k',
      severity: 'CRITICAL',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const mockDb = createMockDb({
      selectResults: [[event]],
    });

    const emitter = new EventEmitter();
    const emittedEvents: unknown[] = [];
    emitter.on('event:severity-upgraded', (data) => emittedEvents.push(data));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processNewConfirmation(mockDb as any, 'event-8', 'reuters', undefined, emitter);

    expect(emittedEvents).toHaveLength(0);
  });

  it('should update DB with correct fields on upgrade', async () => {
    const event = makeEvent({
      id: 'event-9',
      source: 'sec-8k',
      severity: 'MEDIUM',
      metadata: { ticker: 'AAPL', confidence: 0.7 },
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    const updatedData: Record<string, unknown>[] = [];
    const mockDb = createMockDb({
      selectResults: [[event]],
      updateFn: (data) => updatedData.push(data),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processNewConfirmation(mockDb as any, 'event-9', 'bloomberg');

    expect(updatedData).toHaveLength(1);
    expect(updatedData[0].severity).toBe('HIGH');
    expect(updatedData[0].confirmationCount).toBe(2);
    expect(updatedData[0].confirmedSources).toEqual(
      expect.arrayContaining(['sec-8k', 'bloomberg']),
    );
  });

  it('should return non-existent event result for missing event', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processNewConfirmation(mockDb as any, 'missing-id', 'reuters');

    expect(result.sourceCount).toBe(0);
    expect(result.upgraded).toBe(false);
    expect(result.sources).toEqual([]);
  });
});

describe('checkStoryGroupConfirmation', () => {
  it('should trigger confirmation when story group has 2+ distinct sources', async () => {
    const eventId = 'event-10';
    const event = makeEvent({
      id: eventId,
      source: 'sec-8k',
      severity: 'LOW',
      confirmedSources: ['sec-8k'],
      confirmationCount: 1,
    });

    // Story group events from different sources
    const storyEventRows = [
      { source: 'sec-8k' },
      { source: 'reuters' },
    ];

    let selectCallIndex = 0;
    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        const currentIndex = selectCallIndex++;
        if (currentIndex === 0) {
          // First call: story events join
          return {
            from: vi.fn().mockImplementation(() => makeThenable(storyEventRows)),
          };
        }
        // Subsequent calls: processNewConfirmation fetches the event
        return {
          from: vi.fn().mockImplementation(() => makeThenable([event])),
        };
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkStoryGroupConfirmation(mockDb as any, 'group-1', eventId);

    expect(result).not.toBeNull();
    expect(result!.sourceCount).toBeGreaterThanOrEqual(2);
  });

  it('should return null when story group has only 1 source', async () => {
    const storyEventRows = [
      { source: 'sec-8k' },
      { source: 'sec-8k' },
    ];

    const mockDb = createMockDb({
      selectResults: [storyEventRows],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkStoryGroupConfirmation(mockDb as any, 'group-1', 'event-1');

    expect(result).toBeNull();
  });
});
