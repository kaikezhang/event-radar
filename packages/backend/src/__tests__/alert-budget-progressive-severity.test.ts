import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEventBus, type Priority, type RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { AlertBudgetService } from '../services/alert-budget.js';
import { ProgressiveSeverityService } from '../services/progressive-severity.js';
import { UserFeedbackService } from '../services/user-feedback.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
} from './helpers/test-db.js';

function makeRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Alert budget test event',
    body: 'Body',
    timestamp: new Date('2026-03-11T12:00:00.000Z'),
    metadata: { ticker: 'AAPL' },
    ...overrides,
  };
}

async function createStoredEvent(
  db: Database,
  overrides: Partial<RawEvent> = {},
  severity?: Priority,
): Promise<string> {
  return storeEvent(db, { event: makeRawEvent(overrides), severity });
}

describe('AlertBudgetService', () => {
  let db: Database;
  let client: PGlite;
  let currentTime: Date;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
    currentTime = new Date('2026-03-11T12:00:00.000Z');
  });

  function createService(): AlertBudgetService {
    return new AlertBudgetService(db, {
      now: () => currentTime,
    });
  }

  async function fillBudget(
    service: AlertBudgetService,
    priority: Priority,
    count: number,
  ): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const eventId = await createStoredEvent(db, {
        source: `${priority.toLowerCase()}-${index}`,
      });
      await service.recordAlert(eventId, priority);
    }
  }

  it('always allows CRITICAL alerts even after the hourly budget is exhausted', async () => {
    const service = createService();

    await fillBudget(service, 'HIGH', 20);
    await fillBudget(service, 'MEDIUM', 17);
    await fillBudget(service, 'LOW', 12);

    const decision = await service.checkBudget('CRITICAL');

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('suppresses LOW alerts after the LOW share is exhausted', async () => {
    const service = createService();

    await fillBudget(service, 'LOW', 12);

    const decision = await service.checkBudget('LOW');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('LOW');
    expect(decision.queuePosition).toBe(1);
  });

  it('suppresses MEDIUM alerts after the MEDIUM share is exhausted', async () => {
    const service = createService();

    await fillBudget(service, 'LOW', 12);
    await fillBudget(service, 'MEDIUM', 17);

    const decision = await service.checkBudget('MEDIUM');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('MEDIUM');
  });

  it('does not let LOW saturation block HIGH alerts', async () => {
    const service = createService();

    await fillBudget(service, 'LOW', 13);

    const decision = await service.checkBudget('HIGH');

    expect(decision.allowed).toBe(true);
  });

  it('returns budget usage grouped by priority and suppression count', async () => {
    const service = createService();

    await service.updateBudgetConfig({ maxAlertsPerHour: 12 });
    await fillBudget(service, 'HIGH', 2);
    await fillBudget(service, 'MEDIUM', 1);
    await fillBudget(service, 'LOW', 4);

    const usage = await service.getUsage();

    expect(usage.total.used).toBe(6);
    expect(usage.total.limit).toBe(12);
    expect(usage.byPriority.HIGH.used).toBe(2);
    expect(usage.byPriority.MEDIUM.used).toBe(1);
    expect(usage.byPriority.LOW.used).toBe(3);
    expect(usage.suppressed).toBe(1);
  });

  it('records suppressed alerts for audit queries', async () => {
    const service = createService();

    await fillBudget(service, 'LOW', 13);

    const suppressed = await service.listSuppressed(10);

    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]?.priority).toBe('LOW');
    expect(suppressed[0]?.suppressed).toBe(true);
    expect(suppressed[0]?.suppressionReason).toContain('LOW');
  });

  it('updates and persists the budget configuration', async () => {
    const service = createService();

    const updated = await service.updateBudgetConfig({
      maxAlertsPerHour: 80,
      priorityShares: {
        HIGH: 0.5,
      },
      windowMinutes: 30,
    });

    expect(updated.maxAlertsPerHour).toBe(80);
    expect(updated.priorityShares.HIGH).toBe(0.5);
    expect(updated.priorityShares.MEDIUM).toBe(0.35);
    expect(updated.windowMinutes).toBe(30);

    const persisted = await service.getBudgetConfig();
    expect(persisted).toEqual(updated);
  });

  it('resets the active window after the configured duration expires', async () => {
    const service = createService();

    await fillBudget(service, 'LOW', 12);
    currentTime = new Date('2026-03-11T13:01:00.000Z');

    const decision = await service.checkBudget('LOW');
    const usage = await service.getUsage();

    expect(decision.allowed).toBe(true);
    expect(usage.total.used).toBe(0);
  });

  it('records sent and suppressed alerts transactionally under concurrent writes', async () => {
    const service = createService();

    await service.updateBudgetConfig({ maxAlertsPerHour: 12 });

    await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const eventId = await createStoredEvent(db, {
          source: `low-concurrent-${index}`,
        });
        await service.recordAlert(eventId, 'LOW');
      }),
    );

    const usage = await service.getUsage();

    expect(usage.byPriority.LOW.used).toBe(3);
    expect(usage.suppressed).toBe(2);
  });
});

