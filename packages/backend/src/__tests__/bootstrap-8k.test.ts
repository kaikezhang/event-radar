import { describe, expect, it } from 'vitest';

async function loadBootstrap8kModule() {
  return import('../scripts/bootstrap-8k.js').catch(() => null);
}

describe('bootstrap-8k helpers', () => {
  it('should expose the 8-K helper module', async () => {
    const module = await loadBootstrap8kModule();
    expect(module).not.toBeNull();
  });

  it('should classify item 1.01 as a material contract event', async () => {
    const module = await loadBootstrap8kModule();
    const classify = module?.classify8kItems as
      | ((items: string[]) => { eventCategory: string; eventType: string; severity: string } | null)
      | undefined;

    expect(typeof classify).toBe('function');
    if (typeof classify !== 'function') return;

    expect(classify(['1.01'])).toMatchObject({
      eventCategory: 'corporate',
      eventType: 'contract_material',
      severity: 'medium',
    });
  });

  it('should skip filings that only contain routine low-value items', async () => {
    const module = await loadBootstrap8kModule();
    const classify = module?.classify8kItems as ((items: string[]) => unknown) | undefined;

    expect(typeof classify).toBe('function');
    if (typeof classify !== 'function') return;

    expect(classify(['3.02', '9.01'])).toBeNull();
  });

  it('should skip filings that only contain item 2.02', async () => {
    const module = await loadBootstrap8kModule();
    const shouldSkip = module?.shouldSkip8kFiling as ((items: string[]) => boolean) | undefined;

    expect(typeof shouldSkip).toBe('function');
    if (typeof shouldSkip !== 'function') return;

    expect(shouldSkip(['2.02'])).toBe(true);
  });

  it('should keep filings that pair item 2.02 with another material item', async () => {
    const module = await loadBootstrap8kModule();
    const shouldSkip = module?.shouldSkip8kFiling as ((items: string[]) => boolean) | undefined;
    const classify = module?.classify8kItems as
      | ((items: string[]) => { eventType: string; severity: string } | null)
      | undefined;

    expect(typeof shouldSkip).toBe('function');
    expect(typeof classify).toBe('function');
    if (typeof shouldSkip !== 'function' || typeof classify !== 'function') return;

    expect(shouldSkip(['2.02', '5.02'])).toBe(false);
    expect(classify(['2.02', '5.02'])).toMatchObject({
      eventType: 'earnings_results',
      severity: 'critical',
    });
  });

  it('should prefer restructuring items over leadership items', async () => {
    const module = await loadBootstrap8kModule();
    const classify = module?.classify8kItems as
      | ((items: string[]) => { eventCategory: string; eventType: string } | null)
      | undefined;

    expect(typeof classify).toBe('function');
    if (typeof classify !== 'function') return;

    expect(classify(['5.02', '2.05'])).toMatchObject({
      eventCategory: 'restructuring',
      eventType: 'restructuring',
    });
  });

  it('should prefer lower item numbers within the same category', async () => {
    const module = await loadBootstrap8kModule();
    const classify = module?.classify8kItems as
      | ((items: string[]) => { item: string; eventType: string } | null)
      | undefined;

    expect(typeof classify).toBe('function');
    if (typeof classify !== 'function') return;

    expect(classify(['8.01', '1.01'])).toMatchObject({
      item: '1.01',
      eventType: 'contract_material',
    });
  });

  it('should upgrade severity when multiple significant items remain after filtering', async () => {
    const module = await loadBootstrap8kModule();
    const classify = module?.classify8kItems as
      | ((items: string[]) => { severity: string } | null)
      | undefined;

    expect(typeof classify).toBe('function');
    if (typeof classify !== 'function') return;

    expect(classify(['1.01', '8.01'])).toMatchObject({ severity: 'high' });
  });

  it('should format SEC 8-K headlines with ticker, title, and item number', async () => {
    const module = await loadBootstrap8kModule();
    const formatHeadline = module?.format8kHeadline as
      | ((ticker: string, item: string, eventType: string) => string)
      | undefined;

    expect(typeof formatHeadline).toBe('function');
    if (typeof formatHeadline !== 'function') return;

    expect(formatHeadline('NVDA', '5.02', 'leadership_change')).toBe(
      'NVDA 8-K: Leadership Change (Item 5.02)',
    );
  });

  it('should identify Tier 1 tickers for the longer coverage window', async () => {
    const module = await loadBootstrap8kModule();
    const resolveTier = module?.resolveTickerTier as ((ticker: string) => string) | undefined;

    expect(typeof resolveTier).toBe('function');
    if (typeof resolveTier !== 'function') return;

    expect(resolveTier('NVDA')).toBe('tier1');
  });

  it('should identify Tier 2 tickers for the shorter coverage window', async () => {
    const module = await loadBootstrap8kModule();
    const resolveTier = module?.resolveTickerTier as ((ticker: string) => string) | undefined;

    expect(typeof resolveTier).toBe('function');
    if (typeof resolveTier !== 'function') return;

    expect(resolveTier('NFLX')).toBe('tier2');
  });

  it('should use 2022-01-01 as the Tier 1 8-K start date', async () => {
    const module = await loadBootstrap8kModule();
    const resolveDateRange = module?.resolve8kDateRange as
      | ((ticker: string, now?: Date) => { startDate: string; endDate: string })
      | undefined;

    expect(typeof resolveDateRange).toBe('function');
    if (typeof resolveDateRange !== 'function') return;

    expect(resolveDateRange('NVDA', new Date('2026-03-12T12:00:00.000Z'))).toEqual({
      startDate: '2022-01-01',
      endDate: '2026-03-12',
    });
  });

  it('should use 2024-01-01 as the Tier 2 8-K start date', async () => {
    const module = await loadBootstrap8kModule();
    const resolveDateRange = module?.resolve8kDateRange as
      | ((ticker: string, now?: Date) => { startDate: string; endDate: string })
      | undefined;

    expect(typeof resolveDateRange).toBe('function');
    if (typeof resolveDateRange !== 'function') return;

    expect(resolveDateRange('NFLX', new Date('2026-03-12T12:00:00.000Z'))).toEqual({
      startDate: '2024-01-01',
      endDate: '2026-03-12',
    });
  });
});
