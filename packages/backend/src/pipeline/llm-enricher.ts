import OpenAI from 'openai';
import {
  LLMEnrichmentSchema,
  type LlmClassificationResult,
  type RawEvent,
  type IMarketRegimeService,
  type LLMEnrichment,
  type RegimeSnapshot,
} from '@event-radar/shared';
import type { MarketSnapshot } from '../services/market-context-cache.js';
import type { MarketQuote } from '../services/market-data-provider.js';
import {
  extractPrimaryTicker,
  type PatternMatchResult,
} from '../services/pattern-matcher.js';

export interface LLMEnricherConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

interface TickerMarketDataSource {
  getOrFetch(symbol: string): Promise<MarketQuote | undefined>;
}

interface PatternStatsSource {
  findSimilar(
    event: RawEvent,
    options?: {
      llmResult?: LlmClassificationResult;
      marketSnapshot?: MarketSnapshot | null;
    },
  ): Promise<PatternMatchResult | null>;
}

interface MarketSnapshotProvider {
  get(): MarketSnapshot | null;
}

export interface LLMEnricherDependencies {
  regimeService?: IMarketRegimeService;
  marketDataCache?: TickerMarketDataSource;
  patternMatcher?: PatternStatsSource;
  marketSnapshotProvider?: MarketSnapshotProvider;
}

export interface LLMEnrichmentPromptContext {
  regime?: RegimeSnapshot;
  marketContext?: MarketQuote;
  patternMatch?: PatternMatchResult | null;
}

const SYSTEM_PROMPT = `You are a stock market event analyst. Produce concise, trader-usable intelligence in English and respond ONLY with valid JSON (no markdown, no code fences).

Rules:
- Reason from the event catalyst first, then current market setup, then historical analog stats.
- Keep each field specific and compact. No generic AI filler.
- Do not use BUY, SELL, or HOLD. Do not give personal financial advice.
- If market setup or historical analog data is unavailable, omit that field or return an empty string.

Use this exact schema:
{
  "summary": "1-2 sentence English summary of what happened",
  "impact": "1-2 sentence English trader takeaway on why the event matters",
  "whyNow": "1 concise sentence on why the setup matters right now",
  "currentSetup": "1 concise sentence on the current per-ticker market setup (omit if unavailable)",
  "historicalContext": "1 concise sentence on relevant historical pattern stats (omit if unavailable)",
  "risks": "1 concise sentence on the main invalidation or risk to this read",
  "action": "one of: 🔴 ACT NOW, 🟡 WATCH, 🟢 FYI",
  "tickers": [{"symbol": "TICKER", "direction": "bullish|bearish|neutral"}],
  "regimeContext": "1 sentence in English on how the current market regime amplifies or dampens this event's impact (omit if no market context provided)"
}`;

const REGIME_EXPLANATIONS: Record<string, string> = {
  extreme_overbought: 'Markets are extremely overbought — bad news has 2-3x amplified impact, good news may be muted.',
  overbought: 'Markets are running hot — negative catalysts hit harder (1.5x), positive catalysts discounted (0.7x).',
  neutral: 'Markets are in a neutral regime — events have standard impact.',
  oversold: 'Markets are oversold — positive catalysts are amplified (1.5x), negative catalysts dampened (0.7x).',
  extreme_oversold: 'Markets are extremely oversold — good news has 2-3x amplified impact as short covering accelerates.',
};

export class LLMEnricher {
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly timeoutMs: number;
  readonly enabled: boolean;
  private readonly regimeService?: IMarketRegimeService;
  private readonly marketDataCache?: TickerMarketDataSource;
  private readonly patternMatcher?: PatternStatsSource;
  private readonly marketSnapshotProvider?: MarketSnapshotProvider;

