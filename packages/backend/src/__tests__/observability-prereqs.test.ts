import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registry } from '../metrics.js';
import { startOutcomeProcessingLoop } from '../app.js';

const MIGRATIONS_DIR = resolve(process.cwd(), 'src/db/migrations');

describe('startOutcomeProcessingLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for the startup delay before the first processing run', async () => {
    const processOutcomes = vi.fn().mockResolvedValue(undefined);

    startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 120_000,
      intervalMs: 900_000,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(119_999);
    expect(processOutcomes).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(processOutcomes).toHaveBeenCalledTimes(1);
  });

  it('runs repeatedly on the configured interval after the initial delay', async () => {
    const processOutcomes = vi.fn().mockResolvedValue(undefined);

    startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 120_000,
      intervalMs: 900_000,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(120_000);
    await vi.advanceTimersByTimeAsync(900_000);
    await vi.advanceTimersByTimeAsync(900_000);

    expect(processOutcomes).toHaveBeenCalledTimes(3);
  });

  it('skips overlapping runs when a previous cycle is still active', async () => {
    const processOutcomes = vi.fn().mockImplementation(
      () => new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, 60_000);
      }),
    );

    startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 10,
      intervalMs: 50,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(processOutcomes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(processOutcomes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(50);
    expect(processOutcomes).toHaveBeenCalledTimes(2);
  });

  it('logs processing errors and continues scheduling later runs', async () => {
    const error = new Error('boom');
    const processOutcomes = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const logger = { info: vi.fn(), error: vi.fn() };

    startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 100,
      intervalMs: 200,
      logger,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    expect(processOutcomes).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('Outcome processing failed', error);
  });

  it('logs when the periodic backfill loop starts', async () => {
    const processOutcomes = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn(), error: vi.fn() };

    startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 100,
      intervalMs: 200,
      logger,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(logger.info).toHaveBeenCalledWith('Starting periodic outcome backfill');
  });

  it('stops future runs when stopped before the startup delay elapses', async () => {
    const processOutcomes = vi.fn().mockResolvedValue(undefined);

    const loop = startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 120_000,
      intervalMs: 900_000,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    loop.stop();
    await vi.advanceTimersByTimeAsync(2_000_000);

    expect(processOutcomes).not.toHaveBeenCalled();
  });

  it('stops interval runs after the first execution', async () => {
    const processOutcomes = vi.fn().mockResolvedValue(undefined);

    const loop = startOutcomeProcessingLoop({
      outcomeTracker: { processOutcomes },
      startupDelayMs: 100,
      intervalMs: 200,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(processOutcomes).toHaveBeenCalledTimes(1);

    loop.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(processOutcomes).toHaveBeenCalledTimes(1);
  });
});

describe('observability prerequisite artifacts', () => {
  it('defines the audit confidence migration with backfill and partial index', async () => {
    const migration = await readFile(resolve(MIGRATIONS_DIR, '001-add-audit-confidence.sql'), 'utf8');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS confidence DECIMAL(5,4)');
    expect(migration).toContain("SUBSTRING(reason FROM 'confidence: ([0-9.]+)')");
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_pipeline_audit_confidence');
    expect(migration).toContain('WHERE confidence IS NOT NULL');
  });

  it('defines the observability indexes migration for audit and outcome backfills', async () => {
    const migration = await readFile(resolve(MIGRATIONS_DIR, '002-add-observability-indexes.sql'), 'utf8');

    expect(migration).toContain('idx_pipeline_audit_outcome_created');
    expect(migration).toContain('idx_pipeline_audit_source_created');
    expect(migration).toContain('idx_pipeline_audit_stopped_created');
    expect(migration).toContain("WHERE outcome = 'filtered' AND stopped_at = 'llm_judge'");
    expect(migration).toContain('idx_events_source_event_id');
    expect(migration).toContain('idx_events_source_source_event_id');
    expect(migration).toContain('idx_event_outcomes_pending_1d');
    expect(migration).toContain('idx_event_outcomes_pending_1w');
  });

  it('exports llm enrichment metrics in the registry output', async () => {
    const metricsText = await registry.metrics();

    expect(metricsText).toContain('llm_enrichment_total');
    expect(metricsText).toContain('llm_enrichment_duration_seconds');
  });
});
