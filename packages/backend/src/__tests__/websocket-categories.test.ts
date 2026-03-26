import { describe, expect, it } from 'vitest';
import { toLiveFeedEvent } from '../plugins/websocket.js';

describe('toLiveFeedEvent category inference', () => {
  it('keeps truth social in the policy bucket', () => {
    const event = toLiveFeedEvent({
      id: 'evt-truth-social',
      source: 'truth-social',
      title: 'Trade rhetoric intensifies',
      summary: 'Policy-sensitive post from Truth Social.',
      severity: 'HIGH',
      time: new Date('2026-03-26T10:00:00.000Z'),
    });

    expect(event.category).toBe('policy');
  });

  it('maps trading halts into the corporate bucket', () => {
    const event = toLiveFeedEvent({
      id: 'evt-trading-halt',
      source: 'trading-halt',
      title: 'NASDAQ halts trading in ABCD',
      summary: 'Volatility pause due to pending news.',
      severity: 'CRITICAL',
      time: new Date('2026-03-26T10:00:00.000Z'),
      metadata: {
        haltReasonCode: 'T1',
      },
    });

    expect(event.category).toBe('corporate');
  });

  it('keeps economic calendar events in the macro bucket', () => {
    const event = toLiveFeedEvent({
      id: 'evt-econ-calendar',
      source: 'econ-calendar',
      title: 'Consumer Price Index release',
      summary: 'Scheduled inflation release.',
      severity: 'HIGH',
      time: new Date('2026-03-26T10:00:00.000Z'),
    });

    expect(event.category).toBe('macro');
  });
});
