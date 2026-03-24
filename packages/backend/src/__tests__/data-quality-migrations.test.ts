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
});
