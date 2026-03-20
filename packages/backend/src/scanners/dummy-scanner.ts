import { randomUUID } from 'node:crypto';
import { BaseScanner, ok, type EventBus, type RawEvent, type Result } from '@event-radar/shared';
import { resolveScannerIntervalMs } from './scanner-intervals.js';

export class DummyScanner extends BaseScanner {
  constructor(eventBus: EventBus) {
    super({
      name: 'dummy',
      source: 'dummy',
      pollIntervalMs: resolveScannerIntervalMs('DUMMY', 10_000),
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    const event: RawEvent = {
      id: randomUUID(),
      source: 'dummy',
      type: 'test-event',
      title: `Dummy event at ${new Date().toISOString()}`,
      body: 'This is a dummy event for testing the scanner framework.',
      timestamp: new Date(),
    };

    return ok([event]);
  }
}
