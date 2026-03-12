import Anthropic from '@anthropic-ai/sdk';
import type { RawEvent } from '@event-radar/shared';

export interface LLMEnrichment {
  summary: string;
  impact: string;
  action: '🔴 立即关注' | '🟡 持续观察' | '🟢 仅供参考';
  tickers: Array<{ symbol: string; direction: 'bullish' | 'bearish' | 'neutral' }>;
}

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
  "tickers": [{"symbol": "TICKER", "direction": "bullish|bearish|neutral"}]
}`;

export class LLMEnricher {
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly timeoutMs: number;
  readonly enabled: boolean;

  constructor(config?: LLMEnricherConfig) {
    const apiKey = config?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.enabled = (config?.enabled ?? process.env.LLM_ENRICHMENT_ENABLED === 'true') && !!apiKey;
    this.model = config?.model ?? process.env.LLM_MODEL ?? 'claude-sonnet-4-20250514';
    this.timeoutMs = config?.timeoutMs ?? numEnv('LLM_TIMEOUT_MS', 10_000);
    this.client = this.enabled && apiKey ? new Anthropic({ apiKey }) : null;
  }

  async enrich(event: RawEvent): Promise<LLMEnrichment | null> {
    if (!this.client) return null;

    const userPrompt = buildPrompt(event);

    try {
      const response = await Promise.race([
        this.client.messages.create({
          model: this.model,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        timeout(this.timeoutMs),
      ]);

      if (!response) return null;

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const parsed = JSON.parse(text) as LLMEnrichment;

      // Validate action value
      const validActions = ['🔴 立即关注', '🟡 持续观察', '🟢 仅供参考'] as const;
      if (!validActions.includes(parsed.action as typeof validActions[number])) {
        parsed.action = '🟢 仅供参考';
      }

      console.log(`[llm-enricher] Enriched event ${event.id}: action=${parsed.action}, tokens=${response.usage.input_tokens}+${response.usage.output_tokens}`);
      return parsed;
    } catch (err) {
      console.error(`[llm-enricher] Failed to enrich event ${event.id}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
}

function buildPrompt(event: RawEvent): string {
  const parts = [
    `Event: ${event.title}`,
    `Details: ${event.body}`,
    `Source: ${event.source}`,
  ];

  if (event.metadata && Object.keys(event.metadata).length > 0) {
    parts.push(`Metadata: ${JSON.stringify(event.metadata)}`);
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
