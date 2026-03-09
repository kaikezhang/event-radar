import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { resetMetrics, registry } from '../metrics.js';

describe('GET /metrics', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false });
    await ctx.server.ready();
  });

  beforeEach(() => {
    resetMetrics();
  });

  afterAll(async () => {
    await ctx.server.close();
  });

  it('should return 200 with Prometheus text format', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/');
    expect(response.body).toContain('# HELP');
    expect(response.body).toContain('# TYPE');
  });

  it('should include uptime_seconds gauge', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.body).toContain('uptime_seconds');
  });

  it('should include all custom metric definitions', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    const body = response.body;
    expect(body).toContain('events_processed_total');
    expect(body).toContain('events_by_source');
    expect(body).toContain('events_by_severity');
    expect(body).toContain('deliveries_sent_total');
    expect(body).toContain('deliveries_by_channel');
    expect(body).toContain('processing_duration_seconds');
  });

  it('should include default Node.js metrics', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.body).toContain('process_cpu');
    expect(response.body).toContain('nodejs_heap_size_total_bytes');
  });
});

describe('metrics tracking via event bus', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false });
    await ctx.server.ready();
  });

  beforeEach(() => {
    resetMetrics();
  });

  afterAll(async () => {
    await ctx.server.close();
  });

  it('should increment event counters when an event is published', async () => {
    await ctx.eventBus.publish({
      id: randomUUID(),
      source: 'sec-edgar',
      type: '8-K',
      title: 'Test filing',
      body: 'Test event body',
      timestamp: new Date(),
    });

    const metricsResponse = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    const body = metricsResponse.body;
    expect(body).toContain('events_processed_total{source="sec-edgar",event_type="8-K"} 1');
    expect(body).toContain('events_by_source{source="sec-edgar"} 1');
    expect(body).toContain('events_by_severity{severity="MEDIUM"} 1');
  });

  it('should track processing duration histogram', async () => {
    await ctx.eventBus.publish({
      id: randomUUID(),
      source: 'dummy',
      type: 'test-event',
      title: 'Duration test',
      body: 'Test body',
      timestamp: new Date(),
    });

    const metricsResponse = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(metricsResponse.body).toContain('processing_duration_seconds_bucket');
    expect(metricsResponse.body).toContain('processing_duration_seconds_count');
  });

  it('should accumulate counters across multiple events', async () => {
    await ctx.eventBus.publish({
      id: randomUUID(),
      source: 'sec-edgar',
      type: '8-K',
      title: 'Event 1',
      body: '',
      timestamp: new Date(),
    });

    await ctx.eventBus.publish({
      id: randomUUID(),
      source: 'sec-edgar',
      type: 'form-4',
      title: 'Event 2',
      body: '',
      timestamp: new Date(),
    });

    const metricsResponse = await ctx.server.inject({
      method: 'GET',
      url: '/metrics',
    });

    const body = metricsResponse.body;
    expect(body).toContain('events_processed_total{source="sec-edgar",event_type="8-K"} 1');
    expect(body).toContain('events_processed_total{source="sec-edgar",event_type="form-4"} 1');
    expect(body).toContain('events_by_source{source="sec-edgar"} 2');
  });
});

describe('metrics module', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('should export a valid prom-client registry', async () => {
    const output = await registry.metrics();
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should reset counters to zero', async () => {
    const { eventsProcessedTotal } = await import('../metrics.js');
    eventsProcessedTotal.inc({ source: 'test', event_type: 'test' });

    const before = await registry.getSingleMetricAsString('events_processed_total');
    expect(before).toContain('1');

    resetMetrics();

    const after = await registry.getSingleMetricAsString('events_processed_total');
    expect(after).not.toContain('source="test"');
  });
});
