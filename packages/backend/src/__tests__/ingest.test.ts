import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../app.js';

describe('POST /api/events/ingest', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
  });

  const validEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K: Apple Inc. (AAPL) — 5.02 (Departure/Election of Directors)',
    body: 'SEC 8-K filing by Apple Inc.',
    url: 'https://www.sec.gov/Archives/edgar/data/320193/filing.htm',
    timestamp: new Date().toISOString(),
    metadata: {
      cik: '0000320193',
      ticker: 'AAPL',
      item_types: ['5.02'],
    },
  };

  it('should accept a valid RawEvent and return 201', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: validEvent,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accepted).toBe(true);
    expect(body.id).toBe(validEvent.id);
  });

  it('should publish the event to the event bus', async () => {
    let received: unknown = null;
    const unsub = ctx.eventBus.subscribe((event) => {
      received = event;
    });

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: {
        ...validEvent,
        id: '660e8400-e29b-41d4-a716-446655440001',
      },
    });

    expect(received).not.toBeNull();
    expect((received as { source: string }).source).toBe('sec-edgar');

    unsub();
  });

  it('should reject an event with missing required fields', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: { id: 'not-a-uuid', source: 'test' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Invalid RawEvent');
    expect(body.details).toBeDefined();
  });

  it('should reject an event with invalid UUID', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: { ...validEvent, id: 'not-a-uuid' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject an empty body', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('should accept an event without optional fields', async () => {
    const minimalEvent = {
      id: '770e8400-e29b-41d4-a716-446655440002',
      source: 'sec-edgar',
      type: '8-K',
      title: 'Minimal event',
      body: 'Test body',
      timestamp: new Date().toISOString(),
    };

    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: minimalEvent,
    });

    expect(response.statusCode).toBe(201);
  });
});
