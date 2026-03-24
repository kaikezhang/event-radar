import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MIGRATIONS_DIR = resolve(process.cwd(), 'src/db/migrations');

describe('data quality migrations', () => {
  it('nulls inferred ETF fallback tickers instead of keeping fake event symbols', async () => {
    const migration = await readFile(resolve(MIGRATIONS_DIR, '011-fix-data-quality-tickers.sql'), 'utf8');

    expect(migration).toContain("ticker IN ('SPY', 'QQQ', 'XLE', 'TLT', 'GLD', 'USO', 'DIA', 'IWM', 'VIX')");
    expect(migration).toContain("metadata = COALESCE(metadata, '{}'::jsonb) - 'ticker' - 'tickers'");
    expect(migration).toContain("metadata->>'ticker_inferred'");
  });

  it('backfills SEC tickers from the CIK map into both ticker fields', async () => {
    const migration = await readFile(resolve(MIGRATIONS_DIR, '011-fix-data-quality-tickers.sql'), 'utf8');

    expect(migration).toContain('WITH cik_map (cik, ticker) AS');
    expect(migration).toContain("('320193', 'AAPL')");
    expect(migration).toContain("('789019', 'MSFT')");
    expect(migration).toContain("REGEXP_REPLACE(COALESCE(e.metadata->>'cik', ''), '^0+', '') = cik_map.cik");
    expect(migration).toContain("jsonb_set(COALESCE(e.metadata, '{}'::jsonb), '{ticker}'");
  });

  it('includes a migration to reclassify stale neutral geopolitical war events as bearish', async () => {
    const migration = await readFile(resolve(MIGRATIONS_DIR, '013-reclassify-geopolitical-events.sql'), 'utf8');

    expect(migration).toContain('UPDATE events');
    expect(migration).toContain("SET classification = 'BEARISH'");
    expect(migration).toContain("WHERE classification = 'NEUTRAL'");
    expect(migration).toContain("severity IN ('CRITICAL', 'HIGH')");
  });

  it('targets Iran and war-related keywords in the geopolitical reclassification migration', async () => {
    const migration = await readFile(resolve(MIGRATIONS_DIR, '013-reclassify-geopolitical-events.sql'), 'utf8');

    expect(migration).toContain("title ILIKE '%war%'");
    expect(migration).toContain("title ILIKE '%military%'");
    expect(migration).toContain("title ILIKE '%strike%'");
    expect(migration).toContain("title ILIKE '%attack%'");
    expect(migration).toContain("title ILIKE '%bomb%'");
    expect(migration).toContain("title ILIKE '%iran%'");
    expect(migration).toContain("title ILIKE '%hormuz%'");
    expect(migration).toContain("title ILIKE '%middle east%'");
  });
});
