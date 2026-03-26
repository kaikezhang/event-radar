import type { HistoricalContext } from '@event-radar/delivery';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { historicalEnrichmentTimeoutsTotal } from '../metrics.js';
import type { MarketContextCache } from '../services/market-context-cache.js';
import type { MarketQuote } from '../services/market-data-provider.js';

export type ConfidenceLevel = HistoricalContext['confidence'];

interface HistoricalTickerMarketDataSource {
  getOrFetch(symbol: string): Promise<MarketQuote | undefined>;
}

export interface HistoricalEnricherConfig {
  enabled?: boolean;
  minConfidence?: ConfidenceLevel;
  timeoutMs?: number;
  marketDataCache?: HistoricalTickerMarketDataSource;
}

export class HistoricalEnricher {
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor(
    _db: Database,
    _marketCache: MarketContextCache,
    config?: HistoricalEnricherConfig,
  ) {
    this.enabled =
      config?.enabled ?? process.env.HISTORICAL_ENRICHMENT_ENABLED !== 'false';
    this.timeoutMs =
      config?.timeoutMs ??
      parsePositiveInt(process.env.HISTORICAL_TIMEOUT_MS) ??
      2_000;
  }

  async enrich(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<HistoricalContext | null> {
    if (!this.enabled) {
      return null;
    }

    const timeout = Symbol('historical-timeout');
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race<
        HistoricalContext | null | typeof timeout
      >([
        this.doEnrich(event, llmResult),
        new Promise<typeof timeout>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(timeout), this.timeoutMs);
        }),
      ]);

      if (result === timeout) {
        historicalEnrichmentTimeoutsTotal.inc();
        return null;
      }

      return result;
    } catch (error) {
      console.error(
        '[historical-enricher] Error:',
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      if (timeoutHandle != null) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async doEnrich(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<HistoricalContext | null> {
    void event;
    void llmResult;
    return null;
  }
}

function parsePositiveInt(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
