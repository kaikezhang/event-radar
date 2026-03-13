import OpenAI from 'openai';
import {
  LLMEnrichmentSchema,
  type RawEvent,
  type IMarketRegimeService,
  type LLMEnrichment,
  type RegimeSnapshot,
} from '@event-radar/shared';

export interface LLMEnricherConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

const SYSTEM_PROMPT = `You are a stock market event analyst. Analyze events and respond ONLY with valid JSON (no markdown, no code fences). Use this exact schema:
{
  "summary": "1-2 sentence Chinese summary (简洁有力)",
  "impact": "1-2 sentences why this matters for investors (Chinese)",
  "action": "one of: 🔴 立即关注, 🟡 持续观察, 🟢 仅供参考",
  "tickers": [{"symbol": "TICKER", "direction": "bullish|bearish|neutral"}],
  "regimeContext": "1 sentence: how the current market regime amplifies or dampens this event's impact (Chinese, omit if no market context provided)"
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

  constructor(config?: LLMEnricherConfig, regimeService?: IMarketRegimeService) {
    const apiKey = config?.apiKey ?? process.env.LLM_GATEKEEPER_API_KEY ?? process.env.OPENAI_API_KEY;
    this.enabled = (config?.enabled ?? process.env.LLM_ENRICHMENT_ENABLED === 'true') && !!apiKey;
    this.model = config?.model ?? process.env.LLM_ENRICHMENT_MODEL ?? 'gpt-4o-mini';
    this.timeoutMs = config?.timeoutMs ?? numEnv('LLM_TIMEOUT_MS', 10_000);
    this.client = this.enabled && apiKey ? new OpenAI({ apiKey }) : null;
    this.regimeService = regimeService;
  }

  async enrich(event: RawEvent): Promise<LLMEnrichment | null> {
    if (!this.client) return null;

    let regimeSnapshot: RegimeSnapshot | undefined;
    if (this.regimeService) {
      try {
        regimeSnapshot = await this.regimeService.getRegimeSnapshot();
      } catch (err) {
        console.error('[llm-enricher] Failed to get regime snapshot:', err instanceof Error ? err.message : err);
      }
    }

    const userPrompt = buildPrompt(event, regimeSnapshot);

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
}

export function buildPrompt(event: RawEvent, regime?: RegimeSnapshot): string {
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
