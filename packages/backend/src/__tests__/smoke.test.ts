import { describe, it, expect } from 'vitest';
import type { RawEvent, Scanner, ScannerHealth, Result, EventBus } from '@event-radar/shared';
import { RawEventSchema, ok, err } from '@event-radar/shared';

describe('shared types smoke test', () => {
  it('should import and use RawEvent type', () => {
    const event: RawEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'test',
      type: 'test-event',
      title: 'Smoke Test Event',
      body: 'This is a smoke test',
      timestamp: new Date(),
    };
    const parsed = RawEventSchema.safeParse(event);
    expect(parsed.success).toBe(true);
  });

  it('should use Result type', () => {
    const success: Result<number> = ok(1);
    const failure: Result<number> = err(new Error('fail'));
    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
  });

  it('should reference Scanner and EventBus interfaces', () => {
    // Type-level check: these types should be importable and assignable
    expect(null as Scanner | null).toBeNull();
    expect(null as ScannerHealth | null).toBeNull();
    expect(null as EventBus | null).toBeNull();
  });
});