describe('ProgressiveSeverityService', () => {
  let db: Database;
  let client: PGlite;
  let eventBus: InMemoryEventBus;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
    eventBus = new InMemoryEventBus();
  });

  function createService(): ProgressiveSeverityService {
    return new ProgressiveSeverityService(db, {
      eventBus,
    });
  }

  it('defaults new events to MEDIUM severity', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);

    const result = await service.getEffectiveSeverity(eventId);

    expect(result.severity).toBe('MEDIUM');
    expect(result.locked).toBe(false);
    expect(result.sourceCount).toBe(1);
  });

  it('keeps LOW events at LOW until a second source confirms them', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db, {}, 'LOW');

    const initial = await service.getEffectiveSeverity(eventId);
    expect(initial.severity).toBe('LOW');
    expect(initial.sourceCount).toBe(1);

    const upgraded = await service.recordConfirmation(eventId, 'reddit');
    expect(upgraded.severity).toBe('HIGH');
    expect(upgraded.sourceCount).toBe(2);
  });

  it('upgrades to HIGH after two distinct source confirmations', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);

    const result = await service.recordConfirmation(eventId, 'reddit');

    expect(result.severity).toBe('HIGH');
    expect(result.sourceCount).toBe(2);
  });

  it('upgrades to CRITICAL after three or more distinct source confirmations', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);

    await service.recordConfirmation(eventId, 'reddit');
    const result = await service.recordConfirmation(eventId, 'x');

    expect(result.severity).toBe('CRITICAL');
    expect(result.sourceCount).toBe(3);
  });

  it('ignores duplicate confirmations from the same source', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);

    await service.recordConfirmation(eventId, 'reddit');
    const result = await service.recordConfirmation(eventId, 'reddit');

    expect(result.severity).toBe('HIGH');
    expect(result.sourceCount).toBe(2);
  });

  it('stops auto-upgrading after a user lock is applied', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);

    await service.lockSeverity(eventId, 'LOW', 'operator override');
    const result = await service.recordConfirmation(eventId, 'reddit');

    expect(result.severity).toBe('LOW');
    expect(result.locked).toBe(true);
  });

  it('downgrades one level when the user marks the event incorrect', async () => {
    const service = createService();
    const feedbackService = new UserFeedbackService(db);
    const eventId = await createStoredEvent(db);

    await service.recordConfirmation(eventId, 'reddit');
    await service.recordConfirmation(eventId, 'x');
    await feedbackService.submitFeedback(eventId, 'incorrect', 'Too aggressive');

    const result = await service.getEffectiveSeverity(eventId);

    expect(result.severity).toBe('HIGH');
    expect(result.reason).toContain('incorrect');
  });

  it('records severity change history', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);

    await service.recordConfirmation(eventId, 'reddit');
    await service.recordConfirmation(eventId, 'x');
    await service.lockSeverity(eventId, 'HIGH', 'manual review');

    const history = await service.getSeverityHistory(eventId);

    expect(history).toHaveLength(3);
    expect(history[0]?.previousSeverity).toBe('MEDIUM');
    expect(history[0]?.newSeverity).toBe('HIGH');
    expect(history[1]?.newSeverity).toBe('CRITICAL');
    expect(history[2]?.changedBy).toBe('user');
  });

  it('emits severity changed events on the event bus', async () => {
    const service = createService();
    const eventId = await createStoredEvent(db);
    const published: unknown[] = [];

    eventBus.subscribeTopic?.('severity:changed', (payload) => {
      published.push(payload);
    });

    await service.recordConfirmation(eventId, 'reddit');

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      eventId,
      previousSeverity: 'MEDIUM',
      newSeverity: 'HIGH',
    });
  });
});