  constructor(
    config?: LLMEnricherConfig,
    dependencies?: IMarketRegimeService | LLMEnricherDependencies,
  ) {
    const apiKey = config?.apiKey ?? process.env.LLM_GATEKEEPER_API_KEY ?? process.env.OPENAI_API_KEY;
    this.enabled = (config?.enabled ?? process.env.LLM_ENRICHMENT_ENABLED === 'true') && !!apiKey;
    this.model = config?.model ?? process.env.LLM_ENRICHMENT_MODEL ?? 'gpt-4o-mini';
    this.timeoutMs = config?.timeoutMs ?? numEnv('LLM_TIMEOUT_MS', 10_000);
    this.client = this.enabled && apiKey ? new OpenAI({ apiKey }) : null;
    const resolvedDependencies = resolveDependencies(dependencies);
    this.regimeService = resolvedDependencies.regimeService;
    this.marketDataCache = resolvedDependencies.marketDataCache;
    this.patternMatcher = resolvedDependencies.patternMatcher;
    this.marketSnapshotProvider = resolvedDependencies.marketSnapshotProvider;
  }

  async enrich(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<LLMEnrichment | null> {
    if (!this.client) return null;

    const [regimeSnapshot, marketContext, patternMatch] = await Promise.all([
      this.loadRegimeSnapshot(),
      this.loadTickerMarketContext(event),
      this.loadPatternMatch(event, llmResult),
    ]);

    const userPrompt = buildPrompt(event, {
      regime: regimeSnapshot,
      marketContext: marketContext ?? undefined,
      patternMatch,
    });

    try {
      const response = await Promise.race([
        this.client.chat.completions.create({
          model: this.model,
          max_tokens: 512,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
        timeout(this.timeoutMs),
      ]);

      if (!response) return null;

      const text = response.choices[0]?.message?.content ?? '';
      if (!text) return null;

      const parsed = JSON.parse(text) as unknown;
      const validation = LLMEnrichmentSchema.safeParse(parsed);
      if (!validation.success) {
        console.error(
          `[llm-enricher] Invalid enrichment payload for event ${event.id}:`,
          validation.error.flatten(),
        );
        return null;
      }

      const usage = response.usage;
      console.log(`[llm-enricher] Enriched event ${event.id}: action=${validation.data.action}, tokens=${usage?.prompt_tokens ?? '?'}+${usage?.completion_tokens ?? '?'}`);
      return validation.data;
    } catch (err) {
      console.error(`[llm-enricher] Failed to enrich event ${event.id}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  private async loadRegimeSnapshot(): Promise<RegimeSnapshot | undefined> {
    if (!this.regimeService) {
      return undefined;
    }

    try {
      return await this.regimeService.getRegimeSnapshot();
    } catch (err) {
      console.error('[llm-enricher] Failed to get regime snapshot:', err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  private async loadTickerMarketContext(
    event: RawEvent,
  ): Promise<MarketQuote | undefined> {
    if (!this.marketDataCache) {
      return undefined;
    }

    const ticker = extractPrimaryTicker(event);
    if (!ticker) {
      return undefined;
    }

    try {
      return await this.marketDataCache.getOrFetch(ticker);
    } catch (err) {
      console.error(
        '[llm-enricher] Failed to get per-ticker market context:',
        err instanceof Error ? err.message : err,
      );
      return undefined;
    }
  }

  private async loadPatternMatch(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<PatternMatchResult | null> {
    if (!this.patternMatcher) {
      return null;
    }

    try {
      return await this.patternMatcher.findSimilar(event, {
        llmResult,
        marketSnapshot: this.marketSnapshotProvider?.get() ?? null,
      });
    } catch (err) {
      console.error(
        '[llm-enricher] Failed to get historical pattern stats:',
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
}

export function buildPrompt(
  event: RawEvent,
  context?: RegimeSnapshot | LLMEnrichmentPromptContext,
): string {
  const { regime, marketContext, patternMatch } = normalizePromptContext(context);
  const parts = [
    `Event: ${event.title}`,
    `Details: ${event.body}`,
    `Source: ${event.source}`,
  ];

  if (event.metadata && Object.keys(event.metadata).length > 0) {
    parts.push(`Metadata: ${JSON.stringify(event.metadata)}`);
  }

  if (regime) {
    const spreadBp = Math.round(regime.factors.yieldCurve.spread * 100);
    const invertedLabel = regime.factors.yieldCurve.inverted ? 'INVERTED' : 'normal';
    const explanation = REGIME_EXPLANATIONS[regime.label] ?? REGIME_EXPLANATIONS.neutral;

    parts.push('');
    parts.push('## Market Context');
    parts.push(`Current regime: ${regime.label} (score: ${regime.score})`);
    parts.push(`VIX: ${regime.factors.vix.value.toFixed(1)}, SPY RSI: ${regime.factors.spyRsi.value.toFixed(1)}, Yield Curve: ${spreadBp}bp (${invertedLabel})`);
    parts.push('');
    parts.push(`Consider this market context when analyzing the event's potential impact.`);
    parts.push(`A ${regime.label} market means ${explanation}`);
  }

  if (marketContext) {
    parts.push('');
    parts.push('## Current Market Setup');
    parts.push(`Ticker: ${marketContext.symbol}`);
    parts.push(`Price: ${marketContext.price.toFixed(2)}`);
    parts.push(
      `Performance: 1d ${formatPercent(marketContext.change1d)}, 5d ${formatPercent(marketContext.change5d)}, 20d ${formatPercent(marketContext.change20d)}`,
    );
    parts.push(
      `Positioning: volume ratio ${marketContext.volumeRatio.toFixed(1)}x, RSI14 ${marketContext.rsi14.toFixed(1)}`,
    );
    parts.push(
      `Levels: support ${marketContext.support.toFixed(2)}, resistance ${marketContext.resistance.toFixed(2)}, 52w range ${marketContext.low52w.toFixed(2)}-${marketContext.high52w.toFixed(2)}`,
    );
    parts.push('Use this setup to explain whether the stock is extended, weak, or ready to confirm.');
  }

  if (patternMatch && !patternMatch.suppressed) {
    parts.push('');
    parts.push('## Historical Pattern Stats');
    parts.push(
      `Matches: ${patternMatch.count} (confidence: ${patternMatch.confidenceLabel}, source: ${patternMatch.matchSource})`,
    );

    if (patternMatch.avgMoveT5 != null || patternMatch.avgMoveT20 != null) {
      parts.push(
        `Average move: 5-day ${formatPercent(patternMatch.avgMoveT5)}, 20-day ${formatPercent(patternMatch.avgMoveT20)}`,
      );
    }

    if (patternMatch.winRateT20 != null) {
      parts.push(`20-day win rate: ${Math.round(patternMatch.winRateT20 * 100)}%`);
    }

    if (patternMatch.bestCase) {
      parts.push(
        `Best case: ${patternMatch.bestCase.ticker} | ${patternMatch.bestCase.headline} | ${formatPercent(patternMatch.bestCase.moveT20)} over 20d`,
      );
    }

    if (patternMatch.worstCase) {
      parts.push(
        `Worst case: ${patternMatch.worstCase.ticker} | ${patternMatch.worstCase.headline} | ${formatPercent(patternMatch.worstCase.moveT20)} over 20d`,
      );
    }

    if (patternMatch.legacyContext?.patternSummary) {
      parts.push(`Pattern summary: ${patternMatch.legacyContext.patternSummary}`);
    }
  }

  return parts.join('\n');
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolveDependencies(
  dependencies?: IMarketRegimeService | LLMEnricherDependencies,
): LLMEnricherDependencies {
  if (!dependencies) {
    return {};
  }

  if (isRegimeService(dependencies)) {
    return { regimeService: dependencies };
  }

  return dependencies;
}

function isRegimeService(
  dependencies: IMarketRegimeService | LLMEnricherDependencies,
): dependencies is IMarketRegimeService {
  return typeof dependencies === 'object'
    && dependencies !== null
    && 'getRegimeSnapshot' in dependencies;
}

function normalizePromptContext(
  context?: RegimeSnapshot | LLMEnrichmentPromptContext,
): LLMEnrichmentPromptContext {
  if (!context) {
    return {};
  }

  if (isPromptContext(context)) {
    return context;
  }

  return { regime: context };
}

function isPromptContext(
  context: RegimeSnapshot | LLMEnrichmentPromptContext,
): context is LLMEnrichmentPromptContext {
  return 'regime' in context
    || 'marketContext' in context
    || 'patternMatch' in context;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return 'n/a';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
